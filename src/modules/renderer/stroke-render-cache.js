(() => {
  "use strict";

  function create() {
    let bounds = null;

    function note(x, y) {
      const px = Math.trunc(Number(x));
      const py = Math.trunc(Number(y));
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      if (!bounds) bounds = { minX: px, minY: py, maxX: px, maxY: py };
      else {
        bounds.minX = Math.min(bounds.minX, px);
        bounds.minY = Math.min(bounds.minY, py);
        bounds.maxX = Math.max(bounds.maxX, px);
        bounds.maxY = Math.max(bounds.maxY, py);
      }
    }

    function take(width, height, padding = 1) {
      if (!bounds) return null;
      const current = bounds;
      bounds = null;
      const pad = Math.max(0, Math.trunc(Number(padding)) || 0);
      const maxWidth = Math.max(1, Math.trunc(Number(width)) || 1);
      const maxHeight = Math.max(1, Math.trunc(Number(height)) || 1);
      const x = Math.max(0, current.minX - pad);
      const y = Math.max(0, current.minY - pad);
      const right = Math.min(maxWidth, current.maxX + pad + 1);
      const bottom = Math.min(maxHeight, current.maxY + pad + 1);
      return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
    }

    function clear() { bounds = null; }
    function pending() { return bounds ? { ...bounds } : null; }

    return Object.freeze({ note, take, clear, pending });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugStrokeRenderCache = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
