"use strict";
(function attachPlaySceneModel(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlaySceneModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaySceneModel() {
function snapshot(source = {}, id = "scene-main", name = "Scene 1", deps) {
  return {
    id: deps.sceneId(id),
    name: String(name || "Scene").slice(0, 40),
    idleFrame: Number(source.idleFrame) || 0,
    walkFrame: Number(source.walkFrame) || 0,
    jumpFrame: Number(source.jumpFrame) || 0,
    runFrame: source.runFrame == null ? null : Number(source.runFrame),
    riseFrame: source.riseFrame == null ? null : Number(source.riseFrame),
    fallFrame: source.fallFrame == null ? null : Number(source.fallFrame),
    idleClip: deps.parseClip(source.idleClip).join(","),
    runClip: deps.parseClip(source.runClip).join(","),
    leftClip: deps.parseClip(source.leftClip).join(","),
    rightClip: deps.parseClip(source.rightClip).join(","),
    upClip: deps.parseClip(source.upClip).join(","),
    downClip: deps.parseClip(source.downClip).join(","),
    riseClip: deps.parseClip(source.riseClip).join(","),
    fallClip: deps.parseClip(source.fallClip).join(","),
    leftIdleClip: deps.parseClip(source.leftIdleClip).join(","),
    leftRunClip: deps.parseClip(source.leftRunClip).join(","),
    rightIdleClip: deps.parseClip(source.rightIdleClip).join(","),
    rightRunClip: deps.parseClip(source.rightRunClip).join(","),
    upIdleClip: deps.parseClip(source.upIdleClip).join(","),
    upRunClip: deps.parseClip(source.upRunClip).join(","),
    downIdleClip: deps.parseClip(source.downIdleClip).join(","),
    downRunClip: deps.parseClip(source.downRunClip).join(","),
    idleClipTicks: Math.max(2, Math.min(Number(source.idleClipTicks ?? source.clipFrameTicks) || 8, 60)),
    runClipTicks: Math.max(2, Math.min(Number(source.runClipTicks ?? source.clipFrameTicks) || 8, 60)),
    airClipTicks: Math.max(2, Math.min(Number(source.airClipTicks ?? source.clipFrameTicks) || 8, 60)),
    clipFrameTicks: Math.max(2, Math.min(Number(source.clipFrameTicks) || 8, 60)),
    acceleration: Math.max(0, Math.min(Number(source.acceleration) || 0, 120)),
    friction: Math.max(0, Math.min(Number(source.friction) || 0, 120)),
    variableJump: source.variableJump === true,
    sceneWidth: Number(source.sceneWidth) || 640,
    sceneHeight: Number(source.sceneHeight) || 360,
    worldWidth: Number(source.worldWidth) || 1600,
    groundY: Number(source.groundY) || 300,
    actorScale: Number(source.actorScale) || 3,
    moveSpeed: Math.max(0.25, Math.min(Number(source.moveSpeed) || 3, 20)),
    jumpStrength: Math.max(0.5, Math.min(Number(source.jumpStrength) || 8, 30)),
    gravity: Math.max(0.05, Math.min(Number(source.gravity) || 0.45, 4)),
    backgroundFrame: Number.isFinite(Number(source.backgroundFrame)) ? Number(source.backgroundFrame) : -1,
    backgroundScale: source.backgroundScale || "cover",
    // Scene bindings
    voxelActorAssetId: String(source.voxelActorAssetId || "").slice(0, 48),
    voxelIdlePoseId: String(source.voxelIdlePoseId || "").slice(0, 48),
    voxelWalkPoseId: String(source.voxelWalkPoseId || "").slice(0, 48),
    voxelJumpPoseId: String(source.voxelJumpPoseId || "").slice(0, 48),
    voxelIdlePoseClip: String(source.voxelIdlePoseClip || "").slice(0, 600),
    voxelWalkPoseClip: String(source.voxelWalkPoseClip || "").slice(0, 600),
    voxelPoseClipTicks: Math.max(2, Math.min(60, Number(source.voxelPoseClipTicks) || 8)),
    voxelBackgroundAssetId: String(source.voxelBackgroundAssetId || "").slice(0, 48),
    voxelBackgroundYaw: deps.quarterTurn(source.voxelBackgroundYaw),
    showGridOverlay: source.showGridOverlay !== false,
    cameraFollow: source.cameraFollow !== false,
    autoScroll: source.autoScroll === true,
    scrollSpeed: Number(source.scrollSpeed) || 1.25,
    sceneryFrame: Number.isFinite(Number(source.sceneryFrame)) ? Number(source.sceneryFrame) : -1,
    sceneryScale: Number(source.sceneryScale) || 3,
    scenerySpeed: Number(source.scenerySpeed) || 0.45,
    sceneryY: Number(source.sceneryY) || 248,
    visualLayers: deps.clone(source.visualLayers || deps.defaultVisualLayers()),
    props: deps.clone(source.props || []),
    worldType: source.worldType === "voxel3d" ? "voxel3d" : "sidescroller",
    voxelWorld: source.voxelWorld ? deps.normalizeWorld(source.voxelWorld) : null,
    dialogue: deps.clone(source.dialogue || deps.defaultDialogue()),
    ui: deps.clone(source.ui || deps.defaultUi()),
    audio: deps.normalizeAudio(source.audio || { assetId: "", name: "", dataUrl: "", volume: 0.7, loop: true })
  };
}
function apply(pm, scene, deps) {
  if (!scene || !pm) return;
  ["idleFrame", "walkFrame", "jumpFrame", "runFrame", "riseFrame", "fallFrame", "idleClip", "runClip", "leftClip", "rightClip", "upClip", "downClip", "riseClip", "fallClip", "leftIdleClip", "leftRunClip", "rightIdleClip", "rightRunClip", "upIdleClip", "upRunClip", "downIdleClip", "downRunClip", "idleClipTicks", "runClipTicks", "airClipTicks", "clipFrameTicks", "acceleration", "friction", "variableJump", "sceneWidth", "sceneHeight", "worldWidth", "groundY", "actorScale", "moveSpeed", "jumpStrength", "gravity", "backgroundFrame", "backgroundScale", "voxelBackgroundAssetId", "voxelBackgroundYaw", "showGridOverlay", "cameraFollow", "autoScroll", "scrollSpeed", "sceneryFrame", "sceneryScale", "scenerySpeed", "sceneryY"].forEach(key => { pm[key] = deps.clone(scene[key]); });
  // Legacy compatibility
  for (const field of ["voxelActorAssetId", "voxelIdlePoseId", "voxelWalkPoseId", "voxelJumpPoseId", "voxelIdlePoseClip", "voxelWalkPoseClip", "voxelPoseClipTicks"])
    if (Object.prototype.hasOwnProperty.call(scene, field)) pm[field] = deps.clone(scene[field]);
  pm.worldType = scene.worldType === "voxel3d" ? "voxel3d" : "sidescroller";
  pm.voxelWorld = scene.voxelWorld ? deps.normalizeWorld(scene.voxelWorld) : null;
  pm.visualLayers = deps.clone(scene.visualLayers || deps.defaultVisualLayers());
  pm.props = deps.clone(scene.props || []);
  pm.dialogue = deps.clone(scene.dialogue || deps.defaultDialogue());
  pm.ui = deps.clone(scene.ui || deps.defaultUi());
  pm.audio = deps.normalizeAudio(scene.audio || { assetId: "", name: "", dataUrl: "", volume: 0.7, loop: true });
  pm.activeSceneId = scene.id;
}
  return { snapshot, apply };
});
