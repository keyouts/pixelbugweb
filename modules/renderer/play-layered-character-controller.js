"use strict";
(function attachPlayLayeredCharacterController(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayLayeredCharacterController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createController() {
  function mount(deps) {
    const $ = id => document.getElementById(id);
    const converter = globalThis.PixelBugPlayLayeredCharacter;
    const voxels = globalThis.PixelBugPlayVoxelAssets;
    const canvas = $("play-layer-voxel-preview"), status = $("play-layer-voxel-status");
    const start = $("play-layer-start"), count = $("play-layer-count");
    const size = $("play-layer-size"), thickness = $("play-layer-thickness");
    const name = $("play-layer-name"), use = $("play-layer-voxel-use");
    const yawSelect = $("play-layer-preview-yaw");
    let selected = null, preview = null, poseIndex = 0, timer = null, serial = 0;
    function report(text) { if (status) status.textContent = text; deps.status(text); }
    function stopPreview() { if (timer !== null) { clearInterval(timer); timer = null; } const b = $("play-layer-voxel-play"); if (b) b.textContent = "Play Pose Preview"; }
    function frameOptions() {
      if (!start) return;
      const previous = start.value;
      start.replaceChildren();
      deps.frames().forEach((frame, i) => start.add(new Option(`${i + 1}. ${frame.tag || `Frame ${i + 1}`}`, String(i))));
      start.value = [...start.options].some(o => o.value === previous) ? previous : "0";
    }
    function options() {
      return { firstFrame: Number(start?.value), poseCount: Number(count?.value), size: Number(size?.value),
        thickness: Number(thickness?.value), width: deps.width(), height: deps.height(), name: name?.value || "Layered character", id: "layer-preview" };
    }
    function rigOptions() {
      return { enabled:$("play-layer-rig-enabled")?.checked === true,
        interpolate:$("play-layer-rig-blend")?.checked === true,
        swing:Number($("play-layer-rig-swing")?.value),bob:Number($("play-layer-rig-bob")?.value) };
    }
    function draw() {
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      if (!preview) return;
      const pose = preview.poses[poseIndex % preview.poses.length];
      const image = voxels.createCanvas(preview, Number(yawSelect?.value) || 0, document, pose?.id || "");
      if (image?.width && image?.height) {
        const factor = Math.min(canvas.width / image.width, canvas.height / image.height, 4);
        const w = Math.max(1, Math.floor(image.width * factor)), h = Math.max(1, Math.floor(image.height * factor));
        ctx.drawImage(image, Math.floor((canvas.width - w) / 2), Math.floor((canvas.height - h) / 2), w, h);
      }
      ctx.fillStyle = "#46566c"; ctx.font = "12px system-ui";
      ctx.fillText(`Pose ${poseIndex % preview.poses.length + 1}/${preview.poses.length}`, 8, canvas.height - 9);
    }
    function prepare() {
      if (deps.isRunning()) throw new Error("Stop Play Mode before changing assets.");
      preview = converter.create(deps.frames(), options());
      preview.rig = voxels.normalizeAsset({ ...preview, rig:rigOptions() }).rig;
      poseIndex = 0;
      draw();
      report(`${preview.width} × ${preview.height} × ${preview.depth} voxels · ${preview.poses.length} animated pose(s). ${preview.poses[0].cubes.length} cells in the first pose. Ready to save.`);
      return preview;
    }
    function persist(assign) {
      if (deps.isRunning()) throw new Error("Stop Play Mode before changing assets.");
      const asset = prepare(), pm = deps.playMode();
      // Asset reuse
      let normalized = assign && selected ? (pm.voxelAssets || []).find(item => item.id === selected) : null;
      if (normalized && (normalized.name !== asset.name || normalized.width !== asset.width || normalized.height !== asset.height || normalized.depth !== asset.depth ||
          JSON.stringify(normalized.poses) !== JSON.stringify(asset.poses))) normalized = null;
      if (!normalized) {
        if ((pm.voxelAssets || []).length >= 32) throw new Error("The reusable voxel library is full (32 objects).");
        asset.id = `layer-${Date.now().toString(36)}-${(++serial).toString(36)}`;
        normalized = voxels.normalizeAsset(asset);
        if (normalized.poses.length !== asset.poses.length || normalized.cubes.length !== asset.cubes.length)
          throw new Error("Conversion would lose voxel cells; simplify the design before saving.");
      }
      deps.history();
      if (!(pm.voxelAssets || []).includes(normalized)) pm.voxelAssets.push(normalized);
      if (assign) {
        pm.voxelActorAssetId = normalized.id;
        const poseIndex = field => Math.max(0, Math.min(normalized.poses.length - 1, Math.floor(Number($(field)?.value) || 1) - 1));
        const idle = poseIndex("play-layer-idle-pose"), walk = poseIndex("play-layer-walk-pose"), jump = poseIndex("play-layer-jump-pose");
        pm.voxelIdlePoseId = normalized.poses[idle].id;
        pm.voxelWalkPoseId = normalized.poses[walk].id;
        pm.voxelJumpPoseId = normalized.poses[jump].id;
        pm.voxelIdlePoseClip = normalized.poses[idle].id;
        pm.voxelWalkPoseClip = normalized.poses.slice(walk).map(p => p.id).join(",");
        pm.voxelPoseClipTicks = Math.max(2, Math.min(60, Math.floor(Number($("play-layer-pose-ticks")?.value) || 8)));
        deps.captureScene();
      }
      selected = normalized.id; deps.refresh(); deps.save();
      report(assign ? `Created “${normalized.name}” and assigned its voxel poses to the current game world.` : `Saved “${normalized.name}” to Voxel Assets for reuse across worlds.`);
    }
    function safe(fn) { try { fn(); } catch (e) { report(e?.message || "Could not build this character."); } }
    for (const id of ["play-layer-start", "play-layer-count", "play-layer-size", "play-layer-thickness", "play-layer-name", "play-layer-rig-enabled", "play-layer-rig-blend", "play-layer-rig-swing", "play-layer-rig-bob"]) {
      $(id)?.addEventListener("change", () => { stopPreview(); safe(prepare); });
    }
    yawSelect?.addEventListener("change", draw);
    start?.addEventListener("focus", frameOptions);
    $("play-layer-voxel-build")?.addEventListener("click", () => safe(() => persist(false)));
    use?.addEventListener("click", () => safe(() => persist(true)));
    $("play-layer-voxel-next")?.addEventListener("click", () => { if (!preview) safe(prepare); else {poseIndex++; draw();} });
    $("play-layer-voxel-play")?.addEventListener("click", () => {
      if (timer !== null) { stopPreview(); return; }
      if (!preview) safe(prepare);
      if (!preview) return;
      timer = setInterval(() => { if (!canvas?.isConnected || !canvas.getClientRects().length) { stopPreview(); return; } poseIndex++; draw(); },
        Math.round(1000 / 60 * Math.max(2, Math.min(60, Math.floor(Number($("play-layer-pose-ticks")?.value) || 8)))));
      $("play-layer-voxel-play").textContent = "Pause Preview";
    });
    frameOptions();
    return Object.freeze({ refresh: frameOptions, stopPreview });
  }
  return { mount };
});
