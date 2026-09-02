const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const features = require("../src/modules/voxel-features.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

test("connected selection stays on one island", () => {
  const cubes = [
    { x: 0, y: 0, z: 0, color: "#ffffff" },
    { x: 1, y: 0, z: 0, color: "#ffffff" },
    { x: 5, y: 0, z: 0, color: "#ffffff" }
  ];
  assert.deepEqual(features.connected(cubes, cubes[0]).map(features.key).sort(), ["0,0,0", "1,0,0"]);
  assert.equal(features.byColor([...cubes, { x: 2, y: 0, z: 0, color: "#000000" }], "#ffffff").length, 3);
});

test("voxel primitives support hollow shapes", () => {
  const box = { minX: 0, minY: 0, minZ: 0, maxX: 4, maxY: 4, maxZ: 4 };
  const solid = features.primitive("box", box);
  const hollow = features.primitive("box", box, { hollow: true, thickness: 1 });
  const cylinder = features.primitive("cylinder", box, { axis: "y" });
  assert.equal(solid.length, 125);
  assert.ok(hollow.length < solid.length);
  assert.ok(hollow.length > 0);
  assert.ok(cylinder.length > 0 && cylinder.length < solid.length);
});

test("mirror and pose interpolation preserve data", () => {
  const mirrored = features.mirror([{ x: 2, y: 3, z: 4, color: "#123456", partId: "arm" }], "x", { x: 5 });
  assert.deepEqual(mirrored[0], { x: 8, y: 3, z: 4, color: "#123456", partId: "arm" });
  const pose = features.poseLerp(
    { arm: { translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
    { arm: { translation: { x: 10, y: 2, z: -2 }, rotation: { x: 90, y: 0, z: 0 }, scale: { x: 2, y: 1, z: 1 } } },
    0.5
  );
  assert.equal(pose.arm.translation.x, 5);
  assert.equal(pose.arm.rotation.x, 45);
  assert.equal(pose.arm.scale.x, 1.5);
});

test("camera views are bounded and cleaned", () => {
  const view = features.cameraView({ name: "Bad<>/View", yaw: 999, pitch: 999, zoom: 99, panX: 99999, panY: -99999, projection: "perspective" });
  assert.equal(view.name, "BadView");
  assert.equal(view.projection, "perspective");
  assert.ok(view.yaw <= Math.PI * 8);
  assert.ok(view.pitch <= Math.PI / 2);
  assert.equal(view.zoom, 5);
  assert.equal(view.panX, 4000);
  assert.equal(view.panY, -4000);
});

test("large voxel previews keep sparse painted blocks", () => {
  const pixels = Array.from({ length: 22 }, () => Array(22).fill(null));
  pixels[10][10] = "#ff0000";
  pixels[20][20] = "#00ff00";
  assert.equal(features.sampleColor(pixels, 0, 0, 11), "#ff0000");
  assert.equal(features.sampleColor(pixels, 11, 11, 11), "#00ff00");
  assert.equal(features.sampleColor(pixels, 0, 11, 11), null);
});

test("adaptive voxel preview protects high-resolution imports", () => {
  assert.equal(features.previewStep(512, 512, 4, 48000), 5);
  assert.equal(Math.ceil(512 / features.previewStep(512, 512, 4, 48000)), 103);
  assert.equal(features.previewStep(512, 512, 8, 48000), 7);
  const importStart = renderer.indexOf("function importVoxelPreviewToVoxelMode()");
  const importEnd = renderer.indexOf("function voxelModeFrameCubesFromPreview", importStart);
  const importSource = renderer.slice(importStart, importEnd);
  assert.match(importSource, /High-resolution Voxel import warning/);
  assert.match(importSource, /window\.confirm/);
  assert.match(renderer, /VOXEL_MODE_IMPORT_CUBE_BUDGET = 48000/);
});

test("voxel selection has explicit select all and deselect controls", () => {
  assert.match(html, /id="voxel-mode-select-all-btn"[^>]*>Select All<\/button>/);
  assert.match(html, /id="voxel-mode-clear-selection-btn"[^>]*>Deselect<\/button>/);
  assert.match(renderer, /function selectAllVoxelModeCubes\(\)/);
  assert.match(renderer, /voxelModeSelectAllBtn\.onclick = selectAllVoxelModeCubes/);
  assert.match(renderer, /voxelModeParts\(\)\.length > 1/);
  assert.match(renderer, /bones\.length > 1/);
});

test("voxel expansion controls are connected", () => {
  [
    "voxel-mode-select-connected-btn",
    "voxel-mode-select-color-btn",
    "voxel-mode-shape-fill",
    "voxel-mode-cylinder-axis",
    "voxel-mode-part-duplicate-btn",
    "voxel-mode-part-solo-btn",
    "voxel-mode-pose-save-btn",
    "voxel-mode-animation-interpolation",
    "voxel-mode-camera-view-save-btn",
    "voxel-mode-focus-selection-btn"
  ].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  [
    "selectConnectedVoxelModeCubes",
    "mirrorCopyVoxelModeSelection",
    "duplicateVoxelModePart",
    "toggleVoxelModeSoloPart",
    "saveVoxelModePose",
    "focusVoxelModeSelection",
    "saveVoxelModeCameraView",
    "VoxelFeatures.poseLerp"
  ].forEach(name => assert.match(renderer, new RegExp(name.replace(".", "\\."))));
});

test("voxel expansion adds no package dependency", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(packageJson.dependencies, undefined);
  assert.deepEqual(Object.keys(packageJson.devDependencies).sort(), ["electron", "electron-builder"]);
});

test("voxel preview resolves the same playable pixels as base mode", () => {
  const previewStart = renderer.indexOf("function voxelPixels(options = {})");
  const previewEnd = renderer.indexOf("function mergeVoxelRects", previewStart);
  const frameStart = renderer.indexOf("function voxelPixelsForFrame(sourceFrame)");
  const frameEnd = renderer.indexOf("function blenderVoxelCubes", frameStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  assert.ok(frameStart >= 0 && frameEnd > frameStart);
  const previewSource = renderer.slice(previewStart, previewEnd);
  const frameSource = renderer.slice(frameStart, frameEnd);
  assert.match(previewSource, /layerPlayablePixels\(item, state\.activeFrame, index\)/);
  assert.match(frameSource, /layerPlayablePixels\(item, frameIndex >= 0 \? frameIndex : null, index\)/);
  assert.doesNotMatch(previewSource, /item\.pixels\[y\]/);
  assert.doesNotMatch(frameSource, /item\.pixels\[y\]/);
});

test("voxel mode imports the responsive preview grid", () => {
  const importStart = renderer.indexOf("function importVoxelPreviewToVoxelMode()");
  const importEnd = renderer.indexOf("function voxelModeFrameCubesFromPreview", importStart);
  assert.ok(importStart >= 0 && importEnd > importStart);
  const importSource = renderer.slice(importStart, importEnd);
  assert.match(importSource, /voxelPreviewGridBounds\(\)/);
  assert.match(importSource, /voxelPixels\(\{ merge: false, fresh: true \}\)/);
  assert.doesNotMatch(importSource, /preserveResolution/);
  assert.match(html, /id="voxel-mode-import-preview-btn"[^>]*aria-describedby="voxel-mode-import-preview-help"|aria-describedby="voxel-mode-import-preview-help"[^>]*id="voxel-mode-import-preview-btn"/);
});

test("voxel armature controls stay connected", () => {
  assert.match(html, /id="voxel-mode-bone-add-btn"[^>]*>Add Bone/);
  assert.match(renderer, /voxelModeBoneAddBtn\.onclick = addVoxelModeBone/);
  assert.match(renderer, /\[voxelModeBoneNameInput, voxelModeBoneRadiusInput, voxelModeBoneRollInput, voxelModeBoneDeformInput\]/);
  assert.match(renderer, /if \(part\) part\.name = name;[\s\S]*bone\.name = name;/);
  const refs = [...renderer.matchAll(/const (voxelMode\w+) = \$\("#(voxel-mode-[^"]+)"\);/g)];
  assert.ok(refs.length > 200);
  const refById = new Map(refs.map(([, variable, id]) => [id, variable]));
  refs.forEach(([, variable, id]) => {
    const count = (renderer.match(new RegExp(`\\b${variable}\\b`, "g")) || []).length;
    assert.ok(count >= 2, `${id} is declared but not used`);
  });
  const buttonIds = [...html.matchAll(/<button[^>]*\bid="(voxel-mode-[^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.ok(buttonIds.length > 100);
  buttonIds.forEach(id => assert.ok(refById.has(id), `${id} has no renderer reference`));
});


test("voxel preview re-import resets live rig interaction state", () => {
  const importStart = renderer.indexOf("function importVoxelPreviewToVoxelMode()");
  const importEnd = renderer.indexOf("function voxelModeFrameCubesFromPreview", importStart);
  const importSource = renderer.slice(importStart, importEnd);
  assert.match(renderer, /function resetVoxelModeRigInteractionState\(\)/);
  assert.match(importSource, /resetVoxelModeRigInteractionState\(\)/);
  assert.match(renderer, /voxelModeBoneDraw\.currentPartId = "";/);
  assert.match(renderer, /voxelModePreviewInteraction = null;/);
});

test("draft voxel previews keep rig hit targets", () => {
  const draftStart = renderer.indexOf("function drawVoxelModeDraftPreview");
  const draftEnd = renderer.indexOf("function drawVoxelModeCanvasGround", draftStart);
  const draftSource = renderer.slice(draftStart, draftEnd);
  assert.match(draftSource, /keepRigHits = voxelModeBoneDraw\.active/);
  assert.match(draftSource, /voxelModePreviewFaces = \[\]/);
  assert.match(draftSource, /voxelModePreviewFaces\.push/);
  assert.match(draftSource, /cube: item\.cube/);
});
