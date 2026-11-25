"use strict";

// Keep runtime
(function attachPlayAuthoringBoundary(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayAuthoringBoundary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayAuthoringBoundary() {
  function create(clone) {
    if (typeof clone !== "function") throw new TypeError("An authoring boundary requires a clone function.");
    let original = null;
    let selection = null;
    return {
      get active() { return original !== null; },
      get original() { return original; },
      enter(mode, currentSelection = {}) {
        if (original !== null) return null;
        original = mode;
        selection = { ...currentSelection };
        return clone(mode);
      },
      exit() {
        if (original === null) return null;
        const restored = { mode: original, selection };
        original = null;
        selection = null;
        return restored;
      }
    };
  }
  return { create };
});
