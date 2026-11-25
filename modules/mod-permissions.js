(() => {
  const ALLOWED = Object.freeze(["canvas.read", "pixels.write", "play-ui.write"]);
  const LABELS = Object.freeze({
    "canvas.read": "Read the current canvas",
    "pixels.write": "Return changed preview pixels",
    "play-ui.write": "Change Play Mode interface settings"
  });

  function sanitize(value) {
    const source = Array.isArray(value) ? value : [];
    return [...new Set(source.map(item => String(item || "")).filter(item => ALLOWED.includes(item)))];
  }

  function requiredForPack(pack) {
    const required = [];
    if (String(pack?.brushCode || "").trim() || String(pack?.effectCode || "").trim()) required.push("canvas.read", "pixels.write");
    if (pack?.playUi || String(pack?.playUiCode || "").trim()) required.push("play-ui.write");
    return sanitize(required);
  }

  function manifest(pack) {
    const requested = sanitize(pack?.permissions || pack?.manifest?.permissions);
    const required = requiredForPack(pack);
    return { permissions: sanitize([...requested, ...required]) };
  }

  function authorize(granted, required) {
    const available = new Set(sanitize(granted));
    const missing = sanitize(required).filter(permission => !available.has(permission));
    return { ok: missing.length === 0, missing };
  }

  function describe(permissions) {
    return sanitize(permissions).map(permission => LABELS[permission]);
  }

  const api = Object.freeze({ ALLOWED, LABELS, authorize, describe, manifest, requiredForPack, sanitize });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModPermissions = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
