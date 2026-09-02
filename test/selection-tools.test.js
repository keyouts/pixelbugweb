"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const EditorFeatures = require("../src/modules/editor-features");
const SelectionWorkflow = require("../src/modules/renderer/selection-workflow");

const source = name => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

test("large color masks remain compact", () => {
  const size = 512;
  const pixels = Array.from({ length: size }, () => Array(size).fill("#A1B2C3"));
  const mask = EditorFeatures.colorMask(pixels, "#a1b2c3", size, size);
  assert.ok(mask instanceof Set);
  assert.equal(mask.size, size * size);
  assert.equal(mask.bits.byteLength, size * size);
  assert.deepEqual(EditorFeatures.maskBounds(mask, size, size), { x: 0, y: 0, w: size, h: size });
  const runs = EditorFeatures.maskRuns(mask);
  assert.equal(runs.length, size);
  assert.deepEqual(runs[0], { x: 0, y: 0, w: size });
});

test("optimized masks preserve selection operations", () => {
  const pixels = [
    ["#ff0000", "#00ff00", "#ff0000"],
    [null, "#ff0000", null]
  ];
  const red = EditorFeatures.colorMask(pixels, "#FF0000", 3, 2);
  const box = EditorFeatures.boxMask({ x: 0, y: 0, w: 2, h: 2 }, 3, 2);
  assert.equal(red.size, 3);
  assert.equal(EditorFeatures.combineMasks(box, red, "add").size, 5);
  assert.equal(EditorFeatures.combineMasks(box, red, "subtract").size, 2);
  assert.equal(EditorFeatures.combineMasks(box, red, "intersect").size, 2);
  assert.equal(EditorFeatures.maskHas(red, 2, 0), true);
  assert.equal(EditorFeatures.maskHas(red, 1, 0), false);
  const shifted = SelectionWorkflow.shiftMask(red, 1, 1, 4, 3, EditorFeatures);
  assert.equal(EditorFeatures.maskHas(shifted, 1, 1), true);
  assert.equal(EditorFeatures.maskHas(shifted, 3, 1), true);
  const cleared = pixels.map(row => row.slice());
  assert.equal(SelectionWorkflow.clearPixels(red, cleared, EditorFeatures, (x, y, value, target) => { target[y][x] = value; }), 3);
  assert.deepEqual(cleared, [[null, "#00ff00", null], [null, null, null]]);
});

test("base color selection is connected and accessible", () => {
  const html = source("index.html");
  const renderer = source("renderer.js");
  assert.match(html, /id="selection-color-btn"/);
  assert.match(html, /id="selection-color-help"/);
  assert.match(html, /modules\/renderer\/selection-workflow\.js/);
  assert.match(renderer, /function selectCurrentLayerColor\(\)/);
  assert.match(renderer, /selectionColorBtn\?\.addEventListener\("click", selectCurrentLayerColor\)/);
  assert.match(renderer, /Choose a painted pixel when selecting by color\./);
});


test("selection grid regions move painted bounds safely", () => {
  const pixels = [[null, null, null], [null, "#111111", null], [null, "#222222", null]];
  const box = { x: 1, y: 1, w: 1, h: 2 };
  const data = SelectionWorkflow.extractGridRegion(pixels, box);
  assert.deepEqual(data.pixels, [["#111111"], ["#222222"]]);
  assert.deepEqual(data.mask, [[true], [true]]);
  const changed = SelectionWorkflow.clearGridRegion(pixels, box, data, (x, y, value, target) => { target[y][x] = value; return true; });
  assert.equal(changed, 2);
  assert.equal(pixels[1][1], null);
  assert.equal(pixels[2][1], null);
});

test("selection handles resize from canvas edges", () => {
  const box = { x: 2, y: 2, w: 4, h: 2 };
  assert.equal(SelectionWorkflow.hitHandle(box, { x: 6, y: 3 }, 0.3), "e");
  assert.deepEqual(SelectionWorkflow.resizeBoxFromHandle(box, "se", { x: 10, y: 6 }, { width: 16, height: 16 }), { x: 2, y: 2, w: 8, h: 4 });
  assert.deepEqual(SelectionWorkflow.resizeBoxFromHandle(box, "se", { x: 10, y: 5 }, { width: 16, height: 16, preserveAspect: true }), { x: 2, y: 2, w: 8, h: 4 });
});

test("base selection expansion is wired", () => {
  const html = source("index.html");
  const renderer = source("renderer.js");
  assert.match(html, /option value="ellipse">Ellipse<\/option>/);
  assert.match(html, /option value="polygon">Polygon Lasso<\/option>/);
  assert.match(html, /option value="intersect">Intersect<\/option>/);
  assert.match(html, /aria-describedby="selection-command-help" id="selection-all-btn"/);
  assert.match(html, /id="selection-opaque-btn"/);
  assert.match(html, /id="selection-reselect-btn"/);
  assert.match(html, /aria-describedby="canvas-scale-help" id="canvas-scale-percent"/);
  assert.match(html, /aria-describedby="selection-combine-help" id="selection-combine"/);
  assert.match(renderer, /\["move", "Move", "V"\]/);
  assert.match(renderer, /function nudgeSelection\(/);
  assert.match(renderer, /function beginSelectionResize\(/);
  assert.match(renderer, /beginSelectionPixelMove\(point, event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(renderer, /x: selectionDrag\.originalBox\.x \+ dx, y: selectionDrag\.originalBox\.y \+ dy/);
  assert.match(renderer, /!modMode && !playModeScreen && !voxelModeScreen && !printMode/);
  assert.doesNotMatch(renderer, /extractSelectionData\(/);
  assert.doesNotMatch(renderer, /EditorFeatures\.rectMask\(/);
});
