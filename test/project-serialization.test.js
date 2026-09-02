"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ProjectSerialization = require("../src/modules/renderer/project-serialization");
const RecoveryWorkflow = require("../src/modules/renderer/recovery-workflow");

class FakeWorker {
  constructor(url) {
    this.url = url;
    this.messages = [];
    FakeWorker.instances.push(this);
  }

  postMessage(value) { this.messages.push(value); }
  terminate() { this.terminated = true; }
}
FakeWorker.instances = [];

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    value: key => values.get(key)
  };
}

test("project serializer worker routes project and session jobs", async () => {
  FakeWorker.instances.length = 0;
  const serializer = ProjectSerialization.create({ WorkerCtor: FakeWorker, workerUrl: "worker.js", timeoutMs: 5000 });
  const projectPromise = serializer.serializeProject({ name: "Sprite" }, 2);
  const sessionPromise = serializer.serializeSession([{ id: "one", project: {} }], "one", 0);
  const worker = FakeWorker.instances[0];
  assert.equal(worker.url, "worker.js");
  assert.equal(worker.messages.length, 2);
  assert.equal(worker.messages[0].kind, "project");
  assert.equal(worker.messages[1].kind, "session");
  worker.onmessage({ data: { id: worker.messages[1].id, ok: true, text: "session-data" } });
  worker.onmessage({ data: { id: worker.messages[0].id, ok: true, text: "project-data" } });
  assert.equal(await projectPromise, "project-data");
  assert.equal(await sessionPromise, "session-data");
  serializer.terminate();
  assert.equal(worker.terminated, true);
});

test("project serializer worker rejects failed jobs without affecting others", async () => {
  FakeWorker.instances.length = 0;
  const serializer = ProjectSerialization.create({ WorkerCtor: FakeWorker, timeoutMs: 5000 });
  const failed = serializer.serializeProject({ name: "Bad" });
  const passed = serializer.serializeProject({ name: "Good" });
  const worker = FakeWorker.instances[0];
  worker.onmessage({ data: { id: worker.messages[0].id, ok: false, error: "packing failed" } });
  worker.onmessage({ data: { id: worker.messages[1].id, ok: true, text: "good-data" } });
  await assert.rejects(failed, /packing failed/);
  assert.equal(await passed, "good-data");
  serializer.terminate();
});

test("async recovery ignores serialization that becomes stale", async () => {
  const storage = memoryStorage();
  const resolvers = [];
  const workflow = RecoveryWorkflow.create({
    storage,
    storageKey: "recovery",
    maxAutosaveChars: 1000,
    maxLocalAutosaveChars: 1000,
    safeMode: false,
    runWhenIdle: callback => callback(),
    serialize: () => "sync",
    serializeAsync: () => new Promise(resolve => resolvers.push(resolve)),
    recoverySummary: () => ({}),
    saveRecovery: async () => {},
    clearRecovery: async () => {},
    isInputPending: () => false,
    isRuntimeActive: () => false,
    refreshGallery: () => {},
    syncActiveDocument: () => {},
    stopRuntime: () => {},
    setStatus: () => {},
    dirtyNames: () => [],
    requestWindowClose: async () => ({ action: "cancel" }),
    cancelWindowClose: async () => {},
    saveAllDirty: async () => true,
    completeWindowClose: async () => {},
    onPaused: () => {}
  });
  const firstRevision = workflow.revision();
  const pending = workflow.saveNow(firstRevision);
  workflow.schedule();
  resolvers[0]("old-data");
  await pending;
  assert.equal(storage.value("recovery"), undefined);
});

test("serializer worker imports only local packaging modules", () => {
  const root = path.join(__dirname, "..");
  const worker = fs.readFileSync(path.join(root, "src", "workers", "project-serializer-worker.js"), "utf8");
  assert.match(worker, /importScripts\("\.\.\/modules\/project-package\.js", "\.\.\/modules\/session-recovery\.js"\)/);
  assert.doesNotMatch(worker, /fetch\(|XMLHttpRequest|WebSocket/);
});


test("recovery flush retries a serialization made stale by an edit", async () => {
  const storage = memoryStorage();
  const resolvers = [];
  const saved = [];
  const workflow = RecoveryWorkflow.create({
    storage,
    storageKey: "recovery",
    maxAutosaveChars: 1000,
    maxLocalAutosaveChars: 1000,
    safeMode: false,
    runWhenIdle: callback => callback(),
    serialize: () => "sync",
    serializeAsync: () => new Promise(resolve => resolvers.push(resolve)),
    recoverySummary: () => ({}),
    saveRecovery: async value => { saved.push(value.payload); },
    clearRecovery: async () => {},
    isInputPending: () => false,
    isRuntimeActive: () => false,
    refreshGallery: () => {},
    syncActiveDocument: () => {},
    stopRuntime: () => {},
    setStatus: () => {},
    dirtyNames: () => [],
    requestWindowClose: async () => ({ action: "cancel" }),
    cancelWindowClose: async () => {},
    saveAllDirty: async () => true,
    completeWindowClose: async () => {},
    onPaused: () => {}
  });
  const pending = workflow.flush();
  await Promise.resolve();
  assert.equal(resolvers.length, 1);
  workflow.schedule();
  resolvers.shift()("stale-data");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(resolvers.length, 1);
  resolvers.shift()("fresh-data");
  assert.equal(await pending, true);
  assert.equal(storage.value("recovery"), "fresh-data");
  assert.deepEqual(saved, ["fresh-data"]);
  await workflow.discard();
});
