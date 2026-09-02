(() => {
  const RESERVED = new Set([
    "Alt+F4",
    "Ctrl+Q",
    "Ctrl+R",
    "Ctrl+Shift+R",
    "Ctrl+W",
    "Ctrl+Shift+W",
    "Ctrl+L",
    "Ctrl+U",
    "Ctrl+Shift+I",
    "Ctrl+Shift+J",
    "F5",
    "F11",
    "F12"
  ]);

  function normalize(combo) {
    const text = String(combo || "").trim();
    if (!text || text.length > 48) return "";
    const parts = text.split("+").map(part => part.trim()).filter(Boolean);
    const key = parts.pop();
    if (!key) return "";
    const modifiers = [];
    if (parts.some(part => /^(ctrl|meta|cmd|command)$/i.test(part))) modifiers.push("Ctrl");
    if (parts.some(part => /^alt$/i.test(part))) modifiers.push("Alt");
    if (parts.some(part => /^shift$/i.test(part))) modifiers.push("Shift");
    let label = key.length === 1 ? key.toUpperCase() : key;
    if (/^esc$/i.test(label)) label = "Escape";
    if (/^space(bar)?$/i.test(label)) label = "Space";
    if (/^del$/i.test(label)) label = "Delete";
    return [...modifiers, label].join("+");
  }

  function validate(action, combo, shortcuts = {}) {
    const value = normalize(combo);
    if (!value) return { ok: false, error: "Press a non-modifier key." };
    if (RESERVED.has(value)) return { ok: false, error: `${value} is reserved by the application or operating system.` };
    const conflict = Object.entries(shortcuts).find(([key, assigned]) => key !== action && normalize(assigned) === value);
    if (conflict) return { ok: false, error: `${value} is already assigned.`, conflict: conflict[0] };
    return { ok: true, value };
  }

  function sanitize(shortcuts, defaults) {
    const base = defaults && typeof defaults === "object" ? defaults : {};
    const source = shortcuts && typeof shortcuts === "object" && !Array.isArray(shortcuts) ? shortcuts : {};
    const result = {};
    for (const [action, fallback] of Object.entries(base)) {
      const candidate = normalize(source[action]);
      const checked = candidate ? validate(action, candidate, result) : { ok: false };
      result[action] = checked.ok ? checked.value : normalize(fallback);
    }
    return result;
  }

  const api = Object.freeze({ RESERVED, normalize, sanitize, validate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugShortcutPreferences = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
