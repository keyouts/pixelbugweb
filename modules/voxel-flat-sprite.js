"use strict";

// Flat rendering
(function attachVoxelFlatSprite(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelFlatSprite = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function render({ faces, width, height, makeCanvas, opacityForPart }) {
    if (!Array.isArray(faces) || !faces.length) return null;
    if (faces.length > 180000) throw new Error("This pose has too many visible faces for flat capture. Hide unrelated Parts or capture a simpler model.");
    const tw = Math.max(1, Math.floor(Number(width) || 1));
    const th = Math.max(1, Math.floor(Number(height) || 1));
    if (tw * th > 4194304) throw new Error("The Base frame is too large for pose capture.");
    const extent = Math.max(tw, th);
    const size = Math.max(640, Math.min(1024, extent * 6));
    const canvas = makeCanvas();
    canvas.width = Math.max(1, Math.round(size * tw / extent));
    canvas.height = Math.max(1, Math.round(size * th / extent));
    const ctx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
    if (!ctx) throw new Error("The flat sprite renderer is unavailable.");
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const face of faces) for (const point of face.points) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
    if (!Number.isFinite(left + top + right + bottom)) throw new Error("The posed model cannot be projected.");
    const margin = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * .055));
    const scale = Math.min((canvas.width - margin * 2) / Math.max(1, right - left), (canvas.height - margin * 2) / Math.max(1, bottom - top));
    if (!(scale > 0)) return null;
    const centerX = (canvas.width - (right - left) * scale) / 2;
    const centerY = (canvas.height - (bottom - top) * scale) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    for (const face of faces) {
      ctx.beginPath();
      for (let index = 0; index < face.points.length; index++) {
        const point = face.points[index];
        const x = centerX + (point.x - left) * scale;
        const y = centerY + (point.y - top) * scale;
        if (!index) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = face.color;
      const opacity = Number(opacityForPart?.(face.partId));
      ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    canvas.capturePalette = [...new Set(faces.map(face => face.color))];
    return canvas;
  }
  function capture({ descriptors, faceFor, visible, width, height, makeCanvas, opacityForPart }) {
    if (!Array.isArray(descriptors) || !descriptors.length) return null;
    if (descriptors.length > 180000) throw new Error("This pose is too dense for a detailed flat capture. Hide unrelated Parts and capture the character alone.");
    const cache = new WeakMap();
    const faces = [];
    for (const { cube, faceName } of descriptors) {
      const face = faceFor(cube, faceName, cache);
      if (!visible(face.normal)) continue;
      faces.push({ points: face.points, normal: face.normal, depth: face.depth, color: cube.color, partId: cube.partId });
    }
    faces.sort((a, b) => a.depth - b.depth);
    return render({ faces, width, height, makeCanvas, opacityForPart });
  }
  return { render, capture };
});
