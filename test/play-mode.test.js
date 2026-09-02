const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const exportRuntime = fs.readFileSync(path.join(root, "src", "modules", "tiny-game-export.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "src", "modules", "node-editor.js"), "utf8");
const guide = fs.readFileSync(path.join(root, "src", "modules", "play-mode-guide.js"), "utf8");
const layout = fs.readFileSync(path.join(root, "src", "modules", "play-layout.js"), "utf8");
const styles = (fs.readFileSync(path.join(root, "src", "styles.css"), "utf8") + fs.readFileSync(path.join(root, "src", "styles-workspaces.css"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("beginner play guide is connected", () => {
  ["play-guide-world", "play-guide-objects", "play-guide-rules", "play-guide-test", "play-guide-validation", "play-prop-open-variable"].forEach(id => {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  });
  assert.ok(html.indexOf("node-editor.js") < html.indexOf("play-mode-guide.js"));
  assert.ok(html.indexOf("play-runtime-core.js") < html.indexOf("tiny-game-export.js"));
  assert.ok(html.indexOf("tiny-game-export.js") < html.indexOf("renderer.js"));
  assert.match(guide, /PixelBugPlayGuide/);
  assert.match(guide, /dataset\.guideState/);
  assert.match(guide, /function playModeIssues/);
});

test("rule features match tester and export", () => {
  ["actionAddItem", "actionRemoveItem", "logicHasItem", "actionScene", "actionPlaySound", "actionStopSound"].forEach(type => {
    assert.match(rules, new RegExp(type));
    assert.match(exportRuntime, new RegExp(`node\\.type === ["']${type}["']`));
  });
  assert.match(exportRuntime, /let nodeInventory =/);
  assert.match(exportRuntime, /loadRuntimeScene\(data\.sceneId, true\)/);
  assert.match(rules, /Rule Outline/);
  assert.match(rules, /Rule Check/);
  assert.match(rules, /When Scene Starts/);
  assert.match(rules, /node\.data\.sceneId/);
  assert.match(exportRuntime, /payload\.sceneId/);
  assert.match(rules, /node-editor-map-details/);
});



test("play tester exposes runtime and authoring safeguards", () => {
  ["play-pause-btn", "play-step-btn", "play-runtime-state", "play-move-speed", "play-jump-strength", "play-gravity", "play-object-snap", "play-duplicate-prop-btn", "play-prop-back-btn", "play-prop-front-btn", "play-prop-target-x", "play-prop-target-y"].forEach(id => assert.match(html, new RegExp(`id=["']${id}["']`)));
  assert.match(renderer, /function setPlayAuthoringLocked/);
  assert.match(renderer, /function updatePlayRuntimeInspector/);
  assert.match(renderer, /if \(playRunning\) setPlayAuthoringLocked\(true\);/);
  assert.match(renderer, /playResetBtn\.onclick = \(\) => \{ setPlayRunning\(false\); resetPlayActor\(\); \};/);
  assert.match(renderer, /playTransitionCooldownUntil/);
  assert.match(renderer, /syncPlayAudio\(true\)/);
  assert.match(renderer, /transition\.targetX/);
  assert.match(renderer, /transition\.targetY/);
  assert.match(exportRuntime, /portal\.targetX/);
  assert.match(exportRuntime, /portal\.targetY/);
});

test("play tools use balanced neutral layout", () => {
  assert.match(html, /modules\/play-layout\.js/);
  assert.match(layout, /balancedColumns/);
  assert.match(layout, /ResizeObserver/);
  assert.match(rules, /node-editor-launcher-card/);
  assert.match(rules, /Open Rule Editor/);
  assert.match(rules, /play-stage-rail \.play-toolbar/);
  assert.match(rules, /toolbar\.append\(card\)/);
  assert.match(guide, /PixelBugNodeEditor\?\.openOverlay/);
  assert.doesNotMatch(layout, /bottomCards/);
  assert.match(styles, /node-editor-launcher-stats/);
  assert.match(styles, /data-guide-state="ready"[^}]*background: var\(--soft\)/s);
  assert.doesNotMatch(styles, /data-guide-state="ready"[^}]*background: var\(--ok\)/s);
});

test("rule editor stays out of the inline play layout", () => {
  const inlineStart = rules.indexOf("function buildInline()");
  const overlayStart = rules.indexOf("function buildOverlay()", inlineStart);
  const inlineSource = rules.slice(inlineStart, overlayStart);
  assert.match(inlineSource, /launcher: true/);
  assert.doesNotMatch(inlineSource, /node-editor-board/);
  const overlaySource = rules.slice(overlayStart);
  assert.match(overlaySource, /node-editor-large-board/);
  assert.match(overlaySource, /role=\"dialog\" aria-modal=\"true\" tabindex=\"-1\"/);
  assert.match(rules, /overlayReturnFocus/);
  assert.match(rules, /overlayOpen && !wasConnecting/);
});

test("play review adds no package dependencies", () => {
  assert.equal(packageJson.version, "1.5.18");
  assert.doesNotMatch(renderer, /1\.5\.3/);
  assert.deepEqual(packageJson.dependencies || {}, {});
  assert.equal(packageJson.devDependencies.electron, "42.9.1");
  assert.equal(packageJson.devDependencies["electron-builder"], "26.15.7");
});

test("rule editor keeps Play history reachable inside the modal", () => {
  assert.match(renderer, /undoPlay:\s*\(\) => \$\("#undo-btn"\)\?\.click\(\)/);
  assert.match(renderer, /redoPlay:\s*\(\) => \$\("#redo-btn"\)\?\.click\(\)/);
  assert.match(rules, /actionGroup\("History", historyControls\)/);
  assert.match(rules, /button\("Undo"[\s\S]*?api\.undoPlay\?\.\(\)/);
  assert.match(rules, /button\("Redo"[\s\S]*?api\.redoPlay\?\.\(\)/);
});

test("rule editor add menus stay hidden when closed and fit narrow screens", () => {
  assert.match(styles, /\.node-add-menu:not\(\[open\]\) > \.node-add-panel[\s\S]*?display:\s*none/);
  assert.match(styles, /\.node-editor-action-more:not\(\[open\]\) > \.node-editor-action-more-panel[\s\S]*?display:\s*none/);
  assert.match(styles, /\.node-editor-map-tools \.node-add-panel\s*\{[\s\S]*?right:\s*0;[\s\S]*?width:\s*min\(520px, calc\(100vw - 56px\)\);[\s\S]*?min-width:\s*0;/);
});
