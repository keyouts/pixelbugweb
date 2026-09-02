"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ProjectPackage = require("../src/modules/project-package");
const ProjectGuard = require("../src/modules/project-guard");
const HistoryPatches = require("../src/modules/history-patches");
const SessionRecovery = require("../src/modules/session-recovery");
const AccessibilityPreferences = require("../src/modules/accessibility-preferences");
const { ProjectPathStore } = require("../src/main/project-paths");

function pixels(width, height, color = null) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => color));
}

function project(width = 32, height = 32) {
  return {
    format: "pixel-bug-project",
    schemaVersion: 2,
    width,
    height,
    size: Math.max(width, height),
    activeFrame: 0,
    activeLayer: 0,
    frames: [{ duration: 120, layers: [{ name: "Layer 1", visible: true, opacity: 1, pixels: pixels(width, height), sourcePixels: pixels(width, height), sourceWidth: width, sourceHeight: height }] }],
    palette: ["#000000", "#ffffff"],
    palettePresets: [{ name: "Base", colors: ["#000000", "#ffffff"] }],
    activePalettePreset: 0,
    playMode: { audioLibrary: [] }
  };
}

test("packed projects round trip through the guarded parser", () => {
  const source = project();
  source.frames[0].layers[0].pixels[3][4] = "#ff00ff";
  source.frames[0].layers[0].sourcePixels[3][4] = "#ff00ff";
  const text = ProjectPackage.stringify(source);
  const parsed = ProjectGuard.parse(text);
  assert.equal(parsed.frames[0].layers[0].pixels[3][4], "#ff00ff");
  assert.equal(parsed.width, 32);
  assert.match(text, /"pixel-bug-package"/);
});

test("packed projects reduce repeated pixel and audio data", () => {
  const source = project(64, 64);
  const audio = "data:audio/wav;base64," + "A".repeat(8192);
  source.playMode.audioLibrary = [{ id: "one", dataUrl: audio }, { id: "two", dataUrl: audio }];
  const plain = JSON.stringify(source);
  const packed = ProjectPackage.stringify(source);
  assert.ok(packed.length < plain.length / 3);
  assert.equal((packed.match(/data:audio\/wav;base64/g) || []).length, 1);
  assert.deepEqual(ProjectPackage.parse(packed).playMode.audioLibrary.map(item => item.dataUrl), [audio, audio]);
});

test("history patches store local pixel changes and reverse them", () => {
  const before = project(64, 64);
  const after = structuredClone(before);
  after.frames[0].layers[0].pixels[20][18] = "#123456";
  const patch = HistoryPatches.create(before, after);
  assert.ok(patch.changes.length < 8);
  assert.ok(HistoryPatches.estimate(patch) < JSON.stringify(before).length / 20);
  const undone = HistoryPatches.apply(structuredClone(after), patch, "undo");
  assert.equal(undone.frames[0].layers[0].pixels[20][18], null);
  const redone = HistoryPatches.apply(undone, patch, "redo");
  assert.equal(redone.frames[0].layers[0].pixels[20][18], "#123456");
});

test("history patches preserve structural edits", () => {
  const before = { frames: [{ id: 1 }], activeFrame: 0 };
  const after = { frames: [{ id: 1 }, { id: 2 }], activeFrame: 1 };
  const patch = HistoryPatches.create(before, after);
  assert.deepEqual(HistoryPatches.apply(structuredClone(after), patch, "undo"), before);
  assert.deepEqual(HistoryPatches.apply(structuredClone(before), patch, "redo"), after);
});

test("session recovery retains every project tab", () => {
  const documents = [
    { id: "one", name: "First", filePath: "/tmp/first.pxbuild", dirty: true, project: project(16, 16) },
    { id: "two", name: "Second", filePath: "", dirty: false, project: project(24, 12) }
  ];
  const text = SessionRecovery.serialize(documents, "two", ProjectPackage);
  const session = SessionRecovery.parse(text, ProjectPackage);
  assert.equal(session.documents.length, 2);
  assert.equal(session.activeDocumentId, "two");
  assert.equal(session.documents[0].dirty, true);
  assert.equal(session.documents[1].project.width, 24);
});

test("accessibility preferences persist and apply classes", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const classes = new Set();
  const styles = new Map();
  const root = {
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    style: { setProperty: (name, value) => styles.set(name, value) }
  };
  const saved = AccessibilityPreferences.save({ reduceMotion: true, strongFocus: true, largeTargets: true, boldText: true, fontPreset: "readable" }, storage);
  AccessibilityPreferences.apply(saved, root);
  assert.deepEqual(AccessibilityPreferences.load(storage), saved);
  assert.deepEqual([...classes].sort(), ["a11y-bold-text", "a11y-large-targets", "a11y-reduced-motion", "a11y-strong-focus"]);
  assert.equal(styles.get("--ui-font-family"), AccessibilityPreferences.FONT_PRESETS.readable);
});

test("font preferences reject arbitrary values and uploads", () => {
  const sanitized = AccessibilityPreferences.sanitize({ fontPreset: 'url("file:///huge-font.woff2")', boldText: true });
  assert.equal(sanitized.fontPreset, "system");
  assert.equal(sanitized.boldText, true);
  const html = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
  assert.match(html, /settings-font-preset/);
  assert.match(html, /Font files cannot be uploaded or downloaded/);
  assert.doesNotMatch(html, /type="file"[^>]*(font|woff|ttf|otf)/i);
});

test("project paths require explicit approval", () => {
  const store = new ProjectPathStore();
  const filePath = path.join(process.cwd(), "approved.pxbuild");
  assert.throws(() => store.bind(1, "document-one", filePath), /not approved/);
  store.approve(1, filePath);
  assert.equal(store.bind(1, "document-one", filePath), path.resolve(filePath));
  assert.equal(store.get(1, "document-one"), path.resolve(filePath));
  store.forget(1, "document-one");
  assert.equal(store.get(1, "document-one"), "");
});

test("save and recovery integration remains connected", () => {
  const root = path.join(__dirname, "..");
  const main = fs.readFileSync(path.join(root, "src", "main.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "src", "preload.js"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  assert.match(main, /save-project-file/);
  assert.match(main, /ProjectPathStore/);
  assert.match(preload, /saveProjectFile/);
  assert.match(renderer, /serializeRecovery/);
  assert.match(renderer, /HistoryPatches\.create/);
  assert.match(html, /save-project-as-btn/);
  assert.match(html, /settings-reduced-motion/);
  assert.match(html, /settings-font-preset/);
  assert.match(html, /settings-bold-text/);
});
