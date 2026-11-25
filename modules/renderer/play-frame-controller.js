"use strict";

(function attachPlayFrameController(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayFrameController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayFrameController() {
  function advance({ clock, core, now, paused = false, simulate, draw, inspect, schedule }) {
    if (!clock || !core || typeof simulate !== "function" || typeof draw !== "function")
      throw new TypeError("Play frame controller requires a clock, core, simulation, and renderer.");
    if (paused) core.resetSimulationClock(clock);
    const result = paused ? { steps: 0, dropped: 0, alpha: 0 } :
      core.advanceSimulationClock(clock, now, () => simulate(now));
    inspect?.();
    draw();
    schedule?.();
    return result;
  }
  function singleStep({ now, simulate, draw, inspect }) {
    simulate(now);
    inspect?.();
    draw();
  }
  return { advance, singleStep };
});
