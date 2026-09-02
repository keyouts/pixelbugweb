const test = require("node:test");
const assert = require("node:assert/strict");

const codecs = require("../src/modules/renderer/export-codecs.js");

test("export byte codecs round trip without data loss", () => {
  const bytes = Uint8Array.from([0, 1, 2, 127, 128, 254, 255]);
  assert.deepEqual([...codecs.base64ToBytes(codecs.bytesToBase64(bytes))], [...bytes]);
});

test("GIF encoding keeps the expected container boundaries", () => {
  const gif = codecs.encodeGif([{ delay: 5, pixels: [["#ff0000", "#00ff00"]] }], 2, 1);
  assert.equal(Buffer.from(gif.slice(0, 6)).toString("ascii"), "GIF89a");
  assert.equal(gif.at(-1), 0x3b);
});

test("PNG metadata leaves non-PNG input unchanged", () => {
  const source = codecs.bytesToBase64(Uint8Array.from([1, 2, 3, 4]));
  assert.equal(codecs.addPngDpiMetadata(source, 300), source);
});
