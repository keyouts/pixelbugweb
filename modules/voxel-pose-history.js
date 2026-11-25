(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PixelBugVoxelPoseHistory = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const axes = ["x", "y", "z"];
  const vector = value => Object.fromEntries(axes.map(axis => [axis, Number(value?.[axis]) || 0]));
  const scale = value => Object.fromEntries(axes.map(axis => [axis, Number.isFinite(Number(value?.[axis])) ? Number(value[axis]) : 1]));
  function capture(model) {
    return {
      rigVisible: model?.rigVisible !== false,
      rigPreview: model?.rigPreview !== false,
      parts: Array.isArray(model?.parts) ? model.parts.map(part => ({ id: part.id, translation: vector(part.translation), rotation: vector(part.rotation), scale: scale(part.scale) })) : []
    };
  }
  function changed(before, after) {
    return JSON.stringify(before) !== JSON.stringify(after);
  }
  function restore(model, snapshot) {
    if (!model || !snapshot || !Array.isArray(model.parts) || !Array.isArray(snapshot.parts)) return false;
    const byId = new Map(snapshot.parts.map(part => [part.id, part]));
    let restored = 0;
    model.parts.forEach(part => {
      const previous = byId.get(part.id);
      if (!previous) return;
      part.translation = vector(previous.translation);
      part.rotation = vector(previous.rotation);
      part.scale = scale(previous.scale);
      restored++;
    });
    model.rigVisible = snapshot.rigVisible;
    model.rigPreview = snapshot.rigPreview;
    return restored > 0;
  }
  return { capture, changed, restore };
});
