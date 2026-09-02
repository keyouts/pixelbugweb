"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const EditorPreferences = require("../src/modules/renderer/editor-preferences");
const ModeWorkflow = require("../src/modules/renderer/mode-workflow");
const RecoveryPanel = require("../src/modules/renderer/recovery-panel");
const RecoveryWorkflow = require("../src/modules/renderer/recovery-workflow");

const root = path.join(__dirname, "..");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    value: key => values.get(key)
  };
}

function recoveryOptions(overrides = {}) {
  return {
    storage: memoryStorage(),
    storageKey: "recovery",
    maxAutosaveChars: 1000,
    maxLocalAutosaveChars: 1000,
    safeMode: false,
    runWhenIdle: callback => callback(),
    serialize: () => "project-data",
    recoverySummary: () => ({ documents: 2 }),
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
    onPaused: () => {},
    ...overrides
  };
}

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.textContent = "";
    this.className = "";
  }

  set innerHTML(value) {
    this.children = [];
    this._innerHTML = value;
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function findElement(element, predicate) {
  if (predicate(element)) return element;
  for (const child of element.children || []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function recoveryPanelOptions(overrides = {}) {
  return {
    documentRef: { createElement: tagName => new TestElement(tagName) },
    listElement: new TestElement("section"),
    statusElement: new TestElement("output"),
    formatBytes: value => `${value} bytes`,
    listSnapshots: async () => [],
    loadSnapshot: async () => ({ payload: "snapshot" }),
    deleteSnapshot: async () => {},
    saveRecovery: async () => {},
    confirmAction: () => true,
    restoreRecovery: async () => true,
    saveLocalNow: () => {},
    canSerialize: () => true,
    serializeRecovery: () => "session",
    recoverySummary: () => ({ tabCount: 2 }),
    setStatus: () => {},
    ...overrides
  };
}

test("editor preferences preserve defaults and saved values", () => {
  const storage = memoryStorage();
  const preferences = EditorPreferences.create({ storage });
  assert.deepEqual(preferences.load(), { color: "#000000", showGrid: true, showOnion: true });
  assert.deepEqual(preferences.save({ color: "#12abEF", showGrid: false, showOnion: true }), { color: "#12abEF", showGrid: false, showOnion: true });
  assert.deepEqual(preferences.load(), { color: "#12abEF", showGrid: false, showOnion: true });
  storage.setItem("pixel-bug-editor-preferences", "not-json");
  assert.deepEqual(preferences.load(), { color: "#000000", showGrid: true, showOnion: true });
});

test("mode coordinator preserves every original transition order", () => {
  const calls = [];
  const workflow = ModeWorkflow.create({
    deactivate: Object.fromEntries(["mod", "play", "voxel", "print"].map(mode => [mode, () => calls.push(mode)]))
  });
  Object.entries({
    mod: ["play", "voxel", "print"],
    play: ["mod", "voxel", "print"],
    voxel: ["mod", "play", "print"],
    print: ["mod", "play", "voxel"]
  }).forEach(([mode, expected]) => {
    calls.length = 0;
    workflow.beforeEnter(mode);
    assert.deepEqual(calls, expected);
  });
  assert.throws(() => workflow.beforeEnter("unknown"), /Unknown editor mode/);
});

test("recovery scheduling retains delayed local and mirrored saves", async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  global.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  global.clearTimeout = id => timers.delete(id);
  try {
    const storage = memoryStorage();
    const saves = [];
    let galleryRefreshes = 0;
    let documentSyncs = 0;
    const workflow = RecoveryWorkflow.create(recoveryOptions({
      storage,
      saveRecovery: async value => saves.push(value),
      refreshGallery: () => { galleryRefreshes++; },
      syncActiveDocument: () => { documentSyncs++; }
    }));
    workflow.schedule();
    assert.equal(workflow.revision(), 1);
    assert.equal(galleryRefreshes, 1);
    assert.equal(documentSyncs, 1);
    const localTimer = [...timers.values()].find(timer => timer.delay === 800);
    assert.ok(localTimer);
    timers.delete([...timers.entries()].find(([, timer]) => timer === localTimer)[0]);
    localTimer.callback();
    assert.equal(storage.value("recovery"), "project-data");
    const mirrorTimer = [...timers.values()].find(timer => timer.delay === 3000);
    assert.ok(mirrorTimer);
    mirrorTimer.callback();
    await Promise.resolve();
    assert.deepEqual(saves, [{ payload: "project-data", summary: { documents: 2 } }]);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("recovery scheduling rejects stale, runtime, safe, and oversized writes", async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = new Map();
  let timerId = 0;
  global.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  };
  global.clearTimeout = id => timers.delete(id);
  try {
    let runtimeActive = true;
    let serialized = 0;
    let cleared = 0;
    const paused = [];
    const storage = memoryStorage({ recovery: "previous" });
    const workflow = RecoveryWorkflow.create(recoveryOptions({
      storage,
      maxAutosaveChars: 5,
      serialize: () => { serialized++; return "too-large"; },
      clearRecovery: async () => { cleared++; },
      isRuntimeActive: () => runtimeActive,
      onPaused: value => paused.push(value)
    }));
    workflow.schedule();
    assert.equal(workflow.revision(), 0);
    assert.equal(timers.size, 0);
    runtimeActive = false;
    workflow.schedule();
    const staleRevision = workflow.revision();
    workflow.schedule();
    workflow.saveNow(staleRevision);
    assert.equal(serialized, 0);
    workflow.saveNow(workflow.revision());
    await Promise.resolve();
    assert.equal(storage.getItem("recovery"), null);
    assert.equal(cleared, 1);
    assert.deepEqual(paused, [true]);

    let safeSaves = 0;
    const safeWorkflow = RecoveryWorkflow.create(recoveryOptions({
      safeMode: true,
      serialize: () => { safeSaves++; return "safe"; }
    }));
    safeWorkflow.saveNow();
    await safeWorkflow.flush();
    assert.equal(safeSaves, 0);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("recovery close flow preserves cancel, save, and discard behavior", async () => {
  const actions = [];
  const cancelWorkflow = RecoveryWorkflow.create(recoveryOptions({
    setStatus: value => actions.push(value),
    requestWindowClose: async () => ({ action: "cancel" }),
    cancelWindowClose: async () => actions.push("cancelled")
  }));
  await cancelWorkflow.handleCloseRequest();
  assert.deepEqual(actions, ["Preparing projects for close.", "cancelled", "Close cancelled."]);

  let saves = 0;
  let completed = 0;
  const saveWorkflow = RecoveryWorkflow.create(recoveryOptions({
    saveRecovery: async () => { saves++; },
    dirtyNames: () => ["Sprite", "Tiles"],
    requestWindowClose: async value => {
      assert.deepEqual(value, { dirtyNames: ["Sprite", "Tiles"], recoveryFailed: false });
      return { action: "save" };
    },
    completeWindowClose: async () => { completed++; }
  }));
  await saveWorkflow.handleCloseRequest();
  assert.equal(saves, 2);
  assert.equal(completed, 1);
  let unloadPreparations = 0;
  saveWorkflow.beforeUnload(() => { unloadPreparations++; });
  assert.equal(unloadPreparations, 0);

  const storage = memoryStorage({ recovery: "old" });
  let cleared = 0;
  const discardWorkflow = RecoveryWorkflow.create(recoveryOptions({
    storage,
    requestWindowClose: async () => ({ action: "discard" }),
    clearRecovery: async () => { cleared++; }
  }));
  await discardWorkflow.handleCloseRequest();
  assert.equal(storage.getItem("recovery"), null);
  assert.equal(cleared, 1);
});

test("recovery panel preserves snapshot details and accessible actions", async () => {
  const snapshot = { id: "snap-one", savedAt: 0, bytes: 240, summary: { name: "Sprite Tabs", tabCount: 2, dirtyCount: 1, thumbnail: "data:image/png;base64,AA==" } };
  let restoredPayload = "";
  let localSaves = 0;
  const options = recoveryPanelOptions({
    listSnapshots: async () => [snapshot],
    restoreRecovery: async payload => { restoredPayload = payload; return true; },
    saveLocalNow: () => { localSaves++; }
  });
  const panel = RecoveryPanel.create(options);
  await panel.render();
  assert.equal(options.statusElement.textContent, "1 recovery snapshot.");
  assert.equal(options.listElement.attributes.get("aria-busy"), "false");
  const row = options.listElement.children[0];
  assert.equal(row.className, "recovery-snapshot-row");
  const details = findElement(row, element => element.textContent === "2 tabs · 1 unsaved · 240 bytes");
  assert.ok(details);
  const image = findElement(row, element => element.tagName === "img");
  assert.equal(image.alt, "");
  const restore = findElement(row, element => element.textContent === "Restore");
  const remove = findElement(row, element => element.textContent === "Delete");
  assert.match(restore.attributes.get("aria-label"), /^Restore Sprite Tabs from /);
  assert.equal(remove.attributes.get("aria-label"), "Delete Sprite Tabs recovery snapshot");
  await restore.onclick();
  assert.equal(restoredPayload, "snapshot");
  assert.equal(localSaves, 1);
  assert.equal(options.statusElement.textContent, "Recovery snapshot restored.");
});

test("recovery panel preserves cancel, delete, empty, and failure paths", async () => {
  const snapshot = { id: "snap-two", savedAt: 0, bytes: 10, summary: {} };
  let confirmations = false;
  let loads = 0;
  let deletes = 0;
  let listCalls = 0;
  const options = recoveryPanelOptions({
    listSnapshots: async () => { listCalls++; return [snapshot]; },
    loadSnapshot: async () => { loads++; return { payload: "snapshot" }; },
    deleteSnapshot: async () => { deletes++; },
    confirmAction: () => confirmations
  });
  const panel = RecoveryPanel.create(options);
  await panel.render();
  const restore = findElement(options.listElement, element => element.textContent === "Restore");
  const remove = findElement(options.listElement, element => element.textContent === "Delete");
  await restore.onclick();
  await remove.onclick();
  assert.equal(loads, 0);
  assert.equal(deletes, 0);
  confirmations = true;
  await remove.onclick();
  assert.equal(deletes, 1);
  assert.equal(listCalls, 2);

  options.listSnapshots = async () => [];
  const emptyOptions = recoveryPanelOptions();
  const emptyPanel = RecoveryPanel.create(emptyOptions);
  await emptyPanel.render();
  assert.equal(emptyOptions.statusElement.textContent, "No recovery snapshots.");
  assert.equal(emptyOptions.listElement.children[0].textContent, "No rotating recovery snapshots are available yet.");

  const failedOptions = recoveryPanelOptions({ listSnapshots: async () => { throw new Error("Snapshot list failed."); } });
  await RecoveryPanel.create(failedOptions).render();
  assert.equal(failedOptions.statusElement.textContent, "Snapshot list failed.");
  assert.equal(RecoveryPanel.formatDate(Infinity), "Unknown time");
});

test("recovery panel preserves forced snapshot creation", async () => {
  const saved = [];
  const statuses = [];
  const options = recoveryPanelOptions({
    saveRecovery: async value => saved.push(value),
    setStatus: value => statuses.push(value)
  });
  await RecoveryPanel.create(options).createSnapshot();
  assert.deepEqual(saved, [{ payload: "session", summary: { tabCount: 2 }, forceSnapshot: true }]);
  assert.deepEqual(statuses, ["Recovery snapshot created."]);
  assert.equal(options.statusElement.textContent, "No recovery snapshots.");

  let serializationCalls = 0;
  const disabledOptions = recoveryPanelOptions({
    canSerialize: () => false,
    serializeRecovery: () => { serializationCalls++; return "session"; }
  });
  await RecoveryPanel.create(disabledOptions).createSnapshot();
  assert.equal(serializationCalls, 0);
});

test("renderer uses modular preference, recovery, and mode boundaries", () => {
  const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  const rendererIndex = html.indexOf('<script src="./renderer.js"></script>');
  ["editor-preferences.js", "mode-workflow.js", "recovery-panel.js", "recovery-workflow.js"].forEach(file => {
    const marker = `<script src="./modules/renderer/${file}"></script>`;
    assert.ok(html.indexOf(marker) > 0);
    assert.ok(html.indexOf(marker) < rendererIndex);
  });
  assert.match(renderer, /PixelBugEditorPreferences\.create/);
  assert.match(renderer, /PixelBugRecoveryWorkflow\.create/);
  assert.match(renderer, /PixelBugRecoveryPanel\.create/);
  assert.match(renderer, /PixelBugModeWorkflow\.create/);
  assert.match(renderer, /function setModMode\(enabled\) \{\s*if \(enabled\) modeWorkflowController\.beforeEnter\("mod"\);/);
  assert.match(renderer, /function setPlayModeScreen\(enabled\) \{\s*if \(enabled\) modeWorkflowController\.leave\(\["mod", "voxel"\]\);\s*playModeScreen = enabled;\s*if \(enabled\) modeWorkflowController\.leave\(\["print"\]\);/);
  assert.match(renderer, /function setVoxelModeScreen\(enabled\) \{\s*if \(enabled\) modeWorkflowController\.beforeEnter\("voxel"\);/);
  assert.match(renderer, /function setPrintMode\(enabled\) \{\s*if \(enabled\) modeWorkflowController\.beforeEnter\("print"\);/);
  assert.doesNotMatch(renderer, /function loadEditorPreferences\(/);
  assert.doesNotMatch(renderer, /let pendingRecoveryPayload/);
  assert.doesNotMatch(renderer, /function formatRecoveryDate\(/);
  assert.ok(renderer.split("\n").length < 19520);
});
