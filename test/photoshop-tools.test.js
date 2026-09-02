"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const features = require("../src/modules/editor-features");
const image = require("../src/modules/image-operations");

test("color transparency removes exact and tolerant matches", () => {
  const pixels = [["#ff0000", "#fe0101", "#f00000", null]];
  assert.equal(image.removeColor(pixels, "#ff0000", 0), 1);
  assert.deepEqual(pixels, [[null, "#fe0101", "#f00000", null]]);
  assert.equal(image.removeColor(pixels, "#ff0000", 2), 1);
  assert.deepEqual(pixels, [[null, null, "#f00000", null]]);
});

test("replace color respects selection masks", () => {
  const pixels = [["#112233", "#112233"], ["#112233", "#445566"]];
  const mask = features.createMask(2, 2);
  mask.addPoint(1, 0);
  assert.equal(image.replaceColor(pixels, "#112233", "#abcdef", 0, mask, features.maskHas), 1);
  assert.deepEqual(pixels, [["#112233", "#abcdef"], ["#112233", "#445566"]]);
});

test("similar selections support tolerance and connected erasing", () => {
  const pixels = [
    ["#100000", "#110000", null, "#100000"],
    ["#120000", "#500000", null, "#100000"]
  ];
  const similar = image.similarMask(pixels, "#100000", 4, 2, 2, features.createMask);
  assert.equal(similar.size, 5);
  const connected = image.floodSimilarMask(pixels, 0, 0, 4, 2, 2, features.createMask);
  assert.equal(connected.size, 3);
  assert.equal(features.maskHas(connected, 3, 0), false);
});

test("selection invert and border masks remain pixel precise", () => {
  const mask = features.boxMask({ x: 1, y: 1, w: 2, h: 2 }, 4, 4);
  const inverted = image.invertMask(mask, 4, 4, features.createMask, features.maskHas);
  assert.equal(inverted.size, 12);
  const inside = image.borderMask(mask, 4, 4, "inside", features.createMask, features.morphMask, features.maskHas);
  const outside = image.borderMask(mask, 4, 4, "outside", features.createMask, features.morphMask, features.maskHas);
  assert.equal(inside.size, 4);
  assert.equal(outside.size, 12);
});

test("threshold posterize and tonal tools preserve transparent pixels", () => {
  assert.equal(image.thresholdColor("#101010", 128, "#000000", "#ffffff", true, false), null);
  assert.equal(image.thresholdColor("#f0f0f0", 128, "#000000", "#ffffff", false, false), "#ffffff");
  assert.equal(image.posterizeColor("#808080", 2), "#ffffff");
  assert.equal(image.grayscaleColor("#ff0000"), "#363636");
  assert.equal(image.invertColor("#123456"), "#edcba9");
  assert.equal(image.adjustColor(null, 20, 20, 1), null);
});

test("gradient and palette maps follow luminance", () => {
  assert.equal(image.gradientColor("#000000", "#102030", "#f0e0d0"), "#102030");
  assert.equal(image.gradientColor("#ffffff", "#102030", "#f0e0d0"), "#f0e0d0");
  assert.equal(image.paletteColor("#050505", ["#ffffff", "#000000", "#808080"]), "#000000");
  assert.equal(image.paletteColor("#fafafa", ["#ffffff", "#000000", "#808080"]), "#ffffff");
});

test("offset wraps or clips pixels without interpolation", () => {
  const pixels = [["#111111", null], [null, "#222222"]];
  assert.deepEqual(image.offsetGrid(pixels, 2, 2, 1, 0, true), [[null, "#111111"], ["#222222", null]]);
  assert.deepEqual(image.offsetGrid(pixels, 2, 2, 1, 0, false), [[null, "#111111"], [null, null]]);
});

test("palette swapping is simultaneous across shared project pixels", () => {
  const shared = [["#aa0000", "#00aa00"]];
  const project = { frames: [
    { layers: [{ pixels: shared }] },
    { layers: [{ pixels: shared }, { pixels: [["#aa0000"]] }] }
  ] };
  assert.equal(image.swapProjectColors(project, "#aa0000", "#00aa00"), 3);
  assert.deepEqual(shared, [["#00aa00", "#aa0000"]]);
  assert.deepEqual(project.frames[1].layers[1].pixels, [["#00aa00"]]);
});

test("photoshop style controls are connected to the editor", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const index = fs.readFileSync(path.join(__dirname, "..", "src", "index.html"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  [
    "selection-invert-btn", "selection-fill-btn", "selection-stroke-btn", "selection-border-btn",
    "selection-tolerance", "layer-brightness", "layer-contrast", "layer-gamma", "palette-swap-btn",
    "pixel-remove-color-btn", "pixel-replace-color-btn", "pixel-threshold-btn", "pixel-posterize-btn",
    "pixel-gradient-btn", "pixel-palette-map-btn", "pixel-offset-btn"
  ].forEach(id => assert.match(index, new RegExp(`id=[\\\"']${id}[\\\"']`)));
  assert.match(renderer, /\["magicEraser", "Magic Eraser", "K"\]/);
  assert.match(renderer, /\["eyedropper", "Pick Color", "I"\], \["clone", "Clone Stamp", "C"\]/);
  assert.match(index, /aria-describedby="pixel-remove-help"/);
});
