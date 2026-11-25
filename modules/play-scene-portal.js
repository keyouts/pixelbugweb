"use strict";

// Portal coordinates
(function attachPlayScenePortal(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayScenePortal = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayScenePortal() {
  function optionalCoordinate(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function entry(prop = {}, destination = {}) {
    const x = optionalCoordinate(prop.targetX), other = optionalCoordinate(prop.targetY);
    if (destination.worldType === "voxel3d") return { x, z: other };
    return { x, y: other };
  }
  return { entry };
});
