"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const rootHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const appHtml = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "src", "web-bridge.js"), "utf8");
const runnerSource = fs.readFileSync(path.join(root, "src", "web-mod-runner.js"), "utf8");
const psdWorkerSource = fs.readFileSync(path.join(root, "src", "web-psd-worker.js"), "utf8");

function fakeIndexedDb() {
  const records = new Map();
  function request(result) {
    const target = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => target.onsuccess?.());
    return target;
  }
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      return {
        objectStore() {
          return {
            get: key => request(records.get(key)),
            getAll: () => request([...records.values()]),
            put: value => { records.set(value.key, value); return request(value.key); },
            delete: key => { records.delete(key); return request(undefined); }
          };
        }
      };
    }
  };
  return {
    records,
    api: {
      open() {
        const target = { result: database, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
        queueMicrotask(() => { target.onupgradeneeded?.(); queueMicrotask(() => target.onsuccess?.()); });
        return target;
      }
    }
  };
}

function bridgeContext(existing = null, indexedDB = null) {
  const listeners = new Map();
  const window = {
    pixelBug: existing,
    PixelBugDocuments: null,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener(type, callback) { listeners.set(type, callback); },
    confirm: () => true
  };
  if (!existing) delete window.pixelBug;
  const document = {
    title: "Pixel Bug",
    documentElement: { dataset: {} },
    body: { appendChild() {} },
    createElement: () => ({ addEventListener() {}, click() {}, remove() {}, style: {} })
  };
  return { window, document, indexedDB, crypto: crypto.webcrypto, TextEncoder, TextDecoder, Blob, URL, atob, btoa, setTimeout, clearTimeout, console, queueMicrotask };
}

test("GitHub Pages entry opens the browser editor", () => {
  assert.match(rootHtml, /url=\.\/src\/index\.html/);
  assert.match(rootHtml, /Pixel Bug - Running v1\.5\.18/);
  assert.equal(fs.existsSync(path.join(root, ".nojekyll")), true);
});

test("browser bridge loads before the editor renderer", () => {
  const bridgeIndex = appHtml.indexOf('./web-bridge.js');
  const rendererIndex = appHtml.indexOf('./renderer.js');
  assert.ok(bridgeIndex > 0 && rendererIndex > bridgeIndex);
  assert.match(appHtml, /\.\/modules\/psd-template\.js/);
  assert.match(appHtml, /GitHub Pages/);
  assert.match(appHtml, /browser storage/);
});

test("browser bridge exposes the desktop renderer contract", () => {
  const context = bridgeContext();
  vm.runInNewContext(bridgeSource, context);
  assert.equal(context.document.title, "Pixel Bug - Running v1.5.18");
  assert.equal(context.document.documentElement.dataset.runtime, "web");
  const expected = ["saveFile", "saveProjectFile", "bindProjectPath", "forgetProjectPath", "decodePsdTemplate", "openProject", "openRecentProject", "listRecentProjects", "openVoxelModel", "getSystemTheme", "runModCode", "resetModRunner", "saveRecovery", "loadRecovery", "clearRecovery", "listRecoverySnapshots", "loadRecoverySnapshot", "deleteRecoverySnapshot", "listStoredProjects", "saveStoredProject", "loadStoredProject", "deleteStoredProject", "requestWindowClose", "completeWindowClose", "cancelWindowClose", "signalWindowCloseReady", "onSystemThemeChanged", "onBrowserZoomBlocked", "onWindowCloseRequested"];
  expected.forEach(name => assert.equal(typeof context.window.pixelBug[name], "function", `${name} missing`));
});

test("browser storage keeps recovery and project collections local", async () => {
  const database = fakeIndexedDb();
  const context = bridgeContext(null, database.api);
  vm.runInNewContext(bridgeSource, context);
  await context.window.pixelBug.saveRecovery({ payload: "project-data", summary: { name: "Test" }, forceSnapshot: true });
  assert.equal(await context.window.pixelBug.loadRecovery(), "project-data");
  const recovery = await context.window.pixelBug.listRecoverySnapshots();
  assert.equal(recovery.length, 1);
  const loadedRecovery = await context.window.pixelBug.loadRecoverySnapshot(recovery[0].id);
  assert.equal(loadedRecovery.payload, "project-data");
  const saved = await context.window.pixelBug.saveStoredProject("gallery", { projectId: "project-1", name: "Web Project", savedAt: 12, thumbnail: "", meta: "32 x 32", project: { name: "Web Project" } });
  assert.ok(saved.id);
  const listed = await context.window.pixelBug.listStoredProjects("gallery");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "Web Project");
  const loaded = await context.window.pixelBug.loadStoredProject("gallery", saved.id);
  assert.equal(loaded.project.name, "Web Project");
  await context.window.pixelBug.deleteStoredProject("gallery", saved.id);
  assert.equal((await context.window.pixelBug.listStoredProjects("gallery")).length, 0);
});

test("browser bridge leaves the desktop preload bridge alone", () => {
  const desktopApi = Object.freeze({ desktop: true });
  const context = bridgeContext(desktopApi);
  vm.runInNewContext(bridgeSource, context);
  assert.equal(context.window.pixelBug, desktopApi);
  assert.equal(context.document.title, "Pixel Bug");
});

test("web mod runner keeps brush and effect execution paths", () => {
  assert.match(runnerSource, /compileBrush/);
  assert.match(runnerSource, /compileEffect/);
  assert.match(runnerSource, /self\.onmessage = handleMessage/);
  assert.match(bridgeSource, /new Worker\("\.\/web-mod-runner\.js"\)/);
  assert.match(bridgeSource, /Mod timed out and was stopped/);
});

test("browser PSD decoder works without Node globals", () => {
  const source = fs.readFileSync(path.join(root, "src", "modules", "psd-template.js"), "utf8");
  const context = { globalThis: {}, Uint8Array, Uint32Array, DataView, ArrayBuffer, Math, String, Number, Error, Object };
  vm.runInNewContext(source, context);
  const bytes = new Uint8Array(43);
  bytes.set([0x38, 0x42, 0x50, 0x53], 0);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 1, false);
  view.setUint16(12, 3, false);
  view.setUint32(14, 1, false);
  view.setUint32(18, 1, false);
  view.setUint16(22, 8, false);
  view.setUint16(24, 3, false);
  view.setUint16(38, 0, false);
  bytes.set([12, 34, 56], 40);
  const result = context.globalThis.PixelBugPsdTemplate.decodePsdTemplate(bytes.buffer);
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
  assert.deepEqual([...result.rgba], [12, 34, 56, 255]);
});

test("browser PSD decoding stays off the editor thread", () => {
  assert.match(bridgeSource, /new Worker\("\.\/web-psd-worker\.js"\)/);
  assert.match(bridgeSource, /PSD decoding timed out/);
  assert.match(psdWorkerSource, /importScripts\("\.\/modules\/psd-template\.js"\)/);
  assert.match(psdWorkerSource, /self\.PixelBugPsdTemplate\.decodePsdTemplate/);
});

test("web mod runner executes brush and effect code", async () => {
  const replies = [];
  const self = { postMessage: value => replies.push(value) };
  vm.runInNewContext(runnerSource, { self, Function, String, Math, Number, parseInt, Array, Object, Promise });
  await self.onmessage({ data: { id: "brush-1", kind: "brush", code: "return [{ x, y, color }];", payload: { x: 2, y: 3, color: "#123456", pixels: [[null]], app: { width: 1, height: 1 } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(replies.pop().result)), [{ x: 2, y: 3, color: "#123456" }]);
  await self.onmessage({ data: { id: "effect-1", kind: "effect", code: "function effect(r, g, b, a) { return { r: 255 - r, g: 255 - g, b: 255 - b, a }; }", payload: { color: "#000000", pixels: [["#000000"]], app: { width: 1, height: 1 } } } });
  assert.deepEqual(JSON.parse(JSON.stringify(replies.pop().result)), [["#ffffff"]]);
});

test("browser save bridge writes single and grouped exports", async () => {
  const database = fakeIndexedDb();
  const context = bridgeContext(null, database.api);
  const singleWrites = [];
  context.window.showSaveFilePicker = async options => ({
    name: options.suggestedName,
    async createWritable() { return { write: async bytes => singleWrites.push([...bytes]), close: async () => {} }; }
  });
  vm.runInNewContext(bridgeSource, context);
  const single = await context.window.pixelBug.saveFile({ defaultPath: "pixel.png", filters: [{ name: "PNG", extensions: ["png"] }], data: "AQID", encoding: "base64" });
  assert.equal(single.ok, true);
  assert.deepEqual(singleWrites[0], [1, 2, 3]);

  delete context.window.showSaveFilePicker;
  const grouped = [];
  context.window.showDirectoryPicker = async () => ({
    async getFileHandle(name) {
      return { async createWritable() { return { write: async bytes => grouped.push([name, [...bytes]]), close: async () => {} }; } };
    }
  });
  const batch = await context.window.pixelBug.saveFile({ defaultPath: "sheet.png", data: "BAU=", encoding: "base64", extraFiles: [{ filename: "sheet.json", data: "{}", encoding: "utf8" }] });
  assert.equal(batch.ok, true);
  assert.deepEqual(grouped.map(item => item[0]), ["sheet.png", "sheet.json"]);
  assert.deepEqual(grouped[0][1], [4, 5]);
});
