"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const playAuthoringState = fs.readFileSync(path.join(root, "src", "modules", "renderer", "play-authoring-state.js"), "utf8");
const controllerFiles = [
  "animation-workflow.js",
  "command-workflow.js",
  "document-workflow.js",
  "editor-preferences.js",
  "export-workflow.js",
  "mode-workflow.js",
  "palette-workflow.js",
  "recovery-workflow.js",
  "project-serialization.js",
  "recovery-panel.js",
  "tilemap-workflow.js",
  "transform-workflow.js"
];

test("workflow controllers load before renderer", () => {
  const rendererIndex = html.indexOf('<script src="./renderer.js"></script>');
  assert.ok(rendererIndex > 0);
  const playAuthoringMarker = '<script src="./modules/renderer/play-authoring-state.js"></script>';
  assert.ok(html.indexOf(playAuthoringMarker) > 0);
  assert.ok(html.indexOf(playAuthoringMarker) < rendererIndex);
  controllerFiles.forEach(file => {
    const marker = `<script src="./modules/renderer/${file}"></script>`;
    assert.ok(html.indexOf(marker) > 0, `${file} is missing from index.html`);
    assert.ok(html.indexOf(marker) < rendererIndex, `${file} must load before renderer.js`);
  });
});

test("workflow controllers expose factories", () => {
  controllerFiles.forEach(file => {
    const controller = require(path.join(root, "src", "modules", "renderer", file));
    assert.equal(typeof controller.create, "function", `${file} must expose create()`);
  });
});

test("renderer delegates workflow responsibilities", () => {
  assert.match(renderer, /PixelBugWorkflowControllers/);
  assert.match(renderer, /PixelBugAnimationWorkflow\.create/);
  assert.match(renderer, /PixelBugDocumentWorkflow\.create/);
  assert.match(renderer, /PixelBugExportWorkflow\.create/);
  assert.match(renderer, /PixelBugTransformWorkflow\.create/);
  assert.doesNotMatch(renderer, /function encodeApng\(/);
  assert.doesNotMatch(renderer, /function renderDocumentTabs\(/);
  assert.doesNotMatch(renderer, /function renderCommandPalette\(/);
  assert.match(renderer, /PixelBugPlayAuthoringState/);
  assert.doesNotMatch(renderer, /function defaultPlayVisualLayers\(/);
  assert.doesNotMatch(renderer, /function defaultDialogueState\(/);
  assert.doesNotMatch(renderer, /function normalizePlayUiMod\(/);
  assert.match(playAuthoringState, /function defaultPlayVisualLayers\(/);
  assert.match(playAuthoringState, /function normalizePlayUiMod\(/);
});

test("new architecture source follows code policy", () => {
  const sources = controllerFiles.map(file => fs.readFileSync(path.join(root, "src", "modules", "renderer", file), "utf8"));
  sources.push(renderer.slice(renderer.indexOf("// Workflow bridge"), renderer.indexOf("window.PixelBugAppApi = {")));
  sources.forEach(source => {
    const comments = source.match(/^\s*\/\/\s+.*$/gm) || [];
    comments.forEach(comment => {
      const words = comment.replace(/^\s*\/\/\s+/, "").trim().split(/\s+/).filter(Boolean);
      assert.equal(words.length, 2, `comment must contain two words: ${comment}`);
    });
  });
});


test("application protocol only serves renderer resources", () => {
  const source = fs.readFileSync(path.join(root, "src", "main", "app-protocol.js"), "utf8");
  assert.match(source, /APP_FILES = new Set/);
  assert.match(source, /APP_PREFIXES = \["modules\/", "workers\/"\]/);
  assert.doesNotMatch(source, /APP_FILE_TYPES/);
  assert.doesNotMatch(source, /path\.extname\(relativePath\)/);
});
