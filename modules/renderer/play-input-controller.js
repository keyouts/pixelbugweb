"use strict";

(function attachPlayInputController(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayInputController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayInputController() {
  function readGamepad(pads) {
    const pad = Array.from(pads || []).find(Boolean);
    if (!pad) return { left: false, right: false, up: false, down: false, jump: false, interact: false };
    const x = Number(pad.axes?.[0]) || 0;
    const y = Number(pad.axes?.[1]) || 0;
    return {
      left: x < -0.35 || pad.buttons?.[14]?.pressed === true,
      right: x > 0.35 || pad.buttons?.[15]?.pressed === true,
      up: y < -0.35 || pad.buttons?.[12]?.pressed === true,
      down: y > 0.35 || pad.buttons?.[13]?.pressed === true,
      jump: pad.buttons?.[0]?.pressed === true,
      interact: pad.buttons?.[1]?.pressed === true || pad.buttons?.[2]?.pressed === true
    };
  }
  function directions(keys = {}, pad = {}, disabled = false) {
    return {
      left: !disabled && Boolean(keys.ArrowLeft || keys.KeyA || pad.left),
      right: !disabled && Boolean(keys.ArrowRight || keys.KeyD || pad.right),
      up: !disabled && Boolean(keys.ArrowUp || keys.KeyW || pad.up),
      down: !disabled && Boolean(keys.ArrowDown || keys.KeyS || pad.down),
      jump: !disabled && Boolean(keys.Space || pad.jump)
    };
  }
  return { readGamepad, directions };
});
