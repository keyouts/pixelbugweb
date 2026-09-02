"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const appearance = require("../src/modules/renderer/print-appearance");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");

test("print appearance settings stay bounded and nondestructive", () => {
  const state = appearance.create({ blendMode: "multiply", brightness: 9, contrast: -2, saturation: 9, hue: 500, grayscale: 2, sepia: 0.5, invert: 0.25, flipX: true });
  assert.equal(state.blendMode, "multiply");
  assert.equal(state.brightness, 2);
  assert.equal(state.contrast, 0);
  assert.equal(state.saturation, 3);
  assert.equal(state.hue, 180);
  assert.equal(state.grayscale, 1);
  assert.equal(state.sepia, 0.5);
  assert.equal(state.invert, 0.25);
  assert.equal(state.flipX, true);
  assert.match(appearance.filters(state), /brightness\(2\).*contrast\(0\).*saturate\(3\).*hue-rotate\(180deg\).*sepia\(0\.5\).*invert\(0\.25\)/);
  appearance.reset(state);
  assert.deepEqual(appearance.signature(state), { blendMode: "source-over", brightness: 1, contrast: 1, saturation: 1, hue: 0, grayscale: 0, sepia: 0, invert: 0, flipX: false, flipY: false });
});

test("print appearance controls are connected to export rendering", () => {
  ["print-layer-blend", "print-layer-brightness", "print-layer-contrast", "print-layer-saturation", "print-layer-hue", "print-layer-grayscale", "print-layer-sepia", "print-layer-invert", "print-layer-flip-x", "print-layer-flip-y", "print-layer-reset-appearance"].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(renderer, /PrintAppearance\.filters\(layerState\)/);
  assert.match(renderer, /PrintAppearance\.blendMode\(layerState\.blendMode \|\| descriptor\.blendMode\)/);
  assert.match(renderer, /layerState\.flipX \? -1 : 1/);
  assert.match(renderer, /layerState\.flipY \? -1 : 1/);
  assert.match(renderer, /PrintAppearance\.signature\(layerState\)/);
  assert.match(renderer, /printLayerResetAppearanceBtn\.onclick = resetActivePrintAppearance/);
  assert.match(html, /Blend With Layers Below/);
  assert.match(html, /Darken does not lower the image brightness/);
  assert.match(renderer, /printLayerBlendSelect\.onchange = updatePrintLayerBlend/);
});


test("print overview exposes the full blend set and Photoshop-style layer conveniences", () => {
  appearance.blendModes.forEach(mode => assert.match(html, new RegExp(`value="${mode}"`)));
  ["print-layer-undo", "print-layer-redo", "print-layer-center", "print-layer-fit", "print-layer-rotate-left", "print-layer-rotate-right"].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(html, /<optgroup label="Darken">/);
  assert.match(html, /<optgroup label="Lighten">/);
  assert.match(html, /<optgroup label="Contrast">/);
  assert.match(html, /<optgroup label="Compare">/);
  assert.match(renderer, /PrintWorkspace\.createHistory/);
  assert.match(renderer, /e\.shiftKey/);
});

test("print cutline is a separate preview-only layer", () => {
  assert.match(renderer, /makePrintArtCanvas\(\{ \.\.\.settings, showCutline: false \}/);
  assert.match(renderer, /cutline: makePrintLayerCutlineCanvas\(settings\)/);
  assert.match(renderer, /printLayerState\.cutline\.visible/);
  assert.match(renderer, /const settings = \{ \.\.\.printSettings\(\), showGuides: false, showCutline: false \}/);
});
