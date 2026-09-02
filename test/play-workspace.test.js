"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const PlayWorkspace = require("../src/modules/renderer/play-workspace.js");

function playModeFixture() {
  return {
    activeSceneId: "one",
    props: [{ nodeTriggerId: "door", frame: 0 }],
    dialogue: { characters: [{ id: "actor", role: "actor" }, { id: "guide", name: "Guide", role: "npc", startLine: 0 }] },
    scenes: [
      { id: "one", name: "One", props: [{ nodeTriggerId: "door", frame: 0 }], dialogue: { characters: [{ id: "actor", role: "actor" }, { id: "guide", name: "Guide", role: "npc", startLine: 0 }] } },
      { id: "two", name: "Two", props: [{ nodeTriggerId: "door", frame: 1 }, { nodeTriggerId: "lever", frame: 2 }], dialogue: { characters: [{ id: "actor", role: "actor" }, { id: "guide", name: "Other Guide", role: "npc", startLine: 1 }] } }
    ],
    audioLibrary: [{ id: "bell" }],
    nodeEditor: { nodes: [] }
  };
}

test("play workspace resolves scene-scoped objects and characters", () => {
  const playMode = playModeFixture();
  assert.deepEqual(PlayWorkspace.triggerOptions(playMode, "one").map(item => item.id), ["door"]);
  assert.deepEqual(PlayWorkspace.triggerOptions(playMode, "two").map(item => item.id), ["door", "lever"]);
  assert.equal(PlayWorkspace.triggerOptions(playMode, "").length, 3);
  assert.equal(PlayWorkspace.characterOptions(playMode, "one")[0].name, "Guide");
  assert.equal(PlayWorkspace.characterOptions(playMode, "two")[0].name, "Other Guide");
});

test("play validation accepts same object names in different scenes when rules are scoped", () => {
  const playMode = playModeFixture();
  playMode.nodeEditor.nodes = [
    { id: "touch-one", type: "eventTrigger", name: "Door One", next: "message", alt: "", data: { trigger: "door", sceneId: "one" } },
    { id: "touch-two", type: "eventTrigger", name: "Door Two", next: "message", alt: "", data: { trigger: "door", sceneId: "two" } },
    { id: "message", type: "actionMessage", name: "Message", next: "", alt: "", data: {} }
  ];
  const result = PlayWorkspace.validate(playMode);
  assert.deepEqual(result.errors, []);
});

test("play validation catches broken scoped rules and export references", () => {
  const playMode = playModeFixture();
  playMode.nodeEditor.nodes = [
    { id: "bad-touch", type: "eventTrigger", name: "Bad Touch", next: "missing", alt: "", data: { trigger: "lever", sceneId: "one" } },
    { id: "bad-interact", type: "eventInteract", name: "Bad Talk", next: "", alt: "", data: { character: "missing-char", sceneId: "two" } },
    { id: "bad-scene", type: "actionScene", name: "Bad Scene", next: "", alt: "", data: { sceneId: "missing-scene" } },
    { id: "bad-audio", type: "actionPlaySound", name: "Bad Audio", next: "", alt: "", data: { audioAssetId: "missing-audio" } }
  ];
  const result = PlayWorkspace.validate(playMode);
  assert.ok(result.errors.some(error => /missing next rule/i.test(error)));
  assert.ok(result.errors.some(error => /lever/i.test(error)));
  assert.ok(result.errors.some(error => /missing-char/i.test(error)));
  assert.ok(result.errors.some(error => /destination scene/i.test(error)));
  assert.ok(result.errors.some(error => /missing audio clip/i.test(error)));
});
