const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const WorkflowFeatures = require("../src/modules/workflow-features");
const { openRecentProject, readRecentProjects, rememberRecentProject } = require("../src/main/recent-projects");

test("export profiles stay bounded and usable", () => {
  const profile = WorkflowFeatures.normalizeExportProfile({ name: " Test Profile ", scale: 99, columns: 0, apng: true, baseName: "bad name/one" });
  assert.equal(profile.name, "Test Profile");
  assert.equal(profile.scale, 16);
  assert.equal(profile.columns, 240);
  assert.equal(profile.apng, true);
  assert.equal(profile.baseName, "bad-name-one");
});

test("selection transforms use nearest pixels", () => {
  const data = {
    pixels: [["#000000", "#ffffff"], [null, "#ff0000"]],
    mask: [[true, true], [true, true]]
  };
  const transformed = WorkflowFeatures.transformSelection(data, { width: 4, height: 4, rotation: 90, flipH: true });
  assert.equal(transformed.w, 4);
  assert.equal(transformed.h, 4);
  assert.equal(transformed.pixels.length, 4);
  assert.equal(transformed.pixels[0].length, 4);
  assert.equal(transformed.mask.flat().every(Boolean), true);
});

test("palette exchange reads gpl and hex text", () => {
  const colors = WorkflowFeatures.parsePaletteText("GIMP Palette\n255 0 0 Red\n#00ff00\n0 0 255 Blue");
  assert.deepEqual(colors, ["#ff0000", "#00ff00", "#0000ff"]);
  assert.match(WorkflowFeatures.paletteToGpl("Test", colors), /^GIMP Palette/m);
  assert.equal(WorkflowFeatures.paletteToText(colors), "#ff0000\n#00ff00\n#0000ff\n");
});

test("tile maps round trip through tiled json", () => {
  const map = WorkflowFeatures.normalizeTileMap({ width: 2, height: 2, layers: [{ id: "ground", name: "Ground", cells: [[{ tileId: "grass", collision: true }, null], [null, null]] }] });
  const tiled = WorkflowFeatures.tileMapToTiled(map, [{ id: "grass", w: 1, h: 1, pixels: [["#00aa00"]] }], "Map", { image: "map-tiles.png", columns: 1 });
  const restored = WorkflowFeatures.tileMapFromTiled(tiled);
  const importedTiles = WorkflowFeatures.tilesFromTiled(tiled);
  assert.equal(restored.width, 2);
  assert.equal(restored.layers[0].cells[0][0].tileId, "grass");
  assert.equal(restored.layers[0].cells[0][0].collision, true);
  assert.equal(tiled.tilesets[0].image, "map-tiles.png");
  assert.equal(tiled.layers.some(layer => layer.type === "objectgroup"), true);
  assert.equal(importedTiles[0].pixels[0][0], "#00aa00");
});

test("atlas records accept hash frames", () => {
  const records = WorkflowFeatures.atlasFrameRecords({ frames: { idle: { frame: { x: 0, y: 0, w: 8, h: 8 }, duration: 90, sourceSize: { w: 16, h: 16 }, spriteSourceSize: { x: 4, y: 4, w: 8, h: 8 }, trimmed: true } } });
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "idle");
  assert.equal(records[0].duration, 90);
  assert.equal(records[0].trimmed, true);
  assert.equal(records[0].rotated, false);
});

test("recent projects only reopen remembered files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pixelbug-recent-"));
  const userData = path.join(root, "user-data");
  const projectPath = path.join(root, "sample.pxbuild");
  const app = { getPath: key => key === "userData" ? userData : root };
  await fs.writeFile(projectPath, "{\"frames\":[]}");
  await rememberRecentProject(app, projectPath);
  const recent = await readRecentProjects(app);
  assert.equal(recent.length, 1);
  const opened = await openRecentProject(app, projectPath, 1024);
  assert.equal(opened.ok, true);
  await assert.rejects(() => openRecentProject(app, path.join(root, "other.pxbuild"), 1024));
  await fs.rm(root, { recursive: true, force: true });
});
