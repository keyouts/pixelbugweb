"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sourceRoot = path.join(root, "src");
const html = fs.readFileSync(path.join(sourceRoot, "index.html"), "utf8");

function javascriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(target);
  }
  return files;
}

const sourceFiles = javascriptFiles(sourceRoot);
const sourceText = sourceFiles.map(file => fs.readFileSync(file, "utf8")).join("\n");

function attributes(markup) {
  return new Map([...markup.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

test("application resources resolve", () => {
  const refs = [...html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)].map(match => match[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(sourceRoot, ref.slice(2))), `${ref} is missing`);
  for (const file of sourceFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/new Worker\(["'](\.\/[^"']+)["']/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), match[1])), `${match[1]} from ${path.relative(root, file)} is missing`);
    }
  }
});

test("application ids and accessibility targets resolve", () => {
  const ids = [...html.matchAll(/(?:^|\s)id="([^"]+)"/gm)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const known = new Set(ids);
  for (const match of html.matchAll(/<(?:label|button|input|select|textarea|output|div|section|aside|nav|details|summary)\b([^>]*)>/g)) {
    const attrs = attributes(match[1]);
    if (attrs.has("for")) assert.ok(known.has(attrs.get("for")), `${attrs.get("for")} label target is missing`);
    for (const key of ["aria-controls", "aria-describedby", "aria-labelledby"]) {
      if (!attrs.has(key)) continue;
      for (const id of attrs.get(key).split(/\s+/).filter(Boolean)) assert.ok(known.has(id), `${id} ${key} target is missing`);
    }
  }
});

test("application buttons have activation routes", () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
  assert.ok(buttons.length > 300);
  for (const match of buttons) {
    const attrs = attributes(match[1]);
    const id = attrs.get("id");
    const delegated = [...attrs.keys()].some(key => key.startsWith("data-"));
    assert.ok(delegated || (id && sourceText.includes(id)), `${id || match[1].trim()} has no activation route`);
  }
});


test("application form controls have interaction routes", () => {
  const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(controls.length > 300);
  for (const match of controls) {
    const attrs = attributes(match[2]);
    const id = attrs.get("id");
    if (!id) continue;
    const dynamicSelectionTransform = id.startsWith("selection-transform-") && sourceText.includes("#selection-transform-${id}");
    assert.ok(sourceText.includes(id) || dynamicSelectionTransform, `${id} has no interaction route`);
  }
});

test("renderer bridge calls are exposed", () => {
  const preload = fs.readFileSync(path.join(sourceRoot, "preload.js"), "utf8");
  const apiBody = preload.match(/const api = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] || "";
  const exposed = new Set([...apiBody.matchAll(/^\s{2}([A-Za-z_]\w*):/gm)].map(match => match[1]));
  const used = new Set();
  for (const file of sourceFiles) {
    if (file.endsWith(`${path.sep}preload.js`)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/window\.pixelBug(?:\?\.)?\.?(\w+)/g)) {
      if (match[1] !== "Mod") used.add(match[1]);
    }
  }
  assert.ok(used.size > 20);
  for (const method of used) assert.ok(exposed.has(method), `${method} is not exposed by preload.js`);
});

test("preload channels reach the main process", () => {
  const preload = fs.readFileSync(path.join(sourceRoot, "preload.js"), "utf8");
  const channelBody = preload.match(/const CHANNELS = Object\.freeze\(\{([\s\S]*?)\n\}\);/)?.[1] || "";
  const channels = [...channelBody.matchAll(/:\s*"([^"]+)"/g)].map(match => match[1]);
  const mainFiles = [path.join(sourceRoot, "main.js"), ...javascriptFiles(path.join(sourceRoot, "main"))];
  const mainText = mainFiles.map(file => fs.readFileSync(file, "utf8")).join("\n");
  assert.ok(channels.length > 20);
  for (const channel of channels) assert.ok(mainText.includes(channel), `${channel} is not handled or emitted by the main process`);
});
