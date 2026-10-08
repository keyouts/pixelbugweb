(() => {
  const STORAGE_KEY = "pixel-bug-accessibility-v2";
  const LEGACY_STORAGE_KEY = "pixel-bug-accessibility-v1";
  const CLASS_MAP = Object.freeze({
    reduceMotion: "a11y-reduced-motion",
    strongFocus: "a11y-strong-focus",
    largeTargets: "a11y-large-targets",
    boldText: "a11y-bold-text",
    reduceItalics: "a11y-reduce-italics",
    highContrast: "a11y-high-contrast",
    reduceTransparency: "a11y-reduce-transparency",
    reduceShadows: "a11y-reduce-shadows",
    clearerSelection: "a11y-clearer-selection"
  });
  const FONT_PRESETS = Object.freeze({
    system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    readable: 'Verdana, Tahoma, Arial, sans-serif',
    humanist: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
    atkinson: '"Atkinson Hyperlegible", Verdana, Arial, sans-serif',
    dyslexic: 'OpenDyslexic, Verdana, Arial, sans-serif'
  });
  const TEXT_SIZE_PRESETS = Object.freeze({ compact: 0.95, standard: 1, large: 1.1, larger: 1.2 });
  const LINE_SPACING_PRESETS = Object.freeze({ standard: 1.35, roomy: 1.5, widest: 1.65 });
  const LETTER_SPACING_PRESETS = Object.freeze({ standard: "0em", wide: "0.02em", wider: "0.04em" });
  const WEIGHT_PRESETS = Object.freeze({ standard: 400, semibold: 600, bold: 700 });

  function defaults() {
    return {
      reduceMotion: Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
      strongFocus: false,
      largeTargets: false,
      boldText: false,
      fontPreset: "system",
      textSize: "standard",
      lineSpacing: "standard",
      letterSpacing: "standard",
      textWeight: "standard",
      reduceItalics: false,
      highContrast: false,
      reduceTransparency: false,
      reduceShadows: false,
      clearerSelection: false,
      announceActions: true
    };
  }

  function cleanPreset(value, map, fallback) {
    return Object.hasOwn(map, value) ? value : fallback;
  }

  function sanitize(value) {
    const base = defaults();
    if (!value || typeof value !== "object" || Array.isArray(value)) return base;
    const textWeight = cleanPreset(value.textWeight, WEIGHT_PRESETS, base.textWeight);
    return {
      reduceMotion: typeof value.reduceMotion === "boolean" ? value.reduceMotion : base.reduceMotion,
      strongFocus: value.strongFocus === true,
      largeTargets: value.largeTargets === true,
      boldText: value.boldText === true,
      fontPreset: cleanPreset(value.fontPreset, FONT_PRESETS, base.fontPreset),
      textSize: cleanPreset(value.textSize, TEXT_SIZE_PRESETS, base.textSize),
      lineSpacing: cleanPreset(value.lineSpacing, LINE_SPACING_PRESETS, base.lineSpacing),
      letterSpacing: cleanPreset(value.letterSpacing, LETTER_SPACING_PRESETS, base.letterSpacing),
      textWeight,
      reduceItalics: value.reduceItalics === true,
      highContrast: value.highContrast === true,
      reduceTransparency: value.reduceTransparency === true,
      reduceShadows: value.reduceShadows === true,
      clearerSelection: value.clearerSelection === true,
      announceActions: value.announceActions !== false
    };
  }

  function load(storage = globalThis.localStorage) {
    try {
      const current = storage?.getItem?.(STORAGE_KEY);
      const legacy = current == null ? storage?.getItem?.(LEGACY_STORAGE_KEY) : null;
      return sanitize(JSON.parse(current || legacy || "null"));
    } catch (_error) {
      return defaults();
    }
  }

  function save(preferences, storage = globalThis.localStorage) {
    const next = sanitize(preferences);
    try { storage?.setItem?.(STORAGE_KEY, JSON.stringify(next)); } catch (_error) {}
    return next;
  }

  function apply(preferences, root = globalThis.document?.documentElement) {
    const next = sanitize(preferences);
    if (!root?.classList) return next;
    for (const [key, className] of Object.entries(CLASS_MAP)) root.classList.toggle(className, next[key]);
    root.classList.toggle("a11y-text-semibold", !next.boldText && next.textWeight === "semibold");
    root.classList.toggle("a11y-text-bold", !next.boldText && next.textWeight === "bold");
    root.style?.setProperty?.("--ui-font-family", FONT_PRESETS[next.fontPreset]);
    root.style?.setProperty?.("--a11y-text-scale", String(TEXT_SIZE_PRESETS[next.textSize]));
    root.style?.setProperty?.("--a11y-line-height", String(LINE_SPACING_PRESETS[next.lineSpacing]));
    root.style?.setProperty?.("--a11y-letter-spacing", LETTER_SPACING_PRESETS[next.letterSpacing]);
    root.style?.setProperty?.("--a11y-font-weight", String(next.boldText ? 900 : WEIGHT_PRESETS[next.textWeight]));
    return next;
  }

  const api = Object.freeze({
    CLASS_MAP,
    FONT_PRESETS,
    LETTER_SPACING_PRESETS,
    LINE_SPACING_PRESETS,
    STORAGE_KEY,
    TEXT_SIZE_PRESETS,
    WEIGHT_PRESETS,
    apply,
    defaults,
    load,
    sanitize,
    save
  });
  if (typeof globalThis !== "undefined") globalThis.PixelBugAccessibilityPreferences = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
