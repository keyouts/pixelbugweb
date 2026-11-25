"use strict";
// Layer conversion
// Original preservation
(function attachPlayLayeredCharacter(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayLayeredCharacter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayLayeredCharacter() {
  const HEX = /^#[0-9a-f]{6}$/i;
  const MAX_POSES = 12, MAX_LAYERS = 12, MAX_CUBES_PER_POSE = 24000, MAX_TOTAL_CUBES = 48000;
  function integer(value, low, high, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n >= low && n <= high ? n : fallback;
  }
  function create(frames, options = {}) {
    if (!Array.isArray(frames)) throw new Error("No Base Mode frames are available.");
    for (const [key, low, high] of [["firstFrame", 0, Math.max(0, frames.length - 1)], ["poseCount", 1, MAX_POSES], ["width", 1, 512], ["height", 1, 512], ["size", 8, 48], ["thickness", 1, 3]]) {
      if (options[key] != null && integer(options[key], low, high, null) === null) throw new Error(`Invalid ${key}; choose a value from ${low} to ${high}.`);
    }
    const first = integer(options.firstFrame, 0, frames.length - 1, 0);
    const count = integer(options.poseCount, 1, MAX_POSES, 1);
    if (first + count > frames.length) throw new Error("Not enough Base Mode frames for the chosen poses.");
    const srcWidth = integer(options.width, 1, 512, 32);
    const srcHeight = integer(options.height, 1, 512, 32);
    const size = integer(options.size, 8, 48, 24);
    const thickness = integer(options.thickness, 1, 3, 1);
    const scale = Math.min(1, size / Math.max(srcWidth, srcHeight));
    const width = Math.max(1, Math.ceil(srcWidth * scale)), height = Math.max(1, Math.ceil(srcHeight * scale));
    let depth = 1, total = 0;
    const poses = [];
    for (let frameIndex = first; frameIndex < first + count; frameIndex++) {
      const frame = frames[frameIndex];
      const layers = Array.isArray(frame?.layers) ? frame.layers.filter(layer => layer?.visible !== false && Number(layer?.opacity ?? 1) > 0) : [];
      if (!layers.length) throw new Error(`Base frame ${frameIndex + 1} has no visible layers.`);
      if (layers.length > MAX_LAYERS) throw new Error(`Base frame ${frameIndex + 1} has over ${MAX_LAYERS} visible layers; hide or merge layers first.`);
      depth = Math.max(depth, layers.length * thickness);
      const cubes = [];
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
        const grid = layers[layerIndex].pixels;
        if (!Array.isArray(grid) || grid.length !== srcHeight || grid.some(row => !Array.isArray(row) || row.length !== srcWidth)) {
          throw new Error(`Base frame ${frameIndex + 1} contains an invalid layer grid.`);
        }
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const color = grid[Math.min(srcHeight - 1, Math.floor(y / scale))][Math.min(srcWidth - 1, Math.floor(x / scale))];
          if (typeof color !== "string" || !HEX.test(color)) continue;
          for (let zOffset = 0; zOffset < thickness; zOffset++) {
            cubes.push({ x, y: height - 1 - y, z: layerIndex * thickness + zOffset, color: color.toLowerCase() });
            if (cubes.length > MAX_CUBES_PER_POSE || total + cubes.length > MAX_TOTAL_CUBES)
              throw new Error("Layered character exceeds the safe voxel budget. Reduce resolution, thickness, or pose count.");
          }
        }
      }
      if (!cubes.length) throw new Error(`Base frame ${frameIndex + 1} has no colored pixels to convert.`);
      total += cubes.length;
      poses.push({ id: `layer-pose-${poses.length + 1}`, name: `Base frame ${frameIndex + 1}`, cubes });
    }
    // Pose alignment
    const id = String(options.id || "layer-character").replace(/[^a-z0-9_-]/gi, "-").slice(0, 48);
    const name = String(options.name || "Layered pixel character").replace(/[<>\r\n]/g, "").trim().slice(0, 48) || "Layered pixel character";
    return { id, name, width, height, depth, cubes: poses[0].cubes.map(cube => ({ ...cube })), poses, detailStep: 1 };
  }
  return { create, MAX_POSES, MAX_LAYERS, MAX_TOTAL_CUBES };
});
