(() => {
  "use strict";
  if (window.pixelBug) return;

  document.title = "Pixel Bug - Running v1.5.18";
  document.documentElement.dataset.runtime = "web";

  const DB_NAME = "pixel-bug-web-v1";
  const DB_VERSION = 1;
  const STORE_NAME = "records";
  const MAX_RECENT = 12;
  const MAX_RECOVERY = 8;
  const MAX_GALLERY = 24;
  const MAX_SNAPSHOTS = 36;
  const MAX_MOD_RESULT = 32 * 1024 * 1024;
  const WEB_BLOCKED_MOD_API = /\b(?:self|postMessage|close|import)\b/;
  const boundHandles = new Map();
  const pendingHandles = new Map();
  const themeListeners = new Set();
  const zoomListeners = new Set();
  const modWorkers = new Map();
  let sequence = 0;

  // Browser storage
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage could not be opened"));
    });
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage request failed"));
    });
  }

  async function getRecord(key) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      return await requestValue(transaction.objectStore(STORE_NAME).get(key));
    } finally { db.close(); }
  }

  async function putRecord(record) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      await requestValue(transaction.objectStore(STORE_NAME).put(record));
    } finally { db.close(); }
    return record;
  }

  async function deleteRecord(key) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      await requestValue(transaction.objectStore(STORE_NAME).delete(key));
    } finally { db.close(); }
    return true;
  }

  async function prefixRecords(prefix) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const values = await requestValue(transaction.objectStore(STORE_NAME).getAll());
      return values.filter(item => String(item?.key || "").startsWith(prefix));
    } finally { db.close(); }
  }

  async function prunePrefix(prefix, limit, dateField = "savedAt") {
    const records = (await prefixRecords(prefix)).sort((a, b) => Number(b?.[dateField] || 0) - Number(a?.[dateField] || 0));
    await Promise.all(records.slice(limit).map(record => deleteRecord(record.key)));
    return records.slice(0, limit);
  }

  // File helpers
  function extensionFor(name) {
    const match = String(name || "").match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "bin";
  }

  function mimeFor(name) {
    const ext = extensionFor(name);
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
    if (ext === "svg") return "image/svg+xml";
    if (ext === "json" || ext === "pxbuild" || ext === "pbmod") return "application/json";
    if (ext === "html") return "text/html";
    if (ext === "txt" || ext === "obj" || ext === "mtl" || ext === "stl") return "text/plain";
    return "application/octet-stream";
  }

  function bytesFromData(data, encoding) {
    const text = String(data ?? "");
    if (String(encoding || "utf8").toLowerCase() !== "base64") return new TextEncoder().encode(text);
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function saveTypes(options, fileName) {
    const filters = Array.isArray(options?.filters) ? options.filters : [];
    const types = filters.map(filter => {
      const extensions = Array.isArray(filter?.extensions) ? filter.extensions.filter(Boolean).map(ext => `.${String(ext).replace(/^\./, "")}`) : [];
      return { description: String(filter?.name || "File"), accept: { [mimeFor(extensions[0] || fileName)]: extensions } };
    }).filter(type => Object.values(type.accept)[0].length);
    return types.length ? types : [{ description: "File", accept: { [mimeFor(fileName)]: [`.${extensionFor(fileName)}`] } }];
  }

  async function writeHandle(handle, bytes) {
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  function downloadBytes(fileName, bytes) {
    const blob = new Blob([bytes], { type: mimeFor(fileName) });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = String(fileName || "pixel-bug-file");
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function inputFile(accept) {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.hidden = true;
      document.body.appendChild(input);
      let settled = false;
      const finish = file => {
        if (settled) return;
        settled = true;
        input.remove();
        resolve(file || null);
      };
      input.addEventListener("change", () => finish(input.files?.[0] || null), { once: true });
      window.addEventListener("focus", () => setTimeout(() => finish(input.files?.[0] || null), 300), { once: true });
      input.click();
    });
  }

  async function chooseOpenFile(accept, pickerTypes) {
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: pickerTypes });
        if (!handle) return null;
        return { file: await handle.getFile(), handle };
      } catch (error) {
        if (error?.name === "AbortError") return null;
      }
    }
    const file = await inputFile(accept);
    return file ? { file, handle: null } : null;
  }

  async function rememberRecent(filePath, text, handle = null) {
    const name = String(filePath || "Untitled Project").replace(/\.(pxbuild|json)$/i, "").slice(0, 80);
    const record = { key: `recent:${filePath}`, filePath, name, lastOpened: Date.now(), text: String(text || "") };
    if (handle) record.handle = handle;
    try { await putRecord(record); }
    catch (_error) { delete record.handle; await putRecord(record); }
    await prunePrefix("recent:", MAX_RECENT, "lastOpened");
  }

  async function openProjectFile(voxel = false) {
    const pickerTypes = voxel
      ? [{ description: "Voxel Model JSON", accept: { "application/json": [".json"] } }]
      : [{ description: "Pixel Bug Project", accept: { "application/json": [".pxbuild", ".json"] } }];
    const chosen = await chooseOpenFile(voxel ? ".json,application/json" : ".pxbuild,.json,application/json", pickerTypes);
    if (!chosen) return { ok: false };
    const text = await chosen.file.text();
    const filePath = chosen.file.name;
    if (!voxel) {
      pendingHandles.set(filePath, chosen.handle);
      await rememberRecent(filePath, text, chosen.handle);
    }
    return { ok: true, text, filePath };
  }

  async function saveFile(options = {}) {
    const primaryName = String(options.defaultPath || "pixel-bug-file");
    const entries = [{ filename: primaryName, bytes: bytesFromData(options.data, options.encoding) }, ...(Array.isArray(options.extraFiles) ? options.extraFiles.map(extra => ({ filename: String(extra.filename || "pixel-bug-extra.txt"), bytes: bytesFromData(extra.data, extra.encoding) })) : [])];
    try {
      if (entries.length > 1 && typeof window.showDirectoryPicker === "function") {
        const directory = await window.showDirectoryPicker({ mode: "readwrite" });
        for (const entry of entries) await writeHandle(await directory.getFileHandle(entry.filename, { create: true }), entry.bytes);
        return { ok: true, filePath: entries[0].filename };
      }
      if (entries.length === 1 && typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({ suggestedName: primaryName, types: saveTypes(options, primaryName) });
        await writeHandle(handle, entries[0].bytes);
        return { ok: true, filePath: handle.name || primaryName };
      }
      entries.forEach((entry, index) => setTimeout(() => downloadBytes(entry.filename, entry.bytes), index * 120));
      return { ok: true, filePath: primaryName };
    } catch (error) {
      if (error?.name === "AbortError") return { ok: false };
      throw error;
    }
  }

  async function saveProjectFile(options = {}) {
    const documentId = String(options.documentId || "");
    const fileName = String(options.defaultPath || "pixel-bug-project.pxbuild");
    const bytes = bytesFromData(options.data, options.encoding);
    let handle = options.forceDialog === true ? null : boundHandles.get(documentId);
    try {
      if (!handle && typeof window.showSaveFilePicker === "function") {
        handle = await window.showSaveFilePicker({ suggestedName: fileName, types: saveTypes(options, fileName) });
        boundHandles.set(documentId, handle);
      }
      if (handle) {
        await writeHandle(handle, bytes);
        await rememberRecent(handle.name || fileName, String(options.data || ""), handle);
        return { ok: true, filePath: handle.name || fileName };
      }
      downloadBytes(fileName, bytes);
      await rememberRecent(fileName, String(options.data || ""));
      return { ok: true, filePath: fileName };
    } catch (error) {
      if (error?.name === "AbortError") return { ok: false };
      throw error;
    }
  }

  // Project storage
  async function listStoredProjects(kind) {
    if (!["gallery", "snapshots"].includes(String(kind))) throw new Error("Stored project collection is not valid");
    return (await prefixRecords(`stored:${kind}:`)).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).map(({ key, project, ...record }) => record);
  }

  async function saveStoredProject(kind, value) {
    if (!["gallery", "snapshots"].includes(String(kind))) throw new Error("Stored project collection is not valid");
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const existing = kind === "gallery" && source.projectId ? (await prefixRecords("stored:gallery:")).find(item => item.projectId === source.projectId) : null;
    const id = existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    const payload = JSON.stringify(source.project || {});
    const record = { key: `stored:${kind}:${id}`, id, projectId: String(source.projectId || ""), name: String(source.name || "Untitled Project").slice(0, 80), savedAt: Math.max(0, Number(source.savedAt) || Date.now()), thumbnail: String(source.thumbnail || ""), meta: String(source.meta || ""), bytes: new TextEncoder().encode(payload).byteLength, project: source.project };
    await putRecord(record);
    await prunePrefix(`stored:${kind}:`, kind === "gallery" ? MAX_GALLERY : MAX_SNAPSHOTS);
    const { key, project, ...entry } = record;
    return entry;
  }

  async function loadStoredProject(kind, id) {
    const record = await getRecord(`stored:${kind}:${id}`);
    if (!record?.project) throw new Error("Stored project was not found");
    const { key, ...result } = record;
    return result;
  }

  function deleteStoredProject(kind, id) {
    return deleteRecord(`stored:${kind}:${id}`);
  }

  // Recovery storage
  async function checksumText(text) {
    if (!crypto.subtle) return String(text.length);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function saveRecovery(value) {
    const request = typeof value === "string" ? { payload: value, summary: {}, forceSnapshot: false } : { payload: String(value?.payload || ""), summary: value?.summary || {}, forceSnapshot: value?.forceSnapshot === true };
    if (!request.payload) throw new Error("Recovery data must be text");
    await putRecord({ key: "recovery:current", payload: request.payload, savedAt: Date.now() });
    const snapshots = (await prefixRecords("recovery-snapshot:")).sort((a, b) => b.savedAt - a.savedAt);
    const newest = snapshots[0];
    const digest = await checksumText(request.payload);
    const due = !newest || Date.now() - newest.savedAt >= 5 * 60 * 1000;
    if (request.forceSnapshot || (due && newest?.checksum !== digest)) {
      const savedAt = Date.now();
      const id = `${savedAt.toString(36)}-${digest.slice(0, 12)}-${Math.random().toString(36).slice(2, 8)}`;
      await putRecord({ key: `recovery-snapshot:${id}`, id, savedAt, checksum: digest, bytes: new TextEncoder().encode(request.payload).byteLength, summary: request.summary, payload: request.payload });
      await prunePrefix("recovery-snapshot:", MAX_RECOVERY);
    }
    return true;
  }

  async function loadRecovery() {
    return String((await getRecord("recovery:current"))?.payload || "");
  }

  function clearRecovery() {
    return deleteRecord("recovery:current");
  }

  async function listRecoverySnapshots() {
    return (await prefixRecords("recovery-snapshot:")).sort((a, b) => b.savedAt - a.savedAt).map(({ key, payload, ...entry }) => entry);
  }

  async function loadRecoverySnapshot(id) {
    const record = await getRecord(`recovery-snapshot:${id}`);
    if (!record?.payload) throw new Error("Recovery snapshot was not found");
    const { key, payload, ...entry } = record;
    return { ok: true, payload, entry };
  }

  function deleteRecoverySnapshot(id) {
    return deleteRecord(`recovery-snapshot:${id}`);
  }

  // PSD worker
  function decodePsdTemplate(data) {
    const source = data instanceof ArrayBuffer ? data.slice(0) : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null;
    if (!source) return Promise.reject(new Error("PSD data is invalid"));
    return new Promise((resolve, reject) => {
      const worker = new Worker("./web-psd-worker.js");
      const timer = setTimeout(() => { worker.terminate(); reject(new Error("PSD decoding timed out")); }, 30000);
      worker.onmessage = event => {
        clearTimeout(timer);
        worker.terminate();
        if (!event.data?.ok) reject(new Error(String(event.data?.error || "PSD decoding failed").slice(0, 300)));
        else resolve({ width: Number(event.data.width), height: Number(event.data.height), rgba: event.data.rgba });
      };
      worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error("PSD decoding stopped unexpectedly")); };
      worker.postMessage(source, [source]);
    });
  }

  // Mod runner
  function stopModWorker(kind) {
    const record = modWorkers.get(kind);
    if (!record) return false;
    clearTimeout(record.idleTimer);
    record.pending.forEach(item => { clearTimeout(item.timer); item.reject(new Error("Mod runner reset")); });
    record.pending.clear();
    record.worker.terminate();
    modWorkers.delete(kind);
    return true;
  }

  function modWorker(kind, code) {
    let record = modWorkers.get(kind);
    if (record?.code === code) return record;
    if (record) stopModWorker(kind);
    const worker = new Worker("./web-mod-runner.js");
    record = { worker, code, pending: new Map(), idleTimer: null };
    worker.onmessage = event => {
      const message = event.data;
      const pending = record.pending.get(message?.id);
      if (!pending) return;
      record.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(String(message.error).slice(0, 500)));
      else {
        let size = 0;
        try { size = JSON.stringify(message.result).length; }
        catch (_error) { pending.reject(new Error("Mod returned invalid data")); return; }
        if (size > MAX_MOD_RESULT) pending.reject(new Error("Mod result is too large"));
        else pending.resolve(message.result);
      }
    };
    worker.onerror = () => stopModWorker(kind);
    modWorkers.set(kind, record);
    return record;
  }

  function runModCode(request) {
    const kind = request?.kind === "brush" ? "brush" : request?.kind === "effect" ? "effect" : "";
    if (!kind) return Promise.reject(new Error("Invalid mod kind"));
    const source = window.PixelBugModCodePolicy?.validate ? window.PixelBugModCodePolicy.validate(request.code) : String(request.code || "");
    if (!source.trim()) return Promise.reject(new Error("Invalid mod code"));
    if (WEB_BLOCKED_MOD_API.test(source)) return Promise.reject(new Error("Blocked browser API."));
    const record = modWorker(kind, source);
    clearTimeout(record.idleTimer);
    record.idleTimer = setTimeout(() => stopModWorker(kind), 30000);
    return new Promise((resolve, reject) => {
      const id = `web-${++sequence}`;
      const timer = setTimeout(() => {
        record.pending.delete(id);
        stopModWorker(kind);
        reject(new Error("Mod timed out and was stopped"));
      }, 900);
      record.pending.set(id, { resolve, reject, timer });
      record.worker.postMessage({ id, kind, code: source, payload: request.payload });
    });
  }

  // Theme events
  const themeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  themeQuery?.addEventListener?.("change", event => themeListeners.forEach(callback => callback(event.matches ? "dark" : "light")));

  function onSystemThemeChanged(callback) {
    if (typeof callback !== "function") return () => {};
    themeListeners.add(callback);
    return () => themeListeners.delete(callback);
  }

  function onBrowserZoomBlocked(callback) {
    if (typeof callback !== "function") return () => {};
    zoomListeners.add(callback);
    return () => zoomListeners.delete(callback);
  }

  window.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    let action = "";
    if (["+", "=", "Add"].includes(event.key)) action = "in";
    if (["-", "Subtract"].includes(event.key)) action = "out";
    if (["0"].includes(event.key)) action = "reset";
    if (!action || !zoomListeners.size) return;
    event.preventDefault();
    zoomListeners.forEach(callback => callback(action));
  }, true);

  window.addEventListener("wheel", event => {
    if (!(event.ctrlKey || event.metaKey) || !zoomListeners.size) return;
    event.preventDefault();
    zoomListeners.forEach(callback => callback(event.deltaY < 0 ? "in" : "out"));
  }, { capture: true, passive: false });

  window.addEventListener("beforeunload", event => {
    const dirty = window.PixelBugDocuments?.dirtyNames?.() || [];
    if (!dirty.length) return;
    event.preventDefault();
    event.returnValue = "";
  });

  const api = Object.freeze({
    saveFile,
    saveProjectFile,
    bindProjectPath: async (documentId, filePath) => {
      const handle = pendingHandles.get(String(filePath || ""));
      if (handle) boundHandles.set(String(documentId || ""), handle);
      pendingHandles.delete(String(filePath || ""));
      return true;
    },
    forgetProjectPath: async documentId => { boundHandles.delete(String(documentId || "")); return true; },
    decodePsdTemplate,
    openProject: () => openProjectFile(false),
    openRecentProject: async filePath => {
      const record = await getRecord(`recent:${filePath}`);
      if (!record) throw new Error("Recent project is not available");
      let text = String(record.text || "");
      if (record.handle) {
        try {
          let permission = await record.handle.queryPermission?.({ mode: "read" });
          if (permission !== "granted") permission = await record.handle.requestPermission?.({ mode: "read" });
          if (permission === "granted") text = await (await record.handle.getFile()).text();
        } catch (_error) {}
      }
      await rememberRecent(record.filePath, text, record.handle || null);
      return { ok: true, text, filePath: record.filePath };
    },
    listRecentProjects: async () => (await prefixRecords("recent:")).sort((a, b) => b.lastOpened - a.lastOpened).slice(0, MAX_RECENT).map(({ key, text, handle, ...entry }) => entry),
    openVoxelModel: () => openProjectFile(true),
    getSystemTheme: async () => themeQuery?.matches ? "dark" : "light",
    runModCode,
    resetModRunner: async kind => { if (kind === "brush" || kind === "effect") return stopModWorker(kind); const brush = stopModWorker("brush"), effect = stopModWorker("effect"); return brush || effect; },
    saveRecovery,
    loadRecovery,
    clearRecovery,
    listRecoverySnapshots,
    loadRecoverySnapshot,
    deleteRecoverySnapshot,
    listStoredProjects,
    saveStoredProject,
    loadStoredProject,
    deleteStoredProject,
    requestWindowClose: async request => request?.dirtyNames?.length ? { action: window.confirm("Close with unsaved changes?") ? "discard" : "cancel" } : { action: "close" },
    completeWindowClose: async () => true,
    cancelWindowClose: async () => true,
    signalWindowCloseReady: () => {},
    onSystemThemeChanged,
    onBrowserZoomBlocked,
    onWindowCloseRequested: () => () => {}
  });

  Object.defineProperty(window, "pixelBug", { value: api, configurable: false, enumerable: true, writable: false });
})();
