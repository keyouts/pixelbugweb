"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ModWorkspace = require("../src/modules/renderer/mod-workspace");
const ModPermissions = require("../src/modules/mod-permissions");
const ModCodePolicy = require("../src/modules/mod-code-policy");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

function parsePlayUi(source) {
  return JSON.parse(source || "{}");
}

test("mod preview history preserves independent pixel snapshots", () => {
  const history = ModWorkspace.createHistory(4);
  const first = [["#111111", null]];
  history.push(first);
  first[0][0] = "#222222";
  const undone = history.undo([["#333333", null]]);
  assert.deepEqual(undone, [["#111111", null]]);
  const redone = history.redo(undone);
  assert.deepEqual(redone, [["#333333", null]]);
  assert.equal(history.state().canUndo, true);
});

test("mod draft cleanup bounds sources and package toggles", () => {
  const clean = ModWorkspace.cleanDraft({ brushSource: "installed", effectSource: "bad", includeEffect: false, includePlayUi: false, live: false, permissions: ["canvas.read"] });
  assert.equal(clean.brushSource, "installed");
  assert.equal(clean.effectSource, "code");
  assert.equal(clean.includeBrush, true);
  assert.equal(clean.includeEffect, false);
  assert.equal(clean.includePlayUi, false);
  assert.equal(clean.live, false);
});

test("mod validation only requires permissions for enabled package contents", () => {
  const helpers = { validateCode: ModCodePolicy.validate, parsePlayUi, requiredForPack: ModPermissions.requiredForPack, authorize: ModPermissions.authorize, describe: ModPermissions.describe };
  const brushOnly = ModWorkspace.validate({ name: "Brush Mod", id: "brush-mod", brushCode: "return [{x,y,color}];", effectCode: "return pixels;", playUiCode: "{}", includeBrush: true, includeEffect: false, includePlayUi: false, permissions: ["canvas.read", "pixels.write"] }, helpers);
  assert.equal(brushOnly.ok, true);
  assert.deepEqual(brushOnly.required, ["canvas.read", "pixels.write"]);
  const missing = ModWorkspace.validate({ name: "Brush Mod", id: "brush-mod", brushCode: "return [{x,y,color}];", includeBrush: true, includeEffect: false, includePlayUi: false, permissions: ["canvas.read"] }, helpers);
  assert.equal(missing.ok, false);
  assert.match(missing.issues.join(" "), /Return changed preview pixels/);
});

test("mod mode exposes explicit installed sources, package contents, and test history", () => {
  ["mod-brush-source", "mod-brush-select", "mod-effect-source", "mod-effect-select", "mod-include-brush", "mod-include-effect", "mod-include-play-ui", "mod-undo-btn", "mod-redo-btn", "mod-validate-btn", "mod-install-btn", "mod-draft-status"].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(renderer, /modEffectPreviewPixels = next/);
  assert.match(renderer, /runModEffect\(false, false\)/);
  assert.match(renderer, /Mod exported without changing the installed tools/);
  assert.match(renderer, /restoreModDraft/);
});
