"use strict";

// Play viewport
(function attachPlayViewportController(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayViewportController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayViewportController() {
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function dimensions(mode = {}) {
    return { width: clamp(finite(mode.sceneWidth, 640), 160, 4096), height: clamp(finite(mode.sceneHeight, 360), 120, 2160) };
  }
  function worldWidth(mode = {}, canvasWidth = 640) {
    return Math.max(canvasWidth, Math.min(finite(mode.worldWidth, Math.max(1600, canvasWidth)), 20000));
  }
  function clampCamera(cameraX, maxWorldWidth, canvasWidth) {
    return clamp(finite(cameraX, 0), 0, Math.max(0, maxWorldWidth - canvasWidth));
  }
  function updateCamera({ cameraX = 0, actorX = 0, actorWidth = 0, canvasWidth = 640,
    maxWorldWidth = 1600, running = false, seconds = 0, follow = true,
    autoScroll = false, scrollSpeed = 0, smoothingAlpha = null } = {}) {
    const maximum = Math.max(0, maxWorldWidth - canvasWidth);
    const previous = clampCamera(cameraX, maxWorldWidth, canvasWidth);
    let next = previous;
    if (follow) {
      const center = finite(actorX, 0) + Math.max(0, finite(actorWidth, 0)) / 2;
      const leftInset = Math.max(44, canvasWidth * .28);
      const rightInset = Math.max(44, canvasWidth * .34);
      let target = next;
      if (center < next + leftInset) target = center - leftInset;
      if (center > next + canvasWidth - rightInset) target = center - canvasWidth + rightInset;
      target = clamp(target, 0, maximum);
      if (!running) next = target;
      else if (seconds > 0) {
        const alpha = typeof smoothingAlpha === "function" ? smoothingAlpha(.22, seconds) : 1 - Math.pow(.78, seconds * 60);
        next += (target - next) * clamp(alpha, 0, 1);
      }
    }
    if (autoScroll && seconds > 0) next += Math.max(0, finite(scrollSpeed, 0)) * Math.max(0, seconds);
    next = clamp(next, 0, maximum);
    return { cameraX: next, actorPush: autoScroll ? Math.max(0, next - previous) : 0 };
  }
  function screenX(x, cameraX) { return Math.round(finite(x, 0) - finite(cameraX, 0)); }
  function worldX(x, cameraX) { return Math.round(finite(x, 0) + finite(cameraX, 0)); }
  return { dimensions, worldWidth, clampCamera, updateCamera, screenX, worldX };
});
