"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const Accessibility = require("../src/modules/accessibility-preferences");
const ExportPreflight = require("../src/modules/export-preflight");
const ModPermissions = require("../src/modules/mod-permissions");
const ProjectHealth = require("../src/modules/project-health");
const ProjectPackage = require("../src/modules/project-package");
const SessionRecovery = require("../src/modules/session-recovery");
const ShortcutPreferences = require("../src/modules/shortcut-preferences");
const RecoveryStore = require("../src/main/recovery-store");

function pixels(width, height, color = null) {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => color));
}

function project(width = 16, height = 16) {
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

test("recovery snapshots rotate and verify integrity", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pixelbug-recovery-"));
  const app = { getPath: () => directory };
  try {
    await RecoveryStore.saveRecovery(app, { payload: "first", summary: { name: "First", tabCount: 2 }, forceSnapshot: true });
    await RecoveryStore.saveRecovery(app, { payload: "second", summary: { name: "Second", dirtyCount: 1 }, forceSnapshot: true });
    await RecoveryStore.saveRecovery(app, { payload: "second", summary: { name: "Second Copy", dirtyCount: 1 }, forceSnapshot: true });
    const snapshots = await RecoveryStore.listRecoverySnapshots(app);
    assert.equal(snapshots.length, 3);
    assert.equal(snapshots[0].summary.name, "Second Copy");
    const loaded = await RecoveryStore.loadRecoverySnapshot(app, snapshots[0].id);
    assert.equal(loaded.payload, "second");
    const filePath = path.join(directory, "recovery", "snapshots", `${snapshots[0].id}.json`);
    await fs.writeFile(filePath, "tampered");
    await assert.rejects(RecoveryStore.loadRecoverySnapshot(app, snapshots[0].id), /integrity/);
    await RecoveryStore.deleteRecoverySnapshot(app, snapshots[0].id);
    assert.equal((await RecoveryStore.listRecoverySnapshots(app)).length, 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("project packages verify, migrate, and recover safely", () => {
  const source = project();
  source.frames[0].layers[0].pixels[2][3] = "#123456";
  const packed = ProjectPackage.pack(source);
  assert.equal(ProjectPackage.unpack(packed).frames[0].layers[0].pixels[2][3], "#123456");
  const legacy = structuredClone(packed);
  legacy.packageVersion = 1;
  delete legacy.checksum;
  assert.equal(ProjectPackage.unpack(legacy).width, 16);
  const future = structuredClone(packed);
  future.packageVersion = ProjectPackage.VERSION + 1;
  future.checksum.value = ProjectPackage.packageChecksum(future);
  const futureResult = ProjectPackage.recover(JSON.stringify(future));
  assert.equal(futureResult.readOnly, true);
  assert.match(futureResult.warnings.join(" "), /newer/i);
  const damaged = structuredClone(packed);
  damaged.project.frames[0].layers[0].pixels.runs = [999999, 0];
  damaged.checksum.value = ProjectPackage.packageChecksum(damaged);
  assert.throws(() => ProjectPackage.unpack(damaged), /pixel/i);
  const recovered = ProjectPackage.recover(JSON.stringify(damaged));
  assert.equal(recovered.readOnly, true);
  assert.equal(recovered.project.frames[0].layers[0].pixels[0][0], null);
  assert.match(recovered.warnings.join(" "), /blank layer/i);
});

test("recovery sessions salvage damaged document packages", () => {
  const text = SessionRecovery.serialize([{ id: "one", name: "One", dirty: true, project: project() }], "one", ProjectPackage);
  const payload = JSON.parse(text);
  payload.documents[0].project.project.frames[0].layers[0].pixels.runs = [999999, 0];
  payload.documents[0].project.checksum.value = ProjectPackage.packageChecksum(payload.documents[0].project);
  const restored = SessionRecovery.parse(JSON.stringify(payload), ProjectPackage);
  assert.equal(restored.documents[0].readOnly, true);
  assert.match(restored.documents[0].warning, /blank layer/i);
});

test("accessibility presets remain bounded", () => {
  const value = Accessibility.sanitize({
    textSize: "500%",
    textWeight: "ultra",
    lineSpacing: "10",
    letterSpacing: "2em",
    fontPreset: "url(file:///font.woff2)",
    highContrast: true,
    reduceTransparency: true,
    reduceShadows: true,
    clearerSelection: true
  });
  assert.equal(value.textSize, "standard");
  assert.equal(value.textWeight, "standard");
  assert.equal(value.lineSpacing, "standard");
  assert.equal(value.letterSpacing, "standard");
  assert.equal(value.fontPreset, "system");
  assert.equal(value.highContrast, true);
});


test("bold typography overrides lower weight presets", () => {
  const classes = new Map();
  const properties = new Map();
  const root = {
    classList: { toggle: (name, value) => classes.set(name, value) },
    style: { setProperty: (name, value) => properties.set(name, value) }
  };
  Accessibility.apply({ boldText: true, textWeight: "semibold" }, root);
  assert.equal(classes.get("a11y-bold-text"), true);
  assert.equal(classes.get("a11y-text-semibold"), false);
  assert.equal(properties.get("--a11y-font-weight"), "900");
});

test("shortcut settings reject reserved and duplicate keys", () => {
  assert.equal(ShortcutPreferences.validate("save", "Alt+F4", {}).ok, false);
  assert.equal(ShortcutPreferences.validate("save", "Ctrl+K", { commandPalette: "Ctrl+K" }).ok, false);
  assert.deepEqual(ShortcutPreferences.validate("save", "Ctrl+Alt+S", {}).value, "Ctrl+Alt+S");
});

test("project health reports bounded project pressure", () => {
  const source = project(32, 24);
  source.playMode.audioLibrary = [{ dataUrl: "data:audio/wav;base64," + "A".repeat(4096) }];
  const health = ProjectHealth.inspect(source, { undoStack: [{ changes: [{ before: null, after: "#fff" }] }], stringify: ProjectPackage.stringify });
  assert.equal(health.width, 32);
  assert.equal(health.height, 24);
  assert.equal(health.frames, 1);
  assert.equal(health.audioAssets, 1);
  assert.ok(health.projectBytes > 0);
});

test("mod manifests expose only declared capabilities", () => {
  const pack = { brushCode: "return color;", playUi: { scale: 1 }, manifest: { permissions: ["canvas.read", "unknown"] } };
  const manifest = ModPermissions.manifest(pack);
  assert.deepEqual(manifest.permissions, ["canvas.read", "pixels.write", "play-ui.write"]);
  assert.equal(ModPermissions.authorize(["canvas.read"], ["canvas.read", "pixels.write"]).ok, false);
  assert.deepEqual(ModPermissions.sanitize(["pixels.write", "pixels.write", "unknown"]), ["pixels.write"]);
});

test("export preflight estimates stay finite", () => {
  const estimate = ExportPreflight.estimate({ width: 32, height: 24, frames: 8, scale: 4 });
  assert.equal(estimate.outputWidth, 128);
  assert.equal(estimate.outputHeight, 96);
  assert.equal(estimate.rawBytes, 32 * 24 * 8 * 16 * 4);
  assert.match(estimate.rawLabel, /KB|MB/);
});

test("hardening controls remain connected", async () => {
  const root = path.join(__dirname, "..");
  const html = await fs.readFile(path.join(root, "src", "index.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "src", "preload.js"), "utf8");
  const renderer = await fs.readFile(path.join(root, "src", "renderer.js"), "utf8");
  assert.match(html, /recovery-snapshot-list/);
  assert.match(html, /project-health-grid/);
  assert.match(html, /export-preflight-overlay/);
  assert.match(html, /autofocus="" id="export-preflight-confirm-btn"/);
  assert.match(html, /settings-high-contrast/);
  assert.match(html, /id="shortcut-settings-title"/);
  assert.match(html, /mod-permission-canvas-read/);
  assert.match(html, /modal-accessibility\.js/);
  assert.match(preload, /listRecoverySnapshots/);
  assert.match(preload, /deleteRecoverySnapshot/);
  assert.match(renderer, /runExportAction\(exportPNG, "PNG Export"\)/);
  assert.match(renderer, /ShortcutPreferences\.validate/);
});
