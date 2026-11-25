"use strict";

// Voxel controls
(function attachPlayVoxelControls(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelControls = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function fillSelect(select, entries, chosen) {
    if (!select) return;
    select.replaceChildren();
    entries.forEach(([label, id]) => select.add(new Option(label, id)));
    select.value = entries.some(([, id]) => id === chosen) ? chosen : entries[0]?.[1] || "";
  }
  function renderPoses(select, asset, requested = "") {
    fillSelect(select, [["Base model", ""], ...(asset?.poses || []).map(pose => [pose.name, pose.id])], requested);
  }
  function renderActor(controls, assets = [], settings = {}) {
    if (!controls.assetSelect) return;
    fillSelect(controls.assetSelect, [["2D sprite (existing frames)", ""], ...assets.map(asset => [asset.name, asset.id])], settings.voxelActorAssetId || "");
    const chosen = assets.find(asset => asset.id === controls.assetSelect.value);
    [[controls.idleSelect, "voxelIdlePoseId"], [controls.walkSelect, "voxelWalkPoseId"], [controls.jumpSelect, "voxelJumpPoseId"]].forEach(([select, field]) => {
      renderPoses(select, chosen, settings[field]);
      if (select) select.disabled = !chosen;
    });
  }
  function renderLibrary(controls, assets = [], selected) {
    if (!controls.assetSelect) return;
    const wanted = controls.assetSelect.value || selected?.voxelAssetId || "";
    fillSelect(controls.assetSelect, [["2D sprite frame", ""], ...assets.map(asset => [`${asset.name} (${asset.cubes.length} voxels, ${(asset.poses || []).length} poses)`, asset.id])], wanted);
    fillSelect(controls.librarySelect, [["No voxel asset selected", ""], ...assets.map(asset => [asset.name, asset.id])], controls.assetSelect.value);
    const chosen = assets.find(asset => asset.id === controls.assetSelect.value);
    if (controls.nameInput && chosen) controls.nameInput.value = chosen.name;
    if (controls.updateBtn) controls.updateBtn.disabled = !chosen;
    if (controls.deleteBtn) controls.deleteBtn.disabled = !chosen;
    renderPoses(controls.poseSelect, chosen, selected?.voxelPoseId || "");
    if (controls.summary) {
      const optimized = assets.filter(asset => Number(asset.detailStep) > 1).length;
      controls.summary.textContent = `${assets.length} saved voxel assets · Reuse each asset in any scene.${optimized ? ` ${optimized} high-detail model${optimized === 1 ? "" : "s"} optimized for smoother playback.` : ""}`;
    }
  }
  function renderParts(select, parts = [], cubes = []) {
    if (!select) return;
    const chosen = select.value;
    const counts = new Map();
    cubes.forEach(cube => counts.set(cube.partId, (counts.get(cube.partId) || 0) + 1));
    const entries = parts.filter(part => counts.get(part.id)).map(part => [`${part.name} (${counts.get(part.id)} voxels)`, part.id]);
    fillSelect(select, entries.length ? entries : [["No populated parts", ""]], chosen);
  }
  function renderBackground(select, yawSelect, assets, settings) {
    if (select) fillSelect(select, [["None (2D or plain background)", ""], ...assets.map(asset => [asset.name, asset.id])], settings.voxelBackgroundAssetId || "");
    if (yawSelect) yawSelect.value = String(settings.voxelBackgroundYaw || 0);
  }
  return { renderPoses, renderActor, renderLibrary, renderParts, renderBackground };
});
