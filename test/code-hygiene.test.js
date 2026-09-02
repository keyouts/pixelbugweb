"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const labelsSource = fs.readFileSync(path.join(root, "src", "modules", "accessibility-labels.js"), "utf8");

function attrs(markup) {
  return new Map([...markup.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

test("static canvas surfaces expose accessible intent", () => {
  const canvases = [...html.matchAll(/<canvas\b([^>]*)>/g)];
  assert.ok(canvases.length > 10);
  for (const match of canvases) {
    const values = attrs(match[1]);
    assert.ok(values.get("aria-hidden") === "true" || values.has("aria-label") || values.has("aria-labelledby"), `${values.get("id") || match[1].trim()} has no accessible intent`);
  }
});

test("hidden import controls expose useful names", () => {
  assert.match(html, /id="palette-import-input"[^>]*aria-label="Choose palette file"|aria-label="Choose palette file"[^>]*id="palette-import-input"/);
  assert.match(html, /id="ref-input"[^>]*aria-label="Choose reference image"|aria-label="Choose reference image"[^>]*id="ref-input"/);
});

test("dynamic controls receive accessible names", () => {
  assert.match(html, /modules\/accessibility-labels\.js/);
  assert.match(labelsSource, /MutationObserver/);
  assert.match(labelsSource, /button, \[role='button'\], input, select, textarea, canvas, \[tabindex\]/);
});
