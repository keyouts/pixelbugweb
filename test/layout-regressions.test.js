"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const css = (fs.readFileSync(path.join(root, "src", "styles.css"), "utf8") + fs.readFileSync(path.join(root, "src", "styles-workspaces.css"), "utf8"));
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const commands = fs.readFileSync(path.join(root, "src", "modules", "renderer", "command-workflow.js"), "utf8");
const documents = fs.readFileSync(path.join(root, "src", "modules", "renderer", "document-workflow.js"), "utf8");
const voxelWorkspaces = fs.readFileSync(path.join(root, "src", "modules", "voxel-workspaces.js"), "utf8");
const playWorkspaces = fs.readFileSync(path.join(root, "src", "modules", "play-workspaces.js"), "utf8");

test("command search stays keyboard first", () => {
  assert.doesNotMatch(html, /id="command-palette-btn"/);
  assert.match(html, /id="command-palette-overlay"/);
  assert.match(renderer, /Ctrl\+K|Meta\+K|command/i);
  assert.match(commands, /returnFocus/);
  assert.match(commands, /returnFocus\?\.isConnected/);
});

test("project tabs update and expose active state", () => {
  assert.match(documents, /function projectSnapshot\(project\)/);
  assert.match(documents, /JSON\.parse\(JSON\.stringify\(project\)\)/);
  assert.match(documents, /document-tab\$\{active \? " active" : ""\}/);
  assert.match(documents, /main\.setAttribute\("aria-selected", String\(active\)\)/);
  assert.match(documents, /focusDocumentTab\(next\.id\)/);
  assert.match(css, /\.document-tab\.active\s*\{/);
  assert.match(css, /\.document-tab-close\s*\{/);
});

test("touch layout is limited to base mode", () => {
  assert.match(renderer, /return touchMode && !printMode && !playModeScreen && !voxelModeScreen && !modMode/);
  assert.match(renderer, /function syncTouchLayout\(\)/);
  assert.match(renderer, /moveTouchUtilityDock\(active\)/);
  ["setModMode", "setPlayModeScreen", "setVoxelModeScreen", "setPrintMode"].forEach(name => {
    const start = renderer.indexOf(`function ${name}`);
    assert.ok(start >= 0, `${name} is missing`);
    assert.match(renderer.slice(start, start + 900), /syncTouchLayout\(\)/, `${name} must restore the base touch layout`);
  });
  assert.match(css, /--touch-rail-height:\s*144px/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
});

test("touch mode has a reachable base mode exit", () => {
  assert.match(html, /id="touch-exit-btn"[^>]*>Base Mode/);
  assert.match(renderer, /touchExitBtn\?\.addEventListener\("click", \(\) => setTouchMode\(false, true\)\)/);
  assert.ok(renderer.indexOf(`touchExitBtn?.addEventListener`) < renderer.indexOf(`const restoredLocalProject = loadLocal()`));
});

test("pixelizer accepts the same image repeatedly", () => {
  assert.match(renderer, /imageImportInput\.onchange = e => \{[\s\S]*?const file = e\.target\.files\?\.\[0\];[\s\S]*?e\.target\.value = "";[\s\S]*?loadImageFile\(file\);[\s\S]*?\};/);
  assert.match(renderer, /function openPixelizerModal\(\) \{[\s\S]*?if \(importedImage\) schedulePixelizerPreview\(\);[\s\S]*?else clearPixelizerPreview\(\);/);
});

test("recovery session state is detached before normalization", () => {
  assert.match(renderer, /return applyRecoveredProject\(clone\(active\.project\)\);/);
});

test("voxel mode uses modular tool workspaces", () => {
  assert.match(html, /class="voxel-mode-card voxel-workspace-launcher"/);
  ["modeling", "settings", "selection", "modifiers", "rigging", "parts", "animation"].forEach(name => {
    assert.match(html, new RegExp(`data-voxel-workspace-open="${name}"`));
    assert.match(html, new RegExp(`data-voxel-workspace-source="${name}"`));
  });
  assert.match(html, /id="voxel-tool-workspace-overlay"/);
  assert.match(html, /id="voxel-workspace-preview-host"/);
  assert.match(html, /id="voxel-workspace-controls"/);
  assert.match(css, /\.voxel-mode-layout > \[data-voxel-workspace-source\]\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /\.voxel-workspace-launcher\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(css, /\.voxel-workspace-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.45fr\) minmax\(330px, \.72fr\)/);
  assert.match(css, /\.voxel-preview-card\s*\{[\s\S]*?display:\s*block;[\s\S]*?grid-column:\s*span 8/);
  assert.match(html, /class="voxel-mode-card voxel-slice-card"/);
  assert.match(html, /class="voxel-mode-card voxel-preview-card"/);
});

test("voxel workspaces reuse one live preview", () => {
  assert.match(voxelWorkspaces, /const previewNodes = \[[\s\S]*?\.voxel-preview-toolbar[\s\S]*?#voxel-mode-stage[\s\S]*?#voxel-mode-multi-view/);
  assert.match(voxelWorkspaces, /parkNodes\(previewNodes, previewHost\)/);
  assert.match(voxelWorkspaces, /restoreNodes\(previewNodes\)/);
  assert.match(voxelWorkspaces, /window\.dispatchEvent\(new Event\("resize"\)\)/);
  assert.doesNotMatch(voxelWorkspaces, /cloneNode|createElement\("canvas"\)/);
});

test("document tabs are contained in a neubrutalist panel", () => {
  assert.match(css, /\.document-strip\s*\{[\s\S]*?border:\s*4px solid var\(--ink\);[\s\S]*?background:\s*var\(--panel\);[\s\S]*?box-shadow:\s*6px 6px 0 var\(--ink\);/);
});

test("voxel camera labels stay inside compact buttons", () => {
  assert.match(css, /\.voxel-camera-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(54px, 1fr\)\)/);
  assert.match(css, /#voxel-mode-reset-camera-btn,\s*#voxel-mode-focus-selection-btn\s*\{[\s\S]*?min-width:\s*54px;[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow-wrap:\s*normal;/);
  assert.match(css, /\.voxel-panel button,\s*\.voxel-workspace-overlay button\s*\{[\s\S]*?overflow-wrap:\s*normal;[\s\S]*?word-break:\s*normal;/);
});

test("voxel zoom fit label stays inside its button", () => {
  assert.match(css, /\.voxel-preview-zoom\s*\{[\s\S]*?grid-template-columns:\s*34px minmax\(0, 1fr\) 52px;[\s\S]*?"zoom-value zoom-value zoom-fit"/);
  assert.match(css, /#voxel-mode-zoom-fit-btn\s*\{\s*grid-area:\s*zoom-fit;\s*width:\s*100%;\s*min-width:\s*0;/);
  assert.match(css, /#voxel-mode-zoom-fit-btn\s*\{[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow-wrap:\s*normal;/);
});

test("voxel animation uses the shared 3D workspace", () => {
  assert.match(html, /id="voxel-animation-open-btn"/);
  assert.match(html, /data-voxel-workspace-open="animation"[^>]*id="voxel-animation-open-btn"[^>]*>Animation<\/button>/);
  assert.match(html, /data-voxel-workspace-source="animation"/);
  assert.match(html, /id="voxel-animation-dopesheet"/);
  assert.match(html, /voxel-dopesheet-channels[\s\S]*?>Voxels<[\s\S]*?>Pose</);
  assert.match(html, /id="voxel-mode-timeline"/);
  assert.match(css, /data-active-workspace="animation"[\s\S]*?\.voxel-workspace-body/);
  assert.match(css, /data-active-workspace="animation"[\s\S]*?\.voxel-animation-editor-grid/);
  const modalIndex = html.indexOf('<script src="./modules/modal-accessibility.js"></script>');
  const animationIndex = html.indexOf('<script src="./modules/voxel-animation-workspace.js"></script>');
  const workspaceIndex = html.indexOf('<script src="./modules/voxel-workspaces.js"></script>');
  assert.ok(modalIndex > 0 && animationIndex > modalIndex && workspaceIndex > animationIndex);
});


test("voxel controls and parts workspaces reserve usable inspector width", () => {
  assert.match(css, /data-active-workspace="settings"[^\{]*\.voxel-workspace-body[\s\S]*?grid-template-columns:\s*minmax\(420px, \.9fr\) minmax\(560px, 1\.1fr\)/);
  assert.match(css, /data-active-workspace="parts"[^\{]*\.voxel-workspace-body[\s\S]*?grid-template-columns:\s*minmax\(420px, \.86fr\) minmax\(620px, 1\.14fr\)/);
  assert.match(css, /data-active-workspace="settings"[^\{]*\.voxel-settings-grid[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /data-active-workspace="parts"[^\{]*\.voxel-bone-edit-actions[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});


test("main voxel zoom controls stay inside the preview toolbar", () => {
  assert.match(css, /\.voxel-preview-card > \.voxel-preview-toolbar \{[\s\S]*?max-width:\s*100%;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.voxel-preview-card > \.voxel-preview-toolbar \.voxel-preview-zoom \{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?grid-template-columns:\s*34px minmax\(0, 1fr\) 52px/);
  assert.match(css, /#voxel-mode-zoom-in-btn,[\s\S]*?#voxel-mode-zoom-fit-btn \{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0/);
});

test("focused voxel workspaces keep undo and redo reachable", () => {
  assert.match(html, /id="voxel-workspace-undo-btn"/);
  assert.match(html, /id="voxel-workspace-redo-btn"/);
  assert.ok(voxelWorkspaces.includes('undoBtn?.addEventListener("click", () => $("#voxel-mode-undo-btn")?.click())'));
  assert.ok(voxelWorkspaces.includes('redoBtn?.addEventListener("click", () => $("#voxel-mode-redo-btn")?.click())'));
});


test("play mode uses focused tool workspaces with one live tester", () => {
  assert.match(html, /class="play-workspace-launcher"/);
  ["builder", "scene", "player", "layers", "objects", "characters", "dialogue", "rules"].forEach(name => {
    assert.match(html, new RegExp(`data-play-workspace-open="${name}"`));
    assert.match(html, new RegExp(`data-play-workspace-switch="${name}"`));
  });
  ["builder", "scene", "player", "layers", "objects", "characters", "dialogue"].forEach(name => {
    assert.match(html, new RegExp(`data-play-workspace-source="${name}"`));
  });
  ["play-actor-frames", "play-place-frame-art", "play-stage-title"].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(html, /id="play-tool-workspace-overlay"/);
  assert.match(html, /id="play-workspace-preview-host"/);
  assert.match(html, /id="play-workspace-controls"/);
  assert.match(css, /body\.play-mode \.play-section-grid > \[data-play-workspace-source\][\s\S]*?display:\s*none !important/);
  assert.match(playWorkspaces, /parkNodes\(\[stageShell\], previewHost\)/);
  assert.match(playWorkspaces, /restoreNodes\(\[stageShell\]\)/);
  assert.match(playWorkspaces, /name === "rules"[\s\S]*?#node-editor-card/);
  assert.doesNotMatch(playWorkspaces, /cloneNode|createElement\("canvas"\)/);
});

test("rearrange is restricted to base and touch mode", () => {
  assert.match(renderer, /const DOCK_CARD_SELECTOR = "\.rearrange-zone > \.dock-card\[data-dock-id\]"/);
  assert.match(renderer, /function dockZones\(\) \{[\s\S]*?data-zone="left"[\s\S]*?data-zone="right"/);
  assert.match(renderer, /function rearrangeAllowed\(\) \{[\s\S]*?return !printMode && !playModeScreen && !voxelModeScreen && !modMode/);
  assert.match(renderer, /rearrangeBtn\.hidden = !allowed/);
  assert.match(renderer, /Rearrange Base Mode sidebars/);
  assert.doesNotMatch(renderer, /Rearrange Base, Play Mode, or Voxel Mode sections/);
});
