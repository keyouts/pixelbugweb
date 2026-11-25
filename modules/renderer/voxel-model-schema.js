"use strict";

// Voxel schema
(function attachVoxelModelSchema(root, factory) {
  const api = Object.freeze({create:factory});
  if (root) root.PixelBugVoxelModelSchema = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVoxelModelSchema(dependencies = {}) {
  const { VOXEL_MODE_VIEW_LABELS, VOXEL_MODE_CAMERA_PRESETS, VOXEL_MODE_TOOLS,
    VOXEL_MODE_MATERIALS, MAX_PROJECT_FRAMES, MAX_VOXEL_MODE_CANVAS_DIMENSION,
    MAX_VOXEL_MODE_DEPTH, MAX_VOXEL_MODE_CUBES, VoxelWeighting, VoxelFeatures,
    isHexColor } = dependencies;

function voxelSliceMaxForDimensions(plane, width, height, depth) {
  return plane === "xy" ? depth - 1 : plane === "xz" ? height - 1 : width - 1;
}

function defaultVoxelOrigin(width = 32, height = 32, depth = 32) {
  return {
    x: Math.max(0, Math.min(Math.floor((Number(width) || 32) / 2), Math.max(0, (Number(width) || 32) - 1))),
    y: Math.max(0, Math.min(Math.floor((Number(height) || 32) / 2), Math.max(0, (Number(height) || 32) - 1))),
    z: Math.max(0, Math.min(Math.floor((Number(depth) || 32) / 2), Math.max(0, (Number(depth) || 32) - 1)))
  };
}

function normalizeVoxelOrigin(input = {}, width = 32, height = 32, depth = 32) {
  const fallback = defaultVoxelOrigin(width, height, depth);
  const x = Math.round(Number(input?.x));
  const y = Math.round(Number(input?.y));
  const z = Math.round(Number(input?.z));
  return {
    x: Math.max(0, Math.min(Number.isInteger(x) ? x : fallback.x, Math.max(0, width - 1))),
    y: Math.max(0, Math.min(Number.isInteger(y) ? y : fallback.y, Math.max(0, height - 1))),
    z: Math.max(0, Math.min(Number.isInteger(z) ? z : fallback.z, Math.max(0, depth - 1)))
  };
}

function defaultVoxelViewCanvas(viewYaw = 0, width = 32, height = 32, depth = 32, origin = defaultVoxelOrigin(width, height, depth)) {
  const view = ((Math.round(Number(viewYaw) || 0) % VOXEL_MODE_VIEW_LABELS.length) + VOXEL_MODE_VIEW_LABELS.length) % VOXEL_MODE_VIEW_LABELS.length;
  const anchor = normalizeVoxelOrigin(origin, width, height, depth);
  if (view === 1) return { viewYaw: view, name: "Right", plane: "yz", slice: anchor.x };
  if (view === 2) return { viewYaw: view, name: "Back", plane: "xy", slice: anchor.z };
  if (view === 3) return { viewYaw: view, name: "Left", plane: "yz", slice: anchor.x };
  if (view === 4) return { viewYaw: view, name: "Top", plane: "xz", slice: anchor.y };
  if (view === 5) return { viewYaw: view, name: "Bottom", plane: "xz", slice: anchor.y };
  return { viewYaw: 0, name: "Front", plane: "xy", slice: anchor.z };
}

function defaultVoxelViewCanvases(width = 32, height = 32, depth = 32, origin = defaultVoxelOrigin(width, height, depth)) {
  return VOXEL_MODE_VIEW_LABELS.map((_label, index) => defaultVoxelViewCanvas(index, width, height, depth, origin));
}

function normalizeVoxelViewCanvas(input = {}, viewYaw = 0, width = 32, height = 32, depth = 32, origin = defaultVoxelOrigin(width, height, depth)) {
  const view = ((Math.round(Number(input.viewYaw ?? viewYaw) || 0) % VOXEL_MODE_VIEW_LABELS.length) + VOXEL_MODE_VIEW_LABELS.length) % VOXEL_MODE_VIEW_LABELS.length;
  const fallback = defaultVoxelViewCanvas(view, width, height, depth, origin);
  const plane = ["xy", "xz", "yz"].includes(input.plane) ? input.plane : fallback.plane;
  const sliceMax = voxelSliceMaxForDimensions(plane, width, height, depth);
  const slice = Math.max(0, Math.min(Math.round(Number(input.slice ?? fallback.slice) || 0), sliceMax));
  return { viewYaw: view, name: fallback.name, plane, slice };
}
// Rig helpers
function voxelModeCleanPartId(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function voxelModeCleanPartName(value = "", fallback = "Part") {
  return String(value || fallback).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "").trim().slice(0, 32) || fallback;
}
function voxelModeVector(input = {}, fallback = {}, minimum = -Infinity, maximum = Infinity) {
  const read = axis => Math.max(minimum, Math.min(Number.isFinite(Number(input?.[axis])) ? Number(input[axis]) : Number(fallback?.[axis]) || 0, maximum));
  return { x: read("x"), y: read("y"), z: read("z") };
}
function defaultVoxelParts(width = 32, height = 32, depth = 32, origin = defaultVoxelOrigin(width, height, depth)) {
  const pivot = voxelModeVector(origin, defaultVoxelOrigin(width, height, depth), 0, Math.max(width, height, depth));
  return [{ id: "part-root", name: "Root", parentId: "", pivot, translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, visible: true, locked: false, opacity: 1, rigBone: false }];
}
function normalizeVoxelParts(input = [], width = 32, height = 32, depth = 32, origin = defaultVoxelOrigin(width, height, depth)) {
  const source = Array.isArray(input) && input.length ? input : defaultVoxelParts(width, height, depth, origin);
  const used = new Set();
  const parts = source.slice(0, 64).map((item, index) => {
    let id = voxelModeCleanPartId(item?.id) || (index === 0 ? "part-root" : `part-${index + 1}`);
    if (used.has(id)) {
      let suffix = 2;
      while (used.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    used.add(id);
    const pivot = voxelModeVector(item?.pivot, index === 0 ? origin : origin, 0, Math.max(width, height, depth));
    const translation = voxelModeVector(item?.translation, {}, -96, 96);
    const rotation = voxelModeVector(item?.rotation, {}, -360, 360);
    const scale = voxelModeVector(item?.scale, { x: 1, y: 1, z: 1 }, 0.1, 8);
    return { id, name: voxelModeCleanPartName(item?.name, index === 0 ? "Root" : `Part ${index + 1}`), parentId: voxelModeCleanPartId(item?.parentId), pivot, translation, rotation, scale, visible: item?.visible !== false, locked: item?.locked === true, opacity: Math.max(0.1, Math.min(Number(item?.opacity) || 1, 1)), rigBone: item?.rigBone === true, rigHead: item?.rigHead ? voxelModeVector(item.rigHead, pivot, -1, Math.max(width, height, depth) + 1) : null };
  });
  if (!parts.length) return defaultVoxelParts(width, height, depth, origin);
  const ids = new Set(parts.map(part => part.id));
  parts[0].parentId = "";
  parts.forEach((part, index) => {
    if (!ids.has(part.parentId) || part.parentId === part.id || index === 0) part.parentId = "";
    const seen = new Set([part.id]);
    let parentId = part.parentId;
    while (parentId) {
      if (seen.has(parentId)) { part.parentId = ""; break; }
      seen.add(parentId);
      parentId = parts.find(item => item.id === parentId)?.parentId || "";
    }
  });
  return parts;
}
// Armature schema
function voxelModeCleanArmatureId(value = "", fallback = "item") {
  return voxelModeCleanPartId(value) || fallback;
}
function voxelModeSourceId(value = "") {
  const clean = String(value || "").replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 64);
  return clean || `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function voxelModeRootTail(part, children, width, height, depth) {
  const child = children[0];
  let dx = child ? child.pivot.x - part.pivot.x : 0;
  let dy = child ? child.pivot.y - part.pivot.y : 1;
  let dz = child ? child.pivot.z - part.pivot.z : 0;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.001) { dx = 0; dy = 1; dz = 0; }
  const length = Math.max(1, Math.min(distance || 1, 4));
  const divisor = Math.hypot(dx, dy, dz) || 1;
  return {
    x: Math.max(-1, Math.min(part.pivot.x + dx / divisor * length, width + 1)),
    y: Math.max(-1, Math.min(part.pivot.y + dy / divisor * length, height + 1)),
    z: Math.max(-1, Math.min(part.pivot.z + dz / divisor * length, depth + 1))
  };
}
function normalizeVoxelArmature(input = {}, parts = [], width = 32, height = 32, depth = 32, activePartId = "") {
  const sourceBones = Array.isArray(input?.bones) ? input.bones : [], sourceJoints = Array.isArray(input?.joints) ? input.joints : [];
  const oldBoneByPart = new Map(sourceBones.map(bone => [voxelModeCleanPartId(bone?.partId), bone])), oldJointById = new Map(sourceJoints.map(joint => [voxelModeCleanArmatureId(joint?.id, ""), joint]).filter(([id]) => id));
  const rigParts = parts.filter(part => part?.rigBone === true || oldBoneByPart.has(part.id));
  const usedBoneIds = new Set(), boneIdByPart = new Map();
  rigParts.forEach(part => {
    const old = oldBoneByPart.get(part.id);
    let id = voxelModeCleanArmatureId(old?.id, `bone-${part.id}`);
    if (usedBoneIds.has(id)) {
      let suffix = 2;
      while (usedBoneIds.has(`${id}-${suffix}`)) suffix++;
      id = `${id}-${suffix}`;
    }
    usedBoneIds.add(id);
    boneIdByPart.set(part.id, id);
  });
  const joints = [];
  const addJoint = (id, position, preserve = false) => { const old = oldJointById.get(id), fallback = preserve && old?.position ? old.position : position, joint = { id, position: voxelModeVector(fallback, position, -1, Math.max(width, height, depth) + 1) }; joints.push(joint); return joint; };
  rigParts.forEach(part => {
    addJoint(`joint-${part.id}`, part.pivot);
    if (!boneIdByPart.has(part.parentId)) part.rigHead ? addJoint(`joint-${part.id}-head`, part.rigHead, true) : addJoint(`joint-${part.id}-tip`, voxelModeRootTail(part, rigParts.filter(item => item.parentId === part.id), width, height, depth), true);
  });
  const bones = rigParts.map((part, index) => {
    const old = oldBoneByPart.get(part.id) || {};
    const parentBoneId = boneIdByPart.get(part.parentId) || "";
    const root = !parentBoneId, placedRoot = root && Boolean(part.rigHead);
    const headJointId = root ? placedRoot ? `joint-${part.id}-head` : `joint-${part.id}` : `joint-${part.parentId}`;
    const tailJointId = root ? placedRoot ? `joint-${part.id}` : `joint-${part.id}-tip` : `joint-${part.id}`;
    const parentPart = parts.find(item => item.id === part.parentId);
    const parentRoot = parentPart ? !boneIdByPart.has(parentPart.parentId) : false;
    return {
      id: boneIdByPart.get(part.id),
      name: voxelModeCleanPartName(part.name, `Bone ${index + 1}`),
      partId: part.id,
      parentBoneId,
      headJointId,
      tailJointId,
      roll: Math.max(-360, Math.min(Number(old.roll) || 0, 360)),
      deform: old.deform !== false,
      bindRadius: Math.max(0.25, Math.min(Number(old.bindRadius) || 1.5, 12)),
      connected: Boolean(parentBoneId)
    };
  });
  const boneIds = new Set(bones.map(bone => bone.id)), jointIds = new Set(joints.map(joint => joint.id));
  const fallbackBone = bones.find(bone => bone.partId === activePartId) || bones[0], requested = voxelModeCleanArmatureId(input?.activeBoneId, ""), activeBoneId = boneIds.has(requested) ? requested : fallbackBone?.id || "";
  const activeBone = bones.find(bone => bone.id === activeBoneId) || bones[0], requestedJoint = voxelModeCleanArmatureId(input?.activeJointId, "");
  return { version: 3, name: voxelModeCleanPartName(input?.name, "Voxel Armature"), joints, bones, activeBoneId, activeJointId: jointIds.has(requestedJoint) ? requestedJoint : activeBone?.tailJointId || activeBone?.headJointId || "" };
}

function normalizeVoxelModeClip(input = {}, width = 1, height = 1, depth = 1) {
  const source = Array.isArray(input.cubes) ? input.cubes : [];
  const seen = new Map();
  source.slice(0, MAX_VOXEL_MODE_CUBES).forEach(cube => {
    const x = Math.round(Number(cube?.x));
    const y = Math.round(Number(cube?.y));
    const z = Math.round(Number(cube?.z));
    const cubeColor = String(cube?.color || "").toLowerCase();
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return;
    if (!isHexColor(cubeColor)) return;
    const material = VOXEL_MODE_MATERIALS.includes(cube?.material) ? cube.material : "matte";
    const weights = VoxelWeighting?.manual(cube?.weights) || [];
    seen.set(`${x},${y},${z}`, { x, y, z, color: cubeColor, material, partId: voxelModeCleanPartId(cube?.partId) || "part-root", boneId: voxelModeCleanArmatureId(cube?.boneId, ""), ...(weights.length ? { weights } : {}) });
  });
  return Array.from(seen.values()).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
}

function normalizeVoxelModeStamp(input = {}, index = 0) {
  const width = Math.max(1, Math.min(Math.round(Number(input.width) || 1), MAX_VOXEL_MODE_CANVAS_DIMENSION));
  const height = Math.max(1, Math.min(Math.round(Number(input.height) || 1), MAX_VOXEL_MODE_CANVAS_DIMENSION));
  const depth = Math.max(1, Math.min(Math.round(Number(input.depth) || 1), MAX_VOXEL_MODE_DEPTH));
  const cubes = normalizeVoxelModeClip(input, width, height, depth);
  if (!cubes.length) return null;
  const name = String(input.name || `Stamp ${index + 1}`).replace(/[\u0000-\u001f<>:"\/\\|?*]/g, "").trim().slice(0, 28) || `Stamp ${index + 1}`;
  return { id: String(input.id || `stamp-${Date.now()}-${index}`), name, width, height, depth, cubes };
}
// Pose snapshots
function normalizeVoxelModePoseSnapshot(input = null, parts = []) {
  if (!input || typeof input !== "object") return null;
  const partIds = new Set(parts.map(part => part.id));
  const source = Array.isArray(input) ? input.map(item => [voxelModeCleanPartId(item?.partId), item]) : Object.entries(input);
  const poses = {};
  source.forEach(([rawId, item]) => {
    const partId = voxelModeCleanPartId(rawId || item?.partId);
    if (!partIds.has(partId) || !item || typeof item !== "object") return;
    poses[partId] = {
      translation: voxelModeVector(item.translation, {}, -96, 96),
      rotation: voxelModeVector(item.rotation, {}, -360, 360),
      scale: voxelModeVector(item.scale, { x: 1, y: 1, z: 1 }, 0.1, 8)
    };
  });
  return poses;
}
function normalizeVoxelModeAnimationFrame(input = {}, index = 0, width = 32, height = 32, depth = 32, parts = []) {
  const cubes = normalizeVoxelModeClip(input, width, height, depth);
  const duration = Math.max(40, Math.min(Math.round(Number(input.duration) || 120), 2000));
  const defaultPoses = {};
  parts.forEach(part => {
    defaultPoses[part.id] = {
      translation: voxelModeVector(part.translation, {}, -96, 96),
      rotation: voxelModeVector(part.rotation, {}, -360, 360),
      scale: voxelModeVector(part.scale, { x: 1, y: 1, z: 1 }, 0.1, 8)
    };
  });
  const poses = Object.prototype.hasOwnProperty.call(input, "poses") ? normalizeVoxelModePoseSnapshot(input.poses, parts) : defaultPoses;
  return { index: Math.max(0, Math.round(Number(input.index) || index)), duration, cubes, poses };
}
function normalizeVoxelModePoseLibrary(input = [], parts = []) {
  const source = Array.isArray(input) ? input : [];
  const used = new Set();
  return source.slice(0, 32).map((item, index) => {
    const poses = normalizeVoxelModePoseSnapshot(item?.poses, parts);
    if (!poses) return null;
    let id = voxelModeCleanPartId(item?.id) || `pose-${index + 1}`;
    while (used.has(id)) id = `${id}-${used.size + 1}`;
    used.add(id);
    const name = voxelModeCleanPartName(item?.name, `Pose ${index + 1}`).slice(0, 28);
    return { id, name, poses };
  }).filter(Boolean);
}
function normalizeVoxelModeCameraViews(input = []) {
  const source = Array.isArray(input) ? input : [];
  return source.slice(0, 12).map((item, index) => {
    const view = VoxelFeatures?.cameraView ? VoxelFeatures.cameraView(item) : item;
    return { id: voxelModeCleanPartId(item?.id) || `camera-${index + 1}`, ...view };
  });
}

function defaultVoxelModel(size = 32) {
  const dim = Math.max(4, Math.min(Math.round(Number(size) || 32), MAX_VOXEL_MODE_DEPTH));
  const origin = defaultVoxelOrigin(dim, dim, dim);
  const viewCanvases = defaultVoxelViewCanvases(dim, dim, dim, origin);
  const parts = defaultVoxelParts(dim, dim, dim, origin);
  return {
    version: 6,
    sourceId: voxelModeSourceId(),
    width: dim,
    height: dim,
    depth: dim,
    origin,
    activePlane: viewCanvases[0].plane,
    activeSlice: viewCanvases[0].slice,
    activeViewCanvas: 0,
    viewCanvases,
    tool: "paint",
    brushSize: 1,
    brushDepth: 1,
    showGrid: true,
    openImportBounds: false,
    mirrorX: false,
    mirrorY: false,
    mirrorZ: false,
    shapeStyle: "filled",
    shapeWall: 1,
    cylinderAxis: "y",
    ghostSlices: false,
    stamps: [],
    animationFrames: [],
    animationActiveFrame: -1,
    animationLoopMode: "loop",
    animationSpeed: 1,
    animationExportScale: 0.5,
    animationOnionSkin: false,
    animationOnionOpacity: 0.35,
    animationAutoCapture: true,
    animationInterpolation: "step",
    poseLibrary: [],
    viewYaw: 0,
    cameraPreset: 6,
    cameraYaw: Math.PI / 4,
    cameraPitch: -Math.PI / 6,
    cameraZoom: 1,
    cameraPanX: 0,
    cameraPanY: 0,
    turntable: false,
    cameraViews: [],
    showAxes: true,
    activeMaterial: "matte",
    parts,
    activePartId: "part-root",
    soloPartId: "",
    armature: normalizeVoxelArmature({}, parts, dim, dim, dim, "part-root"),
    bindingView: false,
    rigVisible: true,
    rigPreview: true,
    deformationMode: "smooth",
    renderer: "webgl",
    projection: "orthographic",
    lightingPreset: "studio",
    lightYaw: 35,
    lightPitch: -45,
    ambient: 42,
    ambientOcclusion: true,
    floorShadow: true,
    groundPlane: true,
    depthFog: false,
    outlineMode: "all",
    fourView: false,
    cubes: []
  };
}

function voxelClampDimension(value, fallback = 32, maximum = MAX_VOXEL_MODE_CANVAS_DIMENSION) {
  return Math.max(4, Math.min(Math.round(Number(value) || fallback), maximum));
}
function voxelClampDepth(value, fallback = 32) {
  return voxelClampDimension(value, fallback, MAX_VOXEL_MODE_DEPTH);
}

function normalizeVoxelModel(input = {}) {
  const base = defaultVoxelModel(32);
  const width = voxelClampDimension(input.width, base.width);
  const height = voxelClampDimension(input.height, base.height);
  const depth = voxelClampDepth(input.depth, base.depth);
  const origin = normalizeVoxelOrigin(input.origin, width, height, depth);
  const parts = normalizeVoxelParts(input.parts, width, height, depth, origin);
  const partIds = new Set(parts.map(part => part.id));
  const activePartId = partIds.has(voxelModeCleanPartId(input.activePartId)) ? voxelModeCleanPartId(input.activePartId) : parts[0].id;
  const soloPartId = partIds.has(voxelModeCleanPartId(input.soloPartId)) ? voxelModeCleanPartId(input.soloPartId) : "";
  const armature = normalizeVoxelArmature(input.armature, parts, width, height, depth, activePartId);
  const boneIds = new Set(armature.bones.map(bone => bone.id));
  const boneByPart = new Map(armature.bones.map(bone => [bone.partId, bone.id]));
  const rawViewYaw = Math.round(Number(input.viewYaw) || 0);
  const viewYaw = ((rawViewYaw % VOXEL_MODE_VIEW_LABELS.length) + VOXEL_MODE_VIEW_LABELS.length) % VOXEL_MODE_VIEW_LABELS.length;
  const fallbackCameraPreset = Number.isInteger(Number(input.cameraPreset)) ? Number(input.cameraPreset) : (input.cameraYaw == null && input.cameraPitch == null ? viewYaw : -1);
  const cameraPreset = Math.max(-1, Math.min(Math.round(fallbackCameraPreset), VOXEL_MODE_CAMERA_PRESETS.length - 1));
  const presetCamera = VOXEL_MODE_CAMERA_PRESETS[cameraPreset] || VOXEL_MODE_CAMERA_PRESETS[6];
  const cameraYaw = Number.isFinite(Number(input.cameraYaw)) ? Number(input.cameraYaw) : presetCamera.yaw;
  const cameraPitch = Math.max(-Math.PI / 2, Math.min(Number.isFinite(Number(input.cameraPitch)) ? Number(input.cameraPitch) : presetCamera.pitch, Math.PI / 2));
  const cameraZoom = Math.max(0.35, Math.min(Number(input.cameraZoom) || 1, 5));
  const cameraPanX = Math.max(-4000, Math.min(Number(input.cameraPanX) || 0, 4000));
  const cameraPanY = Math.max(-4000, Math.min(Number(input.cameraPanY) || 0, 4000));
  const rawActiveViewCanvas = Math.round(Number(input.activeViewCanvas ?? viewYaw) || 0);
  const activeViewCanvas = ((rawActiveViewCanvas % VOXEL_MODE_VIEW_LABELS.length) + VOXEL_MODE_VIEW_LABELS.length) % VOXEL_MODE_VIEW_LABELS.length;
  const sourceViewCanvases = Array.isArray(input.viewCanvases) ? input.viewCanvases : [];
  const sourceStamps = Array.isArray(input.stamps) ? input.stamps : [];
  const stamps = sourceStamps.slice(0, 24).map((stamp, index) => normalizeVoxelModeStamp(stamp, index)).filter(Boolean);
  const sourceAnimationFrames = Array.isArray(input.animationFrames) ? input.animationFrames : [];
  const animationFrames = sourceAnimationFrames.slice(0, MAX_PROJECT_FRAMES).map((item, index) => normalizeVoxelModeAnimationFrame(item, index, width, height, depth, parts)).filter(Boolean);
  const poseLibrary = normalizeVoxelModePoseLibrary(input.poseLibrary, parts);
  const cameraViews = normalizeVoxelModeCameraViews(input.cameraViews);
  const viewCanvases = VOXEL_MODE_VIEW_LABELS.map((_label, index) => {
    const direct = sourceViewCanvases[index];
    const byYaw = sourceViewCanvases.find(item => Math.round(Number(item?.viewYaw)) === index);
    return normalizeVoxelViewCanvas(direct || byYaw || {}, index, width, height, depth, origin);
  });
  const canvasFallback = viewCanvases[activeViewCanvas] || viewCanvases[0];
  const activePlane = ["xy", "xz", "yz"].includes(input.activePlane) ? input.activePlane : canvasFallback.plane;
  const sliceMax = voxelSliceMaxForDimensions(activePlane, width, height, depth);
  const activeSlice = Math.max(0, Math.min(Math.round(Number(input.activeSlice ?? canvasFallback.slice) || 0), sliceMax));
  viewCanvases[activeViewCanvas] = normalizeVoxelViewCanvas({ ...viewCanvases[activeViewCanvas], plane: activePlane, slice: activeSlice }, activeViewCanvas, width, height, depth, origin);
  const tool = VOXEL_MODE_TOOLS.includes(input.tool) ? input.tool : "paint";
  const brushSize = Math.max(1, Math.min(Math.round(Number(input.brushSize) || 1), 6));
  const brushDepth = Math.max(1, Math.min(Math.round(Number(input.brushDepth) || 1), 12));
  const cubes = Array.isArray(input.cubes) ? input.cubes : [];
  const seen = new Map();
  cubes.slice(0, MAX_VOXEL_MODE_CUBES).forEach(cube => {
    const x = Math.round(Number(cube?.x));
    const y = Math.round(Number(cube?.y));
    const z = Math.round(Number(cube?.z));
    const cubeColor = String(cube?.color || "").toLowerCase();
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return;
    if (x < 0 || y < 0 || z < 0 || x >= width || y >= height || z >= depth) return;
    if (!isHexColor(cubeColor)) return;
    const material = VOXEL_MODE_MATERIALS.includes(cube?.material) ? cube.material : "matte";
    const partId = partIds.has(voxelModeCleanPartId(cube?.partId)) ? voxelModeCleanPartId(cube.partId) : parts[0].id;
    const requestedBoneId = voxelModeCleanArmatureId(cube?.boneId, "");
    const boneId = boneIds.has(requestedBoneId) ? requestedBoneId : boneByPart.get(partId) || armature.bones[0]?.id || "";
    const weights = VoxelWeighting?.manual(cube?.weights, boneIds) || [];
    seen.set(`${x},${y},${z}`, { x, y, z, color: cubeColor, material, partId, boneId, ...(weights.length ? { weights } : {}) });
  });
  const activeMaterial = VOXEL_MODE_MATERIALS.includes(input.activeMaterial) ? input.activeMaterial : "matte";
  const renderer = ["webgl", "canvas"].includes(input.renderer) ? input.renderer : "webgl";
  const projection = ["orthographic", "perspective"].includes(input.projection) ? input.projection : "orthographic";
  const lightingPreset = ["studio", "sunset", "game", "unlit"].includes(input.lightingPreset) ? input.lightingPreset : "studio";
  const lightYaw = Math.max(-180, Math.min(Number(input.lightYaw) || 35, 180));
  const lightPitch = Math.max(-89, Math.min(Number(input.lightPitch) || -45, 89));
  const ambient = Math.max(5, Math.min(Number(input.ambient) || 42, 100));
  const outlineMode = ["all", "soft", "none"].includes(input.outlineMode) ? input.outlineMode : "all";
  const animationActiveFrame = animationFrames.length ? Math.max(0, Math.min(Math.round(Number(input.animationActiveFrame) || 0), animationFrames.length - 1)) : -1;
  const animationLoopMode = ["loop", "pingpong", "once"].includes(input.animationLoopMode) ? input.animationLoopMode : "loop";
  const animationSpeed = [0.25, 0.5, 1, 1.5, 2, 4].includes(Number(input.animationSpeed)) ? Number(input.animationSpeed) : 1;
  const animationExportScale = [0.5, 0.75, 1].includes(Number(input.animationExportScale)) ? Number(input.animationExportScale) : 0.5;
  const animationOnionOpacity = Math.max(0.1, Math.min(Number(input.animationOnionOpacity) || 0.35, 0.8));
  const animationInterpolation = input.animationInterpolation === "linear" ? "linear" : "step";
  const shapeStyle = input.shapeStyle === "hollow" ? "hollow" : "filled";
  const shapeWall = Math.max(1, Math.min(Math.round(Number(input.shapeWall) || 1), 8));
  const cylinderAxis = ["x", "y", "z"].includes(input.cylinderAxis) ? input.cylinderAxis : "y";
  return {
    version: 6,
    sourceId: voxelModeSourceId(input.sourceId),
    width,
    height,
    depth,
    origin,
    activePlane,
    activeSlice,
    activeViewCanvas,
    viewCanvases,
    tool,
    brushSize,
    brushDepth,
    showGrid: input.showGrid !== false,
    openImportBounds: input.openImportBounds === true,
    mirrorX: input.mirrorX === true,
    mirrorY: input.mirrorY === true,
    mirrorZ: input.mirrorZ === true,
    shapeStyle,
    shapeWall,
    cylinderAxis,
    ghostSlices: input.ghostSlices === true,
    stamps,
    animationFrames,
    animationActiveFrame,
    animationLoopMode,
    animationSpeed,
    animationExportScale,
    animationOnionSkin: input.animationOnionSkin === true,
    animationOnionOpacity,
    animationAutoCapture: input.animationAutoCapture !== false,
    animationInterpolation,
    poseLibrary,
    viewYaw,
    cameraPreset,
    cameraYaw,
    cameraPitch,
    cameraZoom,
    cameraPanX,
    cameraPanY,
    turntable: input.turntable === true,
    cameraViews,
    showAxes: input.showAxes !== false,
    activeMaterial,
    parts,
    activePartId,
    soloPartId,
    armature,
    bindingView: input.bindingView === true,
    rigVisible: input.rigVisible !== false,
    rigPreview: input.rigPreview !== false,
    deformationMode: input.deformationMode === "smooth" ? "smooth" : "rigid",
    renderer,
    projection,
    lightingPreset,
    lightYaw,
    lightPitch,
    ambient,
    ambientOcclusion: input.ambientOcclusion !== false,
    floorShadow: input.floorShadow !== false,
    groundPlane: input.groundPlane !== false,
    depthFog: input.depthFog === true,
    outlineMode,
    fourView: input.fourView === true,
    cubes: Array.from(seen.values()).sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
  };
}

  return Object.freeze({
    voxelSliceMaxForDimensions,
    defaultVoxelOrigin,
    normalizeVoxelOrigin,
    defaultVoxelViewCanvas,
    defaultVoxelViewCanvases,
    normalizeVoxelViewCanvas,
    voxelModeCleanPartId,
    voxelModeCleanPartName,
    voxelModeVector,
    defaultVoxelParts,
    normalizeVoxelParts,
    voxelModeCleanArmatureId,
    voxelModeSourceId,
    voxelModeRootTail,
    normalizeVoxelArmature,
    normalizeVoxelModeClip,
    normalizeVoxelModeStamp,
    normalizeVoxelModePoseSnapshot,
    normalizeVoxelModeAnimationFrame,
    normalizeVoxelModePoseLibrary,
    normalizeVoxelModeCameraViews,
    defaultVoxelModel,
    voxelClampDimension,
    voxelClampDepth,
    normalizeVoxelModel
  });
});
