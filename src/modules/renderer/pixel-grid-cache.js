(() => {
  "use strict";

  function create() {
    let cache = new WeakMap();

    function count(pixels) {
      if (!Array.isArray(pixels)) return 0;
      const cached = cache.get(pixels);
      if (cached) return cached.count;
      let painted = 0;
      for (let y = 0; y < pixels.length; y++) {
        const row = pixels[y];
        if (!Array.isArray(row)) continue;
        for (let x = 0; x < row.length; x++) if (row[x]) painted++;
      }
      cache.set(pixels, { count: painted });
      return painted;
    }

    function hasPaint(pixels) {
      return count(pixels) > 0;
    }

    function noteMutation(pixels, previous, next) {
      if (!Array.isArray(pixels)) return;
      const cached = cache.get(pixels);
      if (!cached) return;
      const hadPaint = Boolean(previous);
      const hasNextPaint = Boolean(next);
      if (hadPaint === hasNextPaint) return;
      cached.count = Math.max(0, cached.count + (hasNextPaint ? 1 : -1));
    }

    function reset() {
      cache = new WeakMap();
    }

    return Object.freeze({ count, hasPaint, noteMutation, reset });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPixelGridCache = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
