"use strict";

// Pose baking
(function attachVoxelBaking(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelBaking = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function reduceFrames(frames, bounds, maximum) {
    const width = bounds.max.x - bounds.min.x + 1;
    const height = bounds.max.y - bounds.min.y + 1;
    const depth = bounds.max.z - bounds.min.z + 1;
    let step = Math.max(1, Math.ceil(Math.cbrt(Math.max(...frames.map(frame => frame.cubes.length)) / maximum)));
    function compact(stride) {
      return frames.map(frame => {
        const seen = new Set();
        const cubes = [];
        for (const cube of frame.cubes) {
          const x = Math.floor((cube.x - bounds.min.x) / stride);
          const y = Math.floor((cube.y - bounds.min.y) / stride);
          const z = Math.floor((cube.z - bounds.min.z) / stride);
          const key = `${x},${y},${z}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cubes.push({ x, y, z, color: cube.color });
        }
        return { id: frame.id, name: frame.name, cubes };
      });
    }
    let result = compact(step);
    while (result.some(frame => frame.cubes.length > maximum)) {
      step++;
      result = compact(step);
    }
    return { width: Math.ceil(width / step), height: Math.ceil(height / step), depth: Math.ceil(depth / step), cubes: result[0].cubes, poses: result.slice(1), detailStep: step };
  }
  function bake(source, tools, partId = "") {
    const belongs = cube => !partId || cube.partId === partId;
    const base = source.cubes.filter(belongs).map(cube => ({ ...cube }));
    if (!base.length) return null;
    const variants = [{ id: "", name: "Base model", cubes: base, poses: null }];
    (source.poseLibrary || []).forEach((pose, index) => variants.push({ id: `saved-${index + 1}`, name: `Pose: ${pose.name || index + 1}`, cubes: base, poses: pose.poses }));
    (source.animationFrames || []).forEach((frame, index) => {
      if (Array.isArray(frame.cubes) && frame.cubes.length) variants.push({ id: `frame-${index + 1}`, name: `Frame ${index + 1}`, cubes: frame.cubes.filter(belongs), poses: frame.poses });
    });
    if (variants.length > 25) throw new Error("An asset can contain up to 24 saved poses or animation frames.");
    if (variants.reduce((total, variant) => total + variant.cubes.length, 0) > 360000) throw new Error("The model and poses exceed the 360,000 source-voxel import budget. Split the model into smaller named parts.");
    const originalPose = tools.readPose();
    const oldPreview = source.rigPreview;
    const results = [];
    try {
      source.rigPreview = true;
      for (const variant of variants) {
        tools.applyPose(variant.poses || originalPose);
        const output = variant.cubes.map(cube => {
          const center = { x: cube.x + .5, y: cube.y + .5, z: cube.z + .5 };
          const point = tools.transformPoint(cube, center);
          if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error("A rig pose contains invalid coordinates.");
          return { x: Math.round(point.x - .5), y: Math.round(point.y - .5), z: Math.round(point.z - .5), color: cube.color };
        });
        results.push({ id: variant.id, name: variant.name, cubes: output });
      }
    } finally {
      tools.applyPose(originalPose);
      source.rigPreview = oldPreview;
    }
    const allCubes = results.flatMap(result => result.cubes);
    if (!allCubes.length) return null;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const cube of allCubes) for (const axis of ["x", "y", "z"]) { min[axis] = Math.min(min[axis], cube[axis]); max[axis] = Math.max(max[axis], cube[axis]); }
    if (["x", "y", "z"].some(axis => max[axis] - min[axis] + 1 > 512)) throw new Error("Rig poses exceed the 512 voxel spatial limit. Split the model into smaller parts.");
    return reduceFrames(results, { min, max }, tools.maxCubes);
  }
  return { bake };
});
