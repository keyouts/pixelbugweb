"use strict";
// Sprite presentation
(function attachPlayScenePresenter(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayScenePresenter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayScenePresenter() {
  function frame(ctx, metrics, x, y, width = metrics?.w, height = metrics?.h, facing = 1) {
    if (!ctx || !metrics?.canvas || !width || !height) return false;
    ctx.save();
    if (facing < 0) { ctx.translate(x + width, y); ctx.scale(-1, 1); x = 0; y = 0; }
    ctx.drawImage(metrics.canvas, metrics.sx || 0, metrics.sy || 0,
      metrics.sw || metrics.canvas.width, metrics.sh || metrics.canvas.height,
      x, y, width, height);
    ctx.restore();
    return true;
  }
  function actor(ctx, metrics, base, x, y, facing) {
    const alignedY = Math.round(y + (base?.h || metrics.h) - metrics.h);
    return frame(ctx, metrics, x, alignedY, metrics.w, metrics.h, facing);
  }
  return { frame, actor };
});
