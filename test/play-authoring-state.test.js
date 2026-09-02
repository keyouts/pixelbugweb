"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const PlayAuthoringState = require("../src/modules/renderer/play-authoring-state.js");

test("play authoring defaults stay stable", () => {
  const layers = PlayAuthoringState.defaultPlayVisualLayers();
  assert.equal(layers.length, 5);
  assert.deepEqual(layers[0], { id: "sky", name: "Sky", role: "background", frame: -1, scale: 8, parallax: 0.04, y: 0, opacity: 1, repeatX: false, visible: true, fit: "cover" });
  assert.deepEqual(layers[4], { id: "overlay", name: "OVERLAY", role: "overlay", frame: -1, scale: 6, parallax: 0, y: 0, opacity: 1, repeatX: false, visible: false, fit: "cover" });
  const dialogue = PlayAuthoringState.defaultDialogueState();
  assert.equal(dialogue.characters.length, 2);
  assert.equal(dialogue.lines.length, 2);
  assert.equal(dialogue.lines[0].speaker, "Character A");
});

test("play layers retain original bounds and overlay rules", () => {
  const layer = PlayAuthoringState.clampPlayLayer({ role: "overlay", frame: 99, scale: 80, parallax: 3, y: -5000, opacity: 2, repeatX: true, fit: "tile" }, 4, 3);
  assert.equal(layer.name, "OVERLAY");
  assert.equal(layer.frame, 2);
  assert.equal(layer.scale, 32);
  assert.equal(layer.parallax, 0);
  assert.equal(layer.y, -1024);
  assert.equal(layer.opacity, 1);
  assert.equal(layer.repeatX, false);
  assert.equal(layer.fit, "cover");
});

test("play audio normalizers preserve validation limits", () => {
  const valid = "data:audio/wav;base64,QUJDRA==";
  const helper = { MAX_AUDIO_CHARS: 128, MAX_FILE_BYTES: 32, dataUrlByteLength: () => 4 };
  const record = PlayAuthoringState.normalizePlayAudioRecord({ assetId: "A bad id!", name: "Track", dataUrl: valid, volume: 2, loop: false }, helper);
  assert.deepEqual(record, { assetId: "A-bad-id-", name: "Track", dataUrl: valid, volume: 1, loop: false });
  const rejected = PlayAuthoringState.normalizePlayAudioRecord({ dataUrl: valid }, { ...helper, dataUrlByteLength: () => 33 });
  assert.equal(rejected.dataUrl, "");
});

test("play UI settings remain sanitized and inspected", () => {
  let inspected = null;
  const ui = PlayAuthoringState.parsePlayUiModCode(JSON.stringify({ dialogueBorderWidth: 99, dialogueFont: "bad; font", dialoguePortrait: false }), (value, limits) => { inspected = { value, limits }; });
  assert.equal(ui.dialogueBorderWidth, 16);
  assert.equal(ui.dialogueFont, "system-ui, sans-serif");
  assert.equal(ui.dialoguePortrait, false);
  assert.deepEqual(inspected.limits, { maxDepth: 12, maxValues: 256, maxStringChars: 6000 });
  assert.throws(() => PlayAuthoringState.parsePlayUiModCode("x".repeat(6001)), /too long/i);
});
