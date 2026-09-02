"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { decodePsdTemplateAsync } = require("../src/main/psd-worker-client");

const root = path.join(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
const documentWorkflow = fs.readFileSync(path.join(root, "src", "modules", "renderer", "document-workflow.js"), "utf8");
const recoveryWorkflow = fs.readFileSync(path.join(root, "src", "modules", "renderer", "recovery-workflow.js"), "utf8");

function rawPsd() {
  const bytes = new Uint8Array(43);
  bytes.set([0x38, 0x42, 0x50, 0x53], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 1, false);
  view.setUint16(12, 3, false);
  view.setUint32(14, 1, false);
  view.setUint32(18, 1, false);
  view.setUint16(22, 8, false);
  view.setUint16(24, 3, false);
  view.setUint16(38, 0, false);
  bytes.set([12, 34, 56], 40);
  return bytes.buffer;
}

test("PSD decoding leaves the main thread", async () => {
  const result = await decodePsdTemplateAsync(rawPsd());
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.deepEqual([...new Uint8Array(result.rgba)], [12, 34, 56, 255]);
  const workerPath = path.join(__dirname, "fixtures", "idle-worker.js");
  await assert.rejects(decodePsdTemplateAsync(rawPsd(), { workerPath, timeoutMs: 100 }), /timed out/);
});

test("voxel worker merges packed neighboring cubes", () => {
  let result;
  const context = { self: { postMessage: value => { result = value; } } };
  const source = fs.readFileSync(path.join(root, "src", "workers", "voxel-mesh-worker.js"), "utf8");
  vm.runInNewContext(source, context);
  context.self.onmessage({ data: {
    id: 7,
    positions: new Int32Array([0, 0, 0, 1, 0, 0]),
    colorIndices: new Uint32Array([0, 0]),
    materialIndices: new Uint32Array([0, 0]),
    partIndices: new Uint32Array([0, 0]),
    boneIndices: new Uint32Array([0, 0]),
    colors: ["#123456"],
    materials: ["matte"],
    parts: ["part-root"],
    bones: [""],
    deformationMode: "rigid"
  } });
  assert.equal(result.ok, true);
  assert.equal(result.id, 7);
  assert.equal(result.quads.length, 6);
});

test("close recovery and runtime isolation stay connected", () => {
  assert.match(main, /window-close-requested/);
  assert.match(main, /complete-window-close/);
  assert.match(main, /renderer-close-ready/);
  assert.match(main, /!state\?\.ready/);
  assert.match(main, /state\.ready = false;\s*state\.pending = false;/);
  assert.match(preload, /onWindowCloseRequested/);
  assert.match(preload, /signalWindowCloseReady/);
  assert.match(renderer, /window\.addEventListener\("load", \(\) => window\.pixelBug\?\.signalWindowCloseReady/);
  assert.match(recoveryWorkflow, /await flush\(\)/);
  assert.match(recoveryWorkflow, /catch \(error\) \{\s*closeFlushCompleted = false;/);
  assert.match(renderer, /playAuthoringMode = state\.playMode/);
  assert.match(renderer, /state\.playMode = playAuthoringMode/);
  assert.match(renderer, /if \(playRunning\) setPlayRunning\(false\);\s*else if \(playAuthoringMode\) restorePlayAuthoringMode\(\);\s*state = prepareProject\(next\);/);
  assert.match(renderer, /function resetBaseHistory\(\) \{[^}]*layerOpacityHistoryActive = false;/);
  assert.match(renderer, /worker\.terminate\(\)/);
  const meshSource = renderer.slice(renderer.indexOf("function voxelModeGreedyQuadsAsync"), renderer.indexOf("function voxelModeQuadEditorPoints"));
  assert.equal((meshSource.match(/voxelModeGreedyQuads\(\)/g) || []).length, 1);
  assert.match(meshSource, /try \{\s*worker\.postMessage[\s\S]*catch \(error\) \{\s*finish\(error\);/);
  assert.match(documentWorkflow, /const saveAsRequired = forceDialog \|\| documentRecord\?\.readOnly === true;[\s\S]*saveAsRequired \? "Project saved as a new file\."/);
});

test("release and privacy constraints remain explicit", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(manifest.version, "1.5.18");
  assert.equal(lock.version, "1.5.18");
  assert.equal(lock.packages[""].version, "1.5.18");
  assert.equal(manifest.devDependencies.electron, "42.9.1");
  assert.equal(lock.packages["node_modules/electron"].version, "42.9.1");
  assert.equal(manifest.build.extraResources.some(entry => entry.to === "LICENSE"), true);
  assert.equal(manifest.build.extraResources.some(entry => entry.to === "PRIVACY_POLICY.md"), true);
});
