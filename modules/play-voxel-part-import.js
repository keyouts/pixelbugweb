"use strict";

// Parts importing
(function attachVoxelPartImport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelPartImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function targets(source, requested = "", all = false) {
    const populated = new Set((source.cubes || []).map(cube => cube.partId));
    const parts = (source.parts || []).filter(part => populated.has(part.id));
    if (all) return parts;
    return parts.filter(part => part.id === requested);
  }
  const MAX_LIBRARY_CUBES = 200000;
  const voxelCost = asset => (asset?.cubes?.length || 0) + (asset?.poses || []).reduce((n, pose) => n + (pose.cubes?.length || 0), 0);
  function enforceBudget(existing, incoming) {
    const cost = [...existing, ...incoming].reduce((total, asset) => total + voxelCost(asset), 0);
    if (cost > MAX_LIBRARY_CUBES) throw new Error(`Voxel library exceeds the ${MAX_LIBRARY_CUBES.toLocaleString("en-US")} total rendered voxel-frame budget.`);
  }
  function create(source, parts, baking, normalizer, tools, maxAssets, existing = []) {
    if (!parts.length) throw new Error("No populated parts were found. Create parts in Voxel Mode first.");
    if (existing.length + parts.length > maxAssets) throw new Error(`Only ${maxAssets} saved voxel assets are supported per project.`);
    const result = parts.map((part, index) => {
      const baked = baking.bake(source, tools, part.id);
      if (!baked) throw new Error(`Part ${part.name} has no valid voxels.`);
      const id = `part-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      return normalizer.normalizeAsset({ ...baked, id, name: String(part.name || `Part ${index + 1}`).slice(0, 48) });
    });
    enforceBudget(existing, result);
    return result;
  }
  function capture(source, id, name, baking, normalizer, tools, existing = []) {
    if (!source?.cubes?.length) throw new Error("Draw some cubes in Voxel Mode first.");
    const baked = baking.bake(source, tools);
    if (!baked) throw new Error("There are no voxel cubes to import.");
    const asset = normalizer.normalizeAsset({ id, name, ...baked });
    if (!asset.cubes.length) throw new Error("No valid colored cubes were found in the model.");
    enforceBudget(existing.filter(item => item.id !== id), [asset]);
    return asset;
  }
  return { targets, create, capture };
});
