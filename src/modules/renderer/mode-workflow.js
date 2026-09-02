(() => {
  const transitionOrder = Object.freeze({
    mod: Object.freeze(["play", "voxel", "print"]),
    play: Object.freeze(["mod", "voxel", "print"]),
    voxel: Object.freeze(["mod", "play", "print"]),
    print: Object.freeze(["mod", "play", "voxel"])
  });

  function create(options = {}) {
    const deactivate = options.deactivate || {};

    function leave(modes) {
      modes.forEach(mode => deactivate[mode]?.());
    }

    function beforeEnter(mode) {
      const modes = transitionOrder[mode];
      if (!modes) throw new Error(`Unknown editor mode: ${mode}`);
      leave(modes);
    }

    return Object.freeze({ beforeEnter, leave });
  }

  const api = Object.freeze({ create, transitionOrder });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModeWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
