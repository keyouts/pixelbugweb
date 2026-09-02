"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const DrawingTools = require("../src/modules/renderer/drawing-tools");
const SpritesheetTools = require("../src/modules/renderer/spritesheet-tools");
const ModCodePolicy = require("../src/modules/mod-code-policy");

test("drawing line interpolation remains contiguous", () => {
  assert.deepEqual(DrawingTools.linePoints({ x: 0, y: 0 }, { x: 3, y: 1 }), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
  assert.deepEqual(Object.keys(DrawingTools).sort(), ["bayerPattern", "brushPattern", "linePoints", "paletteStep", "patternAt", "patternStampPoints"]);
});

test("dither density covers the full slider range", () => {
  for (const [coverage, expected] of [[0, 0], [0.25, 16], [0.5, 32], [0.75, 48], [1, 64]]) {
    const pattern = DrawingTools.bayerPattern(coverage);
    assert.equal(pattern.flat().filter(Boolean).length, expected);
  }
  assert.equal(DrawingTools.bayerPattern(0.5, 2).length, 16);
  assert.equal(DrawingTools.bayerPattern(0.5, 2)[0].length, 16);
});

test("procedural patterns are canvas anchored and deterministic", () => {
  assert.equal(DrawingTools.patternAt("dither", 3, 5, { density: 50, scale: 1 }), DrawingTools.patternAt("dither", 3, 5, { density: 0.5, scale: 1 }));
  assert.equal(DrawingTools.patternAt("noise", 13, 9, { density: 0.4, scale: 1 }), DrawingTools.patternAt("noise", 13, 9, { density: 0.4, scale: 1 }));
  assert.equal(DrawingTools.patternAt("cluster", 0, 0, { density: 0.5, scale: 1 }), DrawingTools.patternAt("cluster", 1, 1, { density: 0.5, scale: 1 }));
  assert.equal(DrawingTools.patternAt("checker", 0, 0, { scale: 2 }), true);
  assert.equal(DrawingTools.patternAt("checker", 1, 1, { scale: 2 }), true);
  assert.equal(DrawingTools.patternAt("checker", 2, 0, { scale: 2 }), false);
});

test("procedural brushes stamp a full patterned footprint", () => {
  const dither = DrawingTools.patternStampPoints("dither", 20, 20, { density: 0.5, scale: 1 });
  assert.equal(dither.length, 32);
  assert.ok(new Set(dither.map(point => point.x)).size > 1);
  assert.ok(new Set(dither.map(point => point.y)).size > 1);
  for (const kind of ["noise", "cluster", "checker", "hatch"]) {
    const points = DrawingTools.patternStampPoints(kind, 20, 20, { density: 0.5, scale: 1 });
    assert.ok(points.length > 1, `${kind} must stamp more than one pixel at default settings`);
  }
  const scaled = DrawingTools.patternStampPoints("checker", 20, 20, { density: 0.5, scale: 2 });
  assert.ok(Math.max(...scaled.map(point => point.x)) - Math.min(...scaled.map(point => point.x)) >= 12);
});

test("palette shade stepping chooses adjacent luminance", () => {
  const palette = ["#000000", "#333333", "#888888", "#ffffff", "not-a-color"];
  assert.equal(DrawingTools.paletteStep("#333333", palette, 1), "#888888");
  assert.equal(DrawingTools.paletteStep("#888888", palette, -1), "#333333");
  assert.equal(DrawingTools.paletteStep("#ffffff", palette, 1), "#ffffff");
  assert.equal(DrawingTools.paletteStep("rgba(0,0,0,1)", palette, 1), "rgba(0,0,0,1)");
});

test("spritesheet layout is bounded and ordered", () => {
  const row = SpritesheetTools.layout(70, 36, { cellWidth: 16, cellHeight: 16, margin: 1, spacing: 1, order: "row" }, 20);
  assert.equal(row.total, 8);
  assert.deepEqual(row.cells[0], { x: 1, y: 1, w: 16, h: 16, row: 0, column: 0 });
  assert.deepEqual(row.cells[1], { x: 18, y: 1, w: 16, h: 16, row: 0, column: 1 });
  const column = SpritesheetTools.layout(70, 36, { cellWidth: 16, cellHeight: 16, margin: 1, spacing: 1, order: "column" }, 20);
  assert.deepEqual(column.cells[1], { x: 1, y: 18, w: 16, h: 16, row: 1, column: 0 });
  assert.throws(() => SpritesheetTools.layout(1024, 1024, { cellWidth: 16, cellHeight: 16 }, 20), /project limit/);
});

test("mod code policy is shared and blocks renderer globals", () => {
  assert.equal(ModCodePolicy.validate("return color;"), "return color;");
  assert.throws(() => ModCodePolicy.validate("return window.location;"), /Blocked API/);
  assert.throws(() => ModCodePolicy.validate("return globalThis['fetch'];"), /Blocked API/);
  assert.throws(() => ModCodePolicy.validate("x".repeat(ModCodePolicy.MAX_CODE_CHARS + 1)), /too long/);
});

test("brush lab controls and spritesheet controls stay connected", () => {
  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  const paletteWorkflow = fs.readFileSync(path.join(root, "src", "modules", "renderer", "palette-workflow.js"), "utf8");
  assert.match(html, /id="spritesheet-import-input"/);
  assert.match(html, /id="spritesheet-import-overlay"/);
  assert.match(html, /id="brush-density"/);
  assert.match(html, /id="brush-pattern-scale"/);
  assert.match(html, /id="brush-source-color"/);
  for (const name of ["Dither", "Noise", "Cluster", "Checker Grid", "Hatch", "Palette Lighten", "Palette Darken", "Selective Eraser", "Replace Color"]) assert.match(renderer, new RegExp(name));
  assert.match(renderer, /DrawingTools\.patternStampPoints/);
  assert.match(renderer, /DrawingTools\.paletteStep/);
  assert.match(renderer, /function syncBrushPresetOptions\(/);
  assert.match(renderer, /signature === brushOptionSignature/);
  assert.doesNotMatch(renderer, /brushPresetSelect\.innerHTML = ""/);
  assert.match(renderer, /SpritesheetTools/);
  assert.match(paletteWorkflow, /applySpritesheetImport/);
  assert.match(paletteWorkflow, /maxImageSourcePixels/);
});
