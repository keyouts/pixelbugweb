const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const weighting = require("../src/modules/voxel-weighting.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

test("voxel weights normalize to four valid influences", () => {
  const valid = new Set(["a", "b", "c", "d", "e"]);
  const weights = weighting.normalize([
    { boneId: "a", weight: 2 },
    { boneId: "b", weight: 1 },
    { boneId: "c", weight: 1 },
    { boneId: "d", weight: 1 },
    { boneId: "e", weight: 0.25 },
    { boneId: "missing", weight: 20 }
  ], valid);
  assert.equal(weights.length, 4);
  assert.ok(Math.abs(weights.reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-10);
  assert.ok(weights.every(item => valid.has(item.boneId)));
  assert.ok(!weights.some(item => item.boneId === "missing"));
});

test("weight paint blends toward the target without inventing another bone", () => {
  const valid = new Set(["arm", "torso"]);
  const raised = weighting.paint([], "arm", 1, 0.5, [{ boneId: "arm", weight: 0.2 }, { boneId: "torso", weight: 0.8 }], valid);
  assert.ok(Math.abs(weighting.selectedWeight(raised, "arm") - 0.6) < 1e-10);
  assert.ok(Math.abs(weighting.selectedWeight(raised, "torso") - 0.4) < 1e-10);
  const lowered = weighting.paint([{ boneId: "arm", weight: 1 }], "arm", 0, 1, [{ boneId: "arm", weight: 1 }], valid);
  assert.equal(weighting.selectedWeight(lowered, "arm"), 0);
  assert.equal(weighting.selectedWeight(lowered, "torso"), 0);
  assert.deepEqual(lowered, [{ boneId: "arm", weight: 0 }]);
});

test("single-bone manual weights preserve partial and zero values", () => {
  const valid = new Set(["arm"]);
  const half = weighting.paint([], "arm", 0.5, 1, [{ boneId: "arm", weight: 1 }], valid);
  assert.deepEqual(half, [{ boneId: "arm", weight: 0.5 }]);
  assert.deepEqual(weighting.manual(half, valid), half);
  const zero = weighting.paint(half, "arm", 0, 1, [{ boneId: "arm", weight: 1 }], valid);
  assert.deepEqual(zero, [{ boneId: "arm", weight: 0 }]);
  const moved = weighting.blendPoint({ x: 10, y: 0, z: 0 }, half, point => ({ ...point, x: point.x + 10 }));
  assert.equal(moved.x, 15);
});

test("weight brush coordinates stay inside the requested voxel radius", () => {
  const points = weighting.brushCoords({ x: 5, y: 6, z: 7 }, 3);
  assert.ok(points.length > 1);
  assert.ok(points.some(point => point.x === 5 && point.y === 6 && point.z === 7));
  assert.ok(points.every(point => Math.hypot(point.x - 5, point.y - 6, point.z - 7) <= 2.85 + 1e-10));
  assert.match(weighting.heatColor(0.5), /^#[0-9a-f]{6}$/i);
});

test("painted voxel weights share corner influence without seams", () => {
  const cubes = new Map([
    ["0,0,0", { weights: [{ boneId: "left", weight: 1 }] }],
    ["1,0,0", { weights: [{ boneId: "right", weight: 1 }] }]
  ]);
  const lookup = (x, y, z) => cubes.get(`${x},${y},${z}`);
  const valid = new Set(["left", "right"]);
  const shared = weighting.sharedPointWeights({ x: 1, y: 0.5, z: 0.5 }, lookup, [{ boneId: "left", weight: 0.25 }, { boneId: "right", weight: 0.75 }], valid);
  assert.ok(Math.abs(weighting.selectedWeight(shared, "left") - 0.5) < 1e-10);
  assert.ok(Math.abs(weighting.selectedWeight(shared, "right") - 0.5) < 1e-10);
  const leftOnly = weighting.sharedPointWeights({ x: 0, y: 0.5, z: 0.5 }, lookup, [], valid);
  assert.equal(weighting.selectedWeight(leftOnly, "left"), 1);
  const mixed = new Map([["0,0,0", { weights: [{ boneId: "left", weight: 1 }] }], ["1,0,0", {}]]);
  const paintedBoundary = weighting.sharedPointWeights({ x: 1, y: 0.5, z: 0.5 }, (x, y, z) => mixed.get(`${x},${y},${z}`), [{ boneId: "right", weight: 1 }], valid);
  assert.equal(weighting.selectedWeight(paintedBoundary, "left"), 1);
});

test("smooth deformation keeps bound and unbound voxel boundaries welded", () => {
  const cubes = new Map([
    ["0,0,0", { boneId: "arm" }],
    ["1,0,0", { boneId: "" }]
  ]);
  const lookup = (x, y, z) => cubes.get(`${x},${y},${z}`);
  const valid = new Set(["arm"]);
  const automatic = [{ boneId: "arm", weight: 1 }];
  const boundary = weighting.sharedPointWeights({ x: 1, y: 0.5, z: 0.5 }, lookup, automatic, valid);
  assert.equal(weighting.selectedWeight(boundary, "arm"), 1);
  const outside = weighting.sharedPointWeights({ x: 2, y: 0.5, z: 0.5 }, lookup, automatic, valid);
  assert.deepEqual(outside, []);
  const transformStart = renderer.indexOf("function voxelModeCubeTransformPoint");
  const transformEnd = renderer.indexOf("// Camera controls", transformStart);
  const transformSource = renderer.slice(transformStart, transformEnd);
  assert.match(transformSource, /const influences = voxelModeCubeInfluences\(cube, point\)/);
  assert.match(transformSource, /influences\.length \? voxelModeBlendPoint/);
});

test("weight paint opens in the shared rigging workspace", () => {
  const rigStart = html.indexOf('data-voxel-workspace-source="rigging"');
  const animationStart = html.indexOf('data-voxel-workspace-source="animation"', rigStart);
  const rigging = html.slice(rigStart, animationStart);
  assert.ok(rigStart > 0 && animationStart > rigStart);
  assert.match(html, /data-voxel-workspace-open="rigging"[^>]*>Rigging<\/button>/);
  assert.match(rigging, /data-voxel-tool="bone-select"[^>]*>Bone Select<\/button>/);
  assert.match(rigging, /id="voxel-mode-weight-paint-btn"[^>]*>Weight Paint<\/button>/);
  assert.match(rigging, /id="voxel-mode-binding-view"[^>]*\/> Weight View/);
  assert.match(rigging, /for="voxel-mode-bone-radius">Influence Radius<\/label>/);
  assert.match(rigging, /id="voxel-mode-weight-value"/);
  assert.match(rigging, /id="voxel-mode-weight-strength"/);
  assert.match(rigging, /id="voxel-mode-weight-brush"/);
  assert.match(html, /id="voxel-workspace-preview-host"/);
  assert.match(html, /class="sr-only" id="voxel-influence-radius-help"/);
  assert.match(html, /class="sr-only" id="voxel-weight-paint-help"/);
  assert.match(html, /class="sr-only" id="voxel-bone-select-help"/);
  assert.ok(html.indexOf("./modules/voxel-weighting.js") < html.indexOf("./renderer.js"));
});

test("bone select targets bone segments without enabling edit mode", () => {
  assert.match(renderer, /VOXEL_MODE_TOOLS = \[[^\]]*"bone-select"/);
  assert.match(renderer, /boneSelect = voxelModel\(\)\.tool === "bone-select"/);
  assert.match(renderer, /voxelModeBoneEdit\.active \|\| poseMode \|\| boneSelect/);
  assert.match(renderer, /model\.tool === "bone-select"[\s\S]*?hit\.type === "rig-bone"[\s\S]*?voxelModeSelectArmaturePoint/);
});

test("manual weights flow through posing and rigged exports", () => {
  const influenceStart = renderer.indexOf("function voxelModeCubeInfluences");
  const influenceEnd = renderer.indexOf("function voxelModeCubeTransformPoint", influenceStart);
  const influenceSource = renderer.slice(influenceStart, influenceEnd);
  assert.match(influenceSource, /VoxelWeighting\?\.sharedPointWeights/);
  assert.match(influenceSource, /VoxelWeighting\?\.manual\(cube\?\.weights/);
  assert.match(renderer, /jointBlend: model\.deformationMode === "rigid" \? 0 : voxelModeSortedCubes\(\)\.some\(cube => cube\.weights\?\.length\) \? "manual-and-automatic" : "automatic-envelopes"/);
  assert.match(renderer, /const weightKey = JSON\.stringify\(VoxelWeighting\?\.manual\(cube\.weights\) \|\| \[\]\)/);
  assert.match(renderer, /weights: group\.weights/);
  assert.match(renderer, /weights: quad\.weights/);
});



test("preview weight-paint stroke mutates the hit voxel on a one-bone rig", () => {
  const start = renderer.indexOf("function applyVoxelModeWeightPaint(hit, clear = false)");
  const end = renderer.indexOf("function clearVoxelModePaintedWeights", start);
  const source = renderer.slice(start, end);
  const map = new Map([["0,0,0", { x: 0, y: 0, z: 0, partId: "part-root", boneId: "bone-1" }]]);
  const apply = new Function(
    "voxelModeMap", "voxelModeKey", "voxelModeSelectedBone", "voxelModeArmatureBones", "voxelModeWeightValueInput", "voxelModeWeightStrengthInput", "voxelModeWeightBrushInput", "VoxelWeighting", "voxelModePartLocked", "voxelModePointInfluences", "voxelModeCubeCenter", "voxelModeRememberBefore", "markVoxelModeChunkDirty", "voxelModeStrokeChanged", "syncVoxelModelFromMap", "drawVoxelModeSliceChanges", "renderVoxelModeBoneList", "drawVoxelModePreview",
    `${source}; return applyVoxelModeWeightPaint;`
  )(
    () => map,
    (x, y, z) => `${x},${y},${z}`,
    () => ({ id: "bone-1" }),
    () => [{ id: "bone-1", deform: true }],
    { value: "50" },
    { value: "100" },
    { value: "1" },
    weighting,
    () => false,
    () => [{ boneId: "bone-1", weight: 1 }],
    weighting.cubeCenter,
    () => {},
    () => {},
    false,
    () => {},
    () => {},
    () => {},
    () => {}
  );
  const hit = { type: "face", face: { cube: { x: 0, y: 0, z: 0 } } };
  assert.equal(apply(hit, false), true);
  assert.deepEqual(map.get("0,0,0").weights, [{ boneId: "bone-1", weight: 0.5 }]);
  assert.equal(apply(hit, true), true);
  assert.equal(Object.hasOwn(map.get("0,0,0"), "weights"), false);
});

test("weight paint stores partial manual values instead of renormalizing them", () => {
  const start = renderer.indexOf("function applyVoxelModeWeightPaint(hit, clear = false)");
  const end = renderer.indexOf("function clearVoxelModePaintedWeights", start);
  const source = renderer.slice(start, end);
  assert.match(source, /VoxelWeighting\?\.manual\(cube\.weights, valid\)/);
  assert.doesNotMatch(source, /VoxelWeighting\?\.normalize\(cube\.weights, valid\)/);
  assert.match(renderer, /const nextWeights = VoxelWeighting\?\.manual\(cubeWeights === undefined \? previous\?\.weights : cubeWeights\)/);
  assert.match(renderer, /scale = total > 1 \? 1 \/ total : 1/);
  assert.doesNotMatch(renderer, /rounded\[0\]\[1\].*1 - roundedTotal/);
});

test("voxel transforms preserve painted weights and rebinding clears them", () => {
  const scaleStart = renderer.indexOf("function scaleVoxelModeSelection");
  const scaleEnd = renderer.indexOf("function applyVoxelModeExactTransform", scaleStart);
  const scaleSource = renderer.slice(scaleStart, scaleEnd);
  assert.match(scaleSource, /weights: clone\(cube\.weights\)/);
  assert.match(renderer, /cube\.boneId = nearest\.boneId; delete cube\.weights;/);
  assert.match(renderer, /cube\.boneId = bone\.id; delete cube\.weights;/);
  assert.match(renderer, /stored\.boneId = target\.id;\s*delete stored\.weights;/);
});


test("fresh voxel rigs use two explicit endpoints and no automatic root", () => {
  assert.match(renderer, /rigBone: false/);
  assert.match(renderer, /const rigParts = parts\.filter\(part => part\?\.rigBone === true \|\| oldBoneByPart\.has\(part\.id\)\)/);
  assert.match(renderer, /if \(!voxelModeArmatureBones\(\)\.length\) return "Bone 1"/);
  assert.match(renderer, /startPoint: null, startJointId: ""/);
  const placeStart = renderer.indexOf("function placeVoxelModeBoneJoint(hit)");
  const placeEnd = renderer.indexOf("// Pose controls", placeStart);
  const place = renderer.slice(placeStart, placeEnd);
  const stage = place.indexOf("if (!voxelModeBoneDraw.startPoint)");
  const create = place.indexOf('const joint = voxelModeCreateJoint(point, "", head)');
  assert.ok(stage >= 0 && create > stage, "the first click must stage a head before any root bone is created");
  assert.match(place, /voxelModeBoneDraw\.startPoint = \{ \.\.\.point \};[\s\S]*?Placed Bone 1's head\. Click to place its tail\./);
  assert.match(place, /const head = \{ \.\.\.voxelModeBoneDraw\.startPoint \};[\s\S]*?voxelModeCreateJoint\(point, "", head\)/);
  assert.doesNotMatch(place, /defaultVoxelOrigin/);
  assert.match(renderer, /connected: Boolean\(parentBoneId\)/);
  assert.match(html, /id="voxel-mode-armature-summary">0 bones · click two endpoints for Bone 1<\/output>/);
});

test("bone endpoints can arm Blender-style extrusion", () => {
  assert.match(renderer, /function voxelModeSelectBoneDrawEndpoint\(handle\)/);
  assert.match(renderer, /tailBone = attached\.find\(bone => bone\.tailJointId === handle\.jointId\)/);
  assert.match(renderer, /Selected .*tail\. Click to extrude a child bone/);
  assert.match(renderer, /function voxelModeCreateRootHeadExtrusion\(point, sourceBone, before\)/);
  assert.match(renderer, /sourcePart\.parentId = parent\.id;\s*delete sourcePart\.rigHead;/);
  assert.match(renderer, /voxelModeBoneExtrudeBtn\.onclick = beginVoxelModeBoneExtrude/);
  assert.match(html, /Extrude uses the selected bone endpoint and lets you click the new endpoint in the 3D view/);
});

test("quick pose reset targets the quick pose bone and restores bind transforms", () => {
  assert.match(renderer, /function resetVoxelModeQuickPose\(\)/);
  assert.match(renderer, /const part = voxelModeQuickPosePart\(\)/);
  assert.match(renderer, /part\.translation = \{ x: 0, y: 0, z: 0 \}/);
  assert.match(renderer, /part\.rotation = \{ x: 0, y: 0, z: 0 \}/);
  assert.match(renderer, /part\.scale = \{ x: 1, y: 1, z: 1 \}/);
  assert.match(renderer, /voxelModeQuickPoseResetBtn\.onclick = resetVoxelModeQuickPose/);
});

test("smooth posing gives every voxel automatic influence instead of leaving cells behind", () => {
  const influenceStart = renderer.indexOf("function voxelModeCubeInfluences");
  const influenceEnd = renderer.indexOf("function voxelModeBlendPoint", influenceStart);
  const source = renderer.slice(influenceStart, influenceEnd);
  const resolve = new Function("voxelModeBoneById", "voxelModel", "voxelModeArmatureBones", "voxelModePointInfluences", "VoxelWeighting", "voxelModeMap", "voxelModeKey", `${source}; return voxelModeCubeInfluences;`)(
    () => null,
    () => ({ deformationMode: "smooth" }),
    () => [{ id: "arm", deform: true }, { id: "body", deform: true }],
    () => [{ boneId: "arm", weight: 0.75 }, { boneId: "body", weight: 0.25 }],
    weighting,
    () => new Map(),
    (x, y, z) => `${x},${y},${z}`
  );
  assert.deepEqual(resolve({ boneId: "" }, { x: 8.5, y: 8.5, z: 8.5 }), [{ boneId: "arm", weight: 0.75 }, { boneId: "body", weight: 0.25 }]);
  assert.doesNotMatch(source, /if \(!bone \|\| bone\.deform === false\) return \[\]/);
});


test("active rig painting modes own preview clicks before bone select and generic orbit", () => {
  const start = renderer.indexOf("function beginVoxelModePreviewInteraction(event)");
  const end = renderer.indexOf("function moveVoxelModePreviewInteraction(event)", start);
  const source = renderer.slice(start, end);
  const draw = source.indexOf("if (voxelModeBoneDraw.active)");
  const weight = source.indexOf("if (voxelModeWeightPaint.active)");
  const bind = source.indexOf("if (voxelModeBindPaint.active)");
  const boneSelect = source.indexOf('if (model.tool === "bone-select"');
  const backgroundOrbit = source.indexOf('hit.type === "background"');
  assert.ok(draw >= 0 && weight > draw && bind > weight);
  assert.ok(boneSelect > bind, "Bone Select must not steal Draw Bones or Weight Paint clicks");
  assert.ok(backgroundOrbit > boneSelect, "automatic background orbit must run after active rig tools");
  assert.match(renderer, /rigActionMode = voxelModeBoneDraw\.active \|\| voxelModeBoneEdit\.active \|\| voxelModeBindPaint\.active \|\| voxelModeWeightPaint\.active/);
  assert.match(renderer, /boneSelect = voxelModel\(\)\.tool === "bone-select" && !rigActionMode/);
  assert.match(renderer, /if \(!rigPointerMode\) for \(let index = voxelModeGizmoHandles\.length - 1/);
});

test("weight paint strength directly scales painted influence", () => {
  const start = renderer.indexOf("function applyVoxelModeWeightPaint(hit, clear = false)");
  const end = renderer.indexOf("function clearVoxelModePaintedWeights", start);
  const source = renderer.slice(start, end);
  const map = new Map([["0,0,0", { x: 0, y: 0, z: 0, partId: "part-root", boneId: "bone-1" }]]);
  const apply = new Function(
    "voxelModeMap", "voxelModeKey", "voxelModeSelectedBone", "voxelModeArmatureBones", "voxelModeWeightValueInput", "voxelModeWeightStrengthInput", "voxelModeWeightBrushInput", "VoxelWeighting", "voxelModePartLocked", "voxelModePointInfluences", "voxelModeCubeCenter", "voxelModeRememberBefore", "markVoxelModeChunkDirty", "voxelModeStrokeChanged", "syncVoxelModelFromMap", "drawVoxelModeSliceChanges", "renderVoxelModeBoneList", "drawVoxelModePreview",
    `${source}; return applyVoxelModeWeightPaint;`
  )(
    () => map,
    (x, y, z) => `${x},${y},${z}`,
    () => ({ id: "bone-1" }),
    () => [{ id: "bone-1", deform: true }],
    { value: "100" },
    { value: "25" },
    { value: "1" },
    weighting,
    () => false,
    () => [{ boneId: "bone-1", weight: 1 }],
    weighting.cubeCenter,
    () => {},
    () => {},
    false,
    () => {},
    () => {},
    () => {},
    () => {}
  );
  assert.equal(apply({ type: "face", face: { cube: { x: 0, y: 0, z: 0 } } }, false), true);
  assert.deepEqual(map.get("0,0,0").weights, [{ boneId: "bone-1", weight: 0.25 }]);
  const moved = weighting.blendPoint({ x: 0, y: 0, z: 0 }, map.get("0,0,0").weights, point => ({ ...point, x: point.x + 8 }));
  assert.equal(moved.x, 2);
});

test("weight paint always enables posed deformation preview", () => {
  const start = renderer.indexOf("function toggleVoxelModeWeightPaint()");
  const end = renderer.indexOf("function applyVoxelModeWeightPaint", start);
  const source = renderer.slice(start, end);
  assert.match(source, /model\.rigVisible = model\.rigPreview = true/);
  assert.match(source, /voxelModeRigPreviewInput\.checked = true/);
});

test("weight paint cannot fall through into voxel geometry editing", () => {
  const start = renderer.indexOf("function applyVoxelModePreviewEdit(hit, eraseOverride = false)");
  const end = renderer.indexOf("function beginVoxelModePreviewInteraction", start);
  const source = renderer.slice(start, end);
  assert.match(source, /if \(voxelModeBoneDraw\.active \|\| voxelModeBoneEdit\.active \|\| voxelModeBindPaint\.active \|\| voxelModeWeightPaint\.active\) return false/);
  const apply = new Function("voxelModeBoneDraw", "voxelModeBoneEdit", "voxelModeBindPaint", "voxelModeWeightPaint", `${source}; return applyVoxelModePreviewEdit;`)(
    { active: false }, { active: false }, { active: false }, { active: true }
  );
  assert.equal(apply({ type: "plane", cell: { col: 0, row: 0 } }, false), false);
});

test("draft preview shows weight heat colors instead of original voxel colors", () => {
  const start = renderer.indexOf("function drawVoxelModeDraftPreview");
  const end = renderer.indexOf("function drawVoxelModeCanvasGround", start);
  const source = renderer.slice(start, end);
  assert.match(source, /activeWeightBone = model\.bindingView === true \? voxelModeSelectedBone\(\) : null/);
  assert.match(source, /VoxelWeighting\.heatColor\(VoxelWeighting\.selectedWeight\(voxelModeCubeInfluences/);
});
