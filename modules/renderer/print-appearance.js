(() => {
  "use strict";

  const blendModes = Object.freeze(["source-over", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion"]);
  const clamp = (value, min, max, fallback) => Math.max(min, Math.min(Number.isFinite(Number(value)) ? Number(value) : fallback, max));
  const blendMode = value => blendModes.includes(value) ? value : "source-over";

  function create(input = {}) {
    return {
      visible: input.visible !== false,
      x: Number(input.x) || 0,
      y: Number(input.y) || 0,
      scale: clamp(input.scale, 0.1, 4, 1),
      rotation: clamp(input.rotation, -180, 180, 0),
      opacity: clamp(input.opacity, 0, 1, 1),
      blendMode: blendMode(input.blendMode),
      brightness: clamp(input.brightness, 0, 2, 1),
      contrast: clamp(input.contrast, 0, 2, 1),
      saturation: clamp(input.saturation, 0, 3, 1),
      hue: clamp(input.hue, -180, 180, 0),
      grayscale: clamp(input.grayscale, 0, 1, 0),
      sepia: clamp(input.sepia, 0, 1, 0),
      invert: clamp(input.invert, 0, 1, 0),
      flipX: input.flipX === true,
      flipY: input.flipY === true
    };
  }

  function filters(input = {}) {
    const state = create(input);
    return `brightness(${state.brightness}) contrast(${state.contrast}) saturate(${state.saturation}) hue-rotate(${state.hue}deg) grayscale(${state.grayscale}) sepia(${state.sepia}) invert(${state.invert})`;
  }

  function reset(input) {
    if (!input) return;
    Object.assign(input, { blendMode: "source-over", brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0, flipX: false, flipY: false });
  }

  function signature(input = {}) {
    const state = create(input);
    return { blendMode: state.blendMode, brightness: state.brightness, contrast: state.contrast, saturation: state.saturation, hue: state.hue, grayscale: state.grayscale, sepia: state.sepia, invert: state.invert, flipX: state.flipX, flipY: state.flipY };
  }

  const api = Object.freeze({ blendModes, blendMode, create, filters, reset, signature });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPrintAppearance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
