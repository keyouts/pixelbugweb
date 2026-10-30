(() => {
  "use strict";

  const MAX_CODE_CHARS = 12000;
  const BLOCKED_API = /\b(?:window|document|globalThis|pixelBug|localStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|Function|eval|importScripts|navigator|constructor|prototype|__proto__)\b/;

  function validate(code) {
    const text = String(code || "");
    if (text.length > MAX_CODE_CHARS) throw new Error("Code too long.");
    if (BLOCKED_API.test(text)) throw new Error("Blocked API.");
    return text;
  }

  const api = Object.freeze({ BLOCKED_API, MAX_CODE_CHARS, validate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModCodePolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
