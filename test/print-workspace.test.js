"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const workspace = require("../src/modules/renderer/print-workspace");

test("print workspace history restores edits and clears redo after a new branch", () => {
  let state = { x: 0 };
  const buttons = [];
  const history = workspace.createHistory({ capture: () => ({ ...state }), restore: snapshot => { state = { ...snapshot }; }, onChange: value => buttons.push(value) });
  history.push(); state.x = 10;
  assert.equal(history.undo(), true); assert.equal(state.x, 0);
  assert.equal(history.redo(), true); assert.equal(state.x, 10);
  history.push(); state.x = 25; history.undo(); history.push(); state.x = 40;
  assert.equal(history.redo(), false);
  assert.equal(buttons.at(-1).canRedo, false);
});

test("print workspace transform conveniences preserve bounds", () => {
  const bounds = { x: 20, y: 10, width: 100, height: 50 };
  const state = { x: 5, y: 8, scale: 0.5, rotation: 0 };
  assert.equal(workspace.center(state, bounds, 400, 300), true);
  assert.deepEqual([state.x, state.y], [130, 115]);
  assert.equal(workspace.fit(state, bounds, 400, 300), true);
  assert.equal(state.scale, 4);
  workspace.rotate(state, 90); assert.equal(state.rotation, 90);
  workspace.rotate(state, 180); assert.equal(state.rotation, -90);
});

test("print workspace geometry maps transformed layer handles", () => {
  const points = workspace.corners({ x: 0, y: 0, width: 100, height: 50 }, { x: 0, y: 0, scale: 1, rotation: 0 });
  assert.deepEqual(points, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
  const mapped = workspace.handlePoints(points, { x: 10, y: 20, scale: 2 }, 500, 500);
  assert.deepEqual(mapped[0], { x: 10, y: 20 });
  assert.equal(workspace.handleAt({ x: 12, y: 21 }, mapped, 5), 0);
  assert.deepEqual(workspace.documentPoint({ x: 210, y: 120 }, { x: 10, y: 20, scale: 2 }), { x: 100, y: 50 });
});
