"use strict";

// Sprite assignment
(function attachPlaySpriteSourceController(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlaySpriteSourceController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaySpriteSourceController() {
  function selectPlayerFrame(mode, index, count) {
    if (!mode || !Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) return false;
    mode.idleFrame = index;
    mode.walkFrame = index;
    mode.jumpFrame = index;
    mode.runFrame = null;
    mode.riseFrame = null;
    mode.fallFrame = null;
    return true;
  }
  return { selectPlayerFrame };
});
