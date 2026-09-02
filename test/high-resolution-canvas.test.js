"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const PixelGridCache = require("../src/modules/renderer/pixel-grid-cache");
const AnimationWorkflow = require("../src/modules/renderer/animation-workflow");

function trackedGrid(width, height) {
  let reads = 0;
  const rows = Array.from({ length: height }, () => new Proxy(Array.from({ length: width }, () => null), {
    get(target, key, receiver) {
      if (/^\d+$/.test(String(key))) reads++;
      return Reflect.get(target, key, receiver);
    }
  }));
  return { grid: rows, reads: () => reads };
}

function fakeCanvas(width = 512, height = 512) {
  const data = new Uint8ClampedArray(width * height * 4);
  data[3] = 255;
  const context = {
    drawImage() {},
    fillRect() {},
    getImageData: () => ({ data: data.slice() }),
    putImageData() {},
    restore() {},
    save() {},
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false
  };
  return { width, height, getContext: () => context };
}

test("paint presence cache avoids repeated 512 canvas scans during a stroke", () => {
  const tracker = PixelGridCache.create();
  const source = trackedGrid(512, 512);
  assert.equal(tracker.hasPaint(source.grid), false);
  const firstReads = source.reads();
  assert.ok(firstReads >= 512 * 512);
  assert.equal(tracker.hasPaint(source.grid), false);
  assert.equal(source.reads(), firstReads);
  source.grid[200][200] = "#ffffff";
  tracker.noteMutation(source.grid, null, "#ffffff");
  assert.equal(tracker.hasPaint(source.grid), true);
  assert.equal(source.reads(), firstReads);
  source.grid[200][200] = null;
  tracker.noteMutation(source.grid, "#ffffff", null);
  assert.equal(tracker.hasPaint(source.grid), false);
  assert.equal(source.reads(), firstReads);
});

test("onion frames reuse tinted canvases until artwork changes", () => {
  const priorStorage = global.localStorage;
  const priorDocument = global.document;
  global.localStorage = { getItem: () => null, setItem() {} };
  global.document = { createElement: () => fakeCanvas() };
  try {
    const frames = [{ layers: [] }, { layers: [] }, { layers: [] }];
    const state = { activeFrame: 1, frames };
    let stamp = 1;
    let composites = 0;
    const target = fakeCanvas().getContext("2d");
    const workflow = AnimationWorkflow.create({
      flattenedPixels: () => { throw new Error("slow onion fallback used"); },
      compositedFrameCanvas: () => { composites++; return fakeCanvas(); },
      getArtworkCacheStamp: () => stamp,
      getState: () => state,
      getShowOnion: () => true,
      projectWidth: () => 512,
      projectHeight: () => 512,
      renderScratchCtx: target,
      isHexColor: value => /^#[0-9a-f]{6}$/i.test(String(value || ""))
    });
    workflow.drawOnionFrames();
    assert.equal(composites, 2);
    workflow.drawOnionFrames();
    assert.equal(composites, 2);
    stamp++;
    workflow.drawOnionFrames();
    assert.equal(composites, 4);
  } finally {
    global.localStorage = priorStorage;
    global.document = priorDocument;
  }
});

test("pointer redraw and shape preview work is frame bounded", () => {
  const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  assert.match(renderer, /function scheduleCanvasDraw\(\)[\s\S]*requestAnimationFrame/);
  assert.match(renderer, /function previewShape\(end\)[\s\S]*requestAnimationFrame/);
  assert.match(renderer, /function clearPreviewPixels\(\)/);
  assert.match(renderer, /previewLayer = blankPixels\(projectWidth\(\), projectHeight\(\)\);[\s\S]*clearPreviewPixels\(\);/);
  assert.match(renderer, /function previewPixels\(data, box\)[\s\S]*previewLayerOwner !== "selection"[\s\S]*clearPreviewPixels\(\);[\s\S]*setPixelDirect/);
  assert.match(renderer, /previewLayerOwner !== "shape"/);
  assert.match(renderer, /else scheduleCanvasDraw\(\);/);
});

test("brush redraw tracks only the changed canvas region", () => {
  const StrokeRenderCache = require("../src/modules/renderer/stroke-render-cache");
  const tracker = StrokeRenderCache.create();
  tracker.note(200, 150);
  tracker.note(203, 155);
  assert.deepEqual(tracker.take(512, 512, 2), { x: 198, y: 148, width: 8, height: 10 });
  assert.equal(tracker.take(512, 512, 2), null);
  const renderer = fs.readFileSync(path.join(__dirname, "..", "src", "renderer.js"), "utf8");
  assert.match(renderer, /function drawCanvasPaintRegion\(bounds\)/);
  assert.match(renderer, /canvasStrokeTracker\.note\(x, y\)/);
  assert.match(renderer, /canvasStrokeTracker\.take\(projectWidth\(\), projectHeight\(\)/);
  assert.match(renderer, /if \(dirty && drawing\) drawCanvasPaintRegion\(dirty\)/);
});
