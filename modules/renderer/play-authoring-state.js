(() => {
  function defaultPlayVisualLayers() {
    return [
      { id: "sky", name: "Sky", role: "background", frame: -1, scale: 8, parallax: 0.04, y: 0, opacity: 1, repeatX: false, visible: true, fit: "cover" },
      { id: "far", name: "Far BG", role: "background", frame: -1, scale: 5, parallax: 0.16, y: 72, opacity: 0.72, repeatX: true, visible: true, fit: "tile" },
      { id: "mid", name: "Mid BG", role: "background", frame: -1, scale: 4, parallax: 0.38, y: 180, opacity: 0.9, repeatX: true, visible: true, fit: "tile" },
      { id: "front", name: "Foreground", role: "foreground", frame: -1, scale: 4, parallax: 0.82, y: 276, opacity: 1, repeatX: true, visible: true, fit: "tile" },
      { id: "overlay", name: "OVERLAY", role: "overlay", frame: -1, scale: 6, parallax: 0, y: 0, opacity: 1, repeatX: false, visible: false, fit: "cover" }
    ];
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampFiniteNumber(value, fallback, min, max) {
    return Math.max(min, Math.min(finiteNumber(value, fallback), max));
  }

  function clampPlayLayer(layer, index = 0, frameCount = 1) {
    const defaults = defaultPlayVisualLayers();
    const base = defaults[index] || defaults[0];
    const next = { ...base, ...(layer || {}) };
    next.name = next.name || base.name;
    next.role = ["background", "foreground", "overlay"].includes(next.role) ? next.role : base.role;
    if (next.role === "overlay") {
      next.name = "OVERLAY";
      next.repeatX = false;
      next.fit = "cover";
      next.parallax = 0;
    }
    next.frame = Number.isFinite(Number(next.frame)) ? Math.max(-1, Math.min(Number(next.frame), Number(frameCount) - 1)) : -1;
    next.scale = clampFiniteNumber(next.scale, base.scale, 0.5, 32);
    next.parallax = clampFiniteNumber(next.parallax, 0, -4, 4);
    next.y = clampFiniteNumber(next.y, 0, -1024, 2160);
    next.opacity = Math.max(0, Math.min(Number(next.opacity ?? 1), 1));
    next.repeatX = next.repeatX !== false;
    next.visible = next.visible !== false;
    next.fit = ["cover", "contain", "stretch", "tile"].includes(next.fit) ? next.fit : "tile";
    return next;
  }

  function makeDialogueCharacter(name = "Character", frame = 0, position = "left", role = "npc") {
    return { id: `char-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, frame, position, role, scale: 3, flip: false, visible: true, startLine: 0 };
  }

  function defaultDialogueState() {
    const first = { id: "char-a", name: "Character A", frame: 0, position: "left", role: "actor", scale: 3, flip: false, visible: false, startLine: 0 };
    const second = { id: "char-b", name: "Character B", frame: 0, position: "right", role: "npc", scale: 3, flip: true, visible: true, startLine: 1 };
    return {
      enabled: false,
      currentLine: 0,
      typewriter: true,
      characters: [first, second],
      lines: [
        { characterId: first.id, speaker: first.name, text: "Hello! This is a test line.", frame: 0, nextLine: 1 },
        { characterId: second.id, speaker: second.name, text: "Swap frames and text to mock up a conversation.", frame: 0, nextLine: -1 }
      ]
    };
  }

  function playSceneId(value = "") {
    const clean = String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return clean || `scene-${Date.now().toString(36)}`;
  }

  function normalizePlayAudioRecord(audio = {}, helper = null) {
    const source = String(audio.dataUrl || "");
    const maxChars = helper?.MAX_AUDIO_CHARS || 17 * 1024 * 1024;
    const withinBytes = helper?.dataUrlByteLength ? helper.dataUrlByteLength(source) <= (helper.MAX_FILE_BYTES || 12 * 1024 * 1024) : true;
    const dataUrl = /^data:audio\/(?:wav|wave|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a);base64,[a-z0-9+/=]+$/i.test(source) && source.length <= maxChars && withinBytes ? source : "";
    return { assetId: String(audio.assetId || "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48), name: String(audio.name || "").slice(0, 120), dataUrl, volume: Math.max(0, Math.min(Number(audio.volume) || 0.7, 1)), loop: audio.loop !== false };
  }

  function normalizePlayAudioAsset(asset = {}, index = 0, helper = null) {
    if (helper?.normalizeAsset) return helper.normalizeAsset(asset, index);
    return { id: String(asset.id || `audio-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48), name: String(asset.name || `Audio ${index + 1}`).slice(0, 64), kind: asset.kind === "music" ? "music" : "sfx", dataUrl: /^data:audio\/(?:wav|wave|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a);base64,[a-z0-9+/=]+$/i.test(String(asset.dataUrl || "")) ? String(asset.dataUrl).slice(0, 17 * 1024 * 1024) : "", duration: Math.max(0, Math.min(Number(asset.duration) || 0, 600)), volume: Math.max(0, Math.min(Number(asset.volume) || 1, 1)), loop: asset.loop === true };
  }

  function defaultPlayUiMod() {
    return {
      dialogueBoxColor: "rgba(15,15,15,0.94)",
      dialogueInkColor: "#f7f0da",
      dialogueBorderColor: "#f7f0da",
      dialogueBorderWidth: 4,
      dialogueFont: "system-ui, sans-serif",
      dialogueNameSize: 16,
      dialogueTextSize: 15,
      dialogueMargin: 0.035,
      dialogueBoxHeight: 0.28,
      dialoguePortrait: true,
      dialogueCounter: true
    };
  }

  function clampNumber(value, fallback, min, max) {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(min, Math.min(next, max)) : fallback;
  }

  function cleanCssColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(text)) return text;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(text)) return text;
    return fallback;
  }

  function cleanFontFamily(value, fallback) {
    const text = String(value || "").trim();
    if (!text || text.length > 80 || /[;{}<>]/.test(text)) return fallback;
    return text;
  }

  function normalizePlayUiMod(input = {}) {
    const base = defaultPlayUiMod();
    return {
      dialogueBoxColor: cleanCssColor(input.dialogueBoxColor, base.dialogueBoxColor),
      dialogueInkColor: cleanCssColor(input.dialogueInkColor, base.dialogueInkColor),
      dialogueBorderColor: cleanCssColor(input.dialogueBorderColor, base.dialogueBorderColor),
      dialogueBorderWidth: clampNumber(input.dialogueBorderWidth, base.dialogueBorderWidth, 0, 16),
      dialogueFont: cleanFontFamily(input.dialogueFont, base.dialogueFont),
      dialogueNameSize: clampNumber(input.dialogueNameSize, base.dialogueNameSize, 8, 32),
      dialogueTextSize: clampNumber(input.dialogueTextSize, base.dialogueTextSize, 8, 30),
      dialogueMargin: clampNumber(input.dialogueMargin, base.dialogueMargin, 0.01, 0.12),
      dialogueBoxHeight: clampNumber(input.dialogueBoxHeight, base.dialogueBoxHeight, 0.18, 0.55),
      dialoguePortrait: input.dialoguePortrait !== false,
      dialogueCounter: input.dialogueCounter !== false
    };
  }

  function parsePlayUiModCode(code, inspect = null) {
    const text = String(code || "").trim();
    if (!text) return defaultPlayUiMod();
    if (text.length > 6000) throw new Error("Play UI settings too long.");
    const parsed = JSON.parse(text);
    if (typeof inspect === "function") inspect(parsed, { maxDepth: 12, maxValues: 256, maxStringChars: 6000 });
    return normalizePlayUiMod(parsed);
  }

  function stringifyPlayUiMod(ui = {}) {
    return JSON.stringify(normalizePlayUiMod(ui || {}), null, 2);
  }

  const api = Object.freeze({ defaultPlayVisualLayers, finiteNumber, clampFiniteNumber, clampPlayLayer, makeDialogueCharacter, defaultDialogueState, playSceneId, normalizePlayAudioRecord, normalizePlayAudioAsset, defaultPlayUiMod, normalizePlayUiMod, parsePlayUiModCode, stringifyPlayUiMod });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPlayAuthoringState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
