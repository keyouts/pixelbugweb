"use strict";

// Runtime core
(function attachPlayRuntimeCore(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayRuntimeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayRuntimeCore() {
  const REFERENCE_FPS = 60;

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(finite(value, minimum), maximum));
  }

  function frameDelta(now, previous, fallback = 1 / REFERENCE_FPS) {
    const current = finite(now, 0);
    const before = finite(previous, 0);
    if (current <= 0 || before <= 0 || current <= before) return fallback;
    return clamp((current - before) / 1000, 1 / 1000, 0.05);
  }

  function physics(playMode = {}) {
    const moveUnits = clamp(finite(playMode.moveSpeed, 3), 0.25, 20);
    const jumpUnits = clamp(finite(playMode.jumpStrength, 8), 0.5, 30);
    const gravityUnits = clamp(finite(playMode.gravity, 0.45), 0.05, 4);
    const scrollUnits = clamp(finite(playMode.scrollSpeed, 0), 0, 20);
    return {
      moveSpeed: moveUnits * REFERENCE_FPS,
      jumpSpeed: jumpUnits * REFERENCE_FPS,
      gravity: gravityUnits * REFERENCE_FPS * REFERENCE_FPS,
      scrollSpeed: scrollUnits * REFERENCE_FPS
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function advanceAxis(position, velocity, seconds) {
    return finite(position, 0) + finite(velocity, 0) * clamp(seconds, 0, 0.05);
  }

  function advanceVelocity(velocity, acceleration, seconds) {
    return finite(velocity, 0) + finite(acceleration, 0) * clamp(seconds, 0, 0.05);
  }

  function autoScroll(cameraX, maxCameraX, scrollSpeed, seconds) {
    const current = clamp(cameraX, 0, Math.max(0, finite(maxCameraX, 0)));
    const next = current + Math.max(0, finite(scrollSpeed, 0)) * clamp(seconds, 0, 0.05);
    return clamp(next, 0, Math.max(0, finite(maxCameraX, 0)));
  }

  function smoothingAlpha(referenceAlpha, seconds) {
    const alpha = clamp(referenceAlpha, 0, 1);
    const frames = clamp(seconds, 0, 0.05) * REFERENCE_FPS;
    return frames > 0 ? 1 - Math.pow(1 - alpha, frames) : 0;
  }

  return { REFERENCE_FPS, finite, clamp, frameDelta, physics, rectsOverlap, advanceAxis, advanceVelocity, autoScroll, smoothingAlpha };
});
