const test = require("node:test");
const assert = require("node:assert/strict");

const { create } = require("../src/modules/renderer/model-parser.js");

const parser = create({
  rgbToHex: (r, g, b) => `#${[r, g, b].map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`,
  maxModelFileBytes: 12 * 1024 * 1024,
  maxModelExtraBytes: 8 * 1024 * 1024,
  maxModelTexturePixels: 16 * 1024 * 1024,
  maxModelTriangles: 250000
});

test("OBJ parsing triangulates faces and preserves vertex colors", () => {
  const triangles = parser.parseObjModel([
    "v 0 0 0 1 0 0",
    "v 1 0 0 0 1 0",
    "v 1 1 0 0 0 1",
    "v 0 1 0 1 1 1",
    "f 1 2 3 4"
  ].join("\n"));
  assert.equal(triangles.length, 2);
  assert.equal(triangles[0].points[0].color, "#ff0000");
  assert.match(triangles[0].color, /^#[0-9a-f]{6}$/);
});

test("ASCII and binary STL parsing remain bounded", () => {
  const ascii = parser.parseStlModel("facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet");
  assert.equal(ascii.length, 1);

  const buffer = new ArrayBuffer(134);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true);
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => view.setFloat32(96 + index * 4, value, true));
  assert.equal(parser.parseBinaryStlModel(buffer).length, 1);
});

test("model normalization centers geometry without interpolation", () => {
  const normalized = parser.normalizeModelTriangles([{ points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }], color: "#123456" }]);
  assert.deepEqual(normalized[0].points.map(point => [point.x, point.y, point.z]), [[-0.5, -0.5, 0], [0.5, -0.5, 0], [-0.5, 0.5, 0]]);
  assert.equal(normalized[0].color, "#123456");
});
