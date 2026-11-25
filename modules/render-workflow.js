(() => {
  const DEFAULT_REGIONS = Object.freeze(["canvas", "frames", "layers", "palette", "storyboard", "tilemap", "selection", "play", "voxel", "print"]);

  function render(options, callbacks) {
    const settings = options && typeof options === "object" ? options : {};
    const regions = new Set(Array.isArray(settings.regions) && settings.regions.length ? settings.regions : DEFAULT_REGIONS);
    if (settings.invalidate !== false) callbacks.invalidate?.();
    if (regions.has("canvas")) callbacks.canvas?.();
    if (regions.has("frames")) callbacks.frames?.();
    if (regions.has("layers")) callbacks.layers?.();
    if (regions.has("palette")) callbacks.palette?.();
    if (regions.has("storyboard")) callbacks.storyboard?.();
    if (regions.has("tilemap")) callbacks.tilemap?.();
    if (regions.has("selection")) callbacks.selection?.();
    if (regions.has("play") && callbacks.playActive?.()) callbacks.play?.();
    if (regions.has("voxel") && callbacks.voxelActive?.()) callbacks.voxel?.();
    if (regions.has("print") && callbacks.printActive?.()) callbacks.print?.();
    if (settings.persist !== false) callbacks.persist?.();
  }

  const api = Object.freeze({ DEFAULT_REGIONS, render });
  if (typeof globalThis !== "undefined") globalThis.PixelBugRenderWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
