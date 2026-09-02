"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");

function bodyOf(name) {
  const start = renderer.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is missing`);
  const next = renderer.indexOf("\nfunction ", start + 10);
  return renderer.slice(start, next < 0 ? renderer.length : next);
}

test("touch pan uses the multi-pointer center and cancels an in-progress canvas edit", () => {
  const begin = bodyOf("beginDraw");
  const move = bodyOf("moveDraw");
  const cancel = bodyOf("cancelTouchCanvasGesture");
  assert.match(renderer, /function touchPointerCenter\(\)/);
  assert.match(begin, /cancelTouchCanvasGesture\(\)/);
  assert.match(begin, /center = touchPointerCenter\(\)/);
  assert.match(move, /touchPointers\.set\(e\.pointerId, \{ x: e\.clientX, y: e\.clientY \}\)/);
  assert.match(move, /center = touchPointerCenter\(\)/);
  assert.match(cancel, /rollbackPendingHistory\(\)/);
  assert.match(html, /1 finger draws · 2 fingers pan/);
});

test("base history preserves redo for cancelled or no-op edits", () => {
  const finalize = bodyOf("finalizePendingHistory");
  const cancel = bodyOf("cancelPendingHistory");
  const push = bodyOf("pushHistory");
  assert.match(push, /historyPendingRedo = redoStack; redoStack = \[\]/);
  assert.match(finalize, /if \(!patch\.changes\.length\) \{ if \(pendingRedo\) redoStack = pendingRedo; return false; \}/);
  assert.match(cancel, /if \(historyPendingRedo\) redoStack = historyPendingRedo/);
  assert.match(renderer, /\$\("#redo-btn"\)\.onclick = \(\) => \{[\s\S]*?finalizePendingHistory\(\);[\s\S]*?if \(!redoStack\.length\) return;/);
});
