"use strict";

(() => {
  const DB_NAME = "pixel-bug-pages";
  const DB_VERSION = 1;
  const MAX_SAVE_BYTES = 256 * 1024 * 1024;
  const MAX_RECOVERY_BYTES = 96 * 1024 * 1024;
  const MAX_RECOVERY_SNAPSHOTS = 8;
  const MAX_RECOVERY_TOTAL_BYTES = 192 * 1024 * 1024;
  const MIN_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
  const MAX_RECENT_PROJECTS = 12;
  const memoryStores = {
    recovery: new Map(),
    snapshots: new Map(),
    recent: new Map()
  };
  const projectHandles = new Map();
  const openedHandles = new Map();
  const modWorkers = new Map();
  let databasePromise = null;
  let recoveryQueue = Promise.resolve();
  let modSequence = 0;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error("Browser storage is unavailable"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("recovery")) database.createObjectStore("recovery", { keyPath: "id" });
        if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots", { keyPath: "id" });
        if (!database.objectStoreNames.contains("recent")) database.createObjectStore("recent", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage could not be opened"));
      request.onblocked = () => reject(new Error("Browser storage is blocked"));
    });
    return databasePromise;
  }

  async function databaseRequest(storeName, mode, action) {
    try {
      const database = await openDatabase();
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let request;
        try {
          request = action(store);
        } catch (error) {
          reject(error);
          return;
        }
        transaction.oncomplete = () => resolve(request?.result);
        transaction.onerror = () => reject(transaction.error || request?.error || new Error("Browser storage failed"));
        transaction.onabort = () => reject(transaction.error || new Error("Browser storage was interrupted"));
      });
    } catch (_error) {
      const store = memoryStores[storeName];
      if (mode === "readonly") return action({
        get: key => ({ result: store.get(key) }),
        getAll: () => ({ result: [...store.values()] })
      })?.result;
      return action({
        put: value => { store.set(value.id, value); return { result: value.id }; },
        delete: key => { store.delete(key); return { result: undefined }; },
        clear: () => { store.clear(); return { result: undefined }; }
      })?.result;
    }
  }

  function getRecord(storeName, key) {
    return databaseRequest(storeName, "readonly", store => store.get(key));
  }

  function getAllRecords(storeName) {
    return databaseRequest(storeName, "readonly", store => store.getAll());
  }

  function putRecord(storeName, value) {
    return databaseRequest(storeName, "readwrite", store => store.put(value));
  }

  function deleteRecord(storeName, key) {
    return databaseRequest(storeName, "readwrite", store => store.delete(key));
  }

  function cleanFilename(value, fallback = "pixel-bug-file") {
    const source = String(value || "").split(/[\\/]/).pop() || fallback;
    const clean = source.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 240);
    return clean || fallback;
  }

  function textBytes(value) {
    return new TextEncoder().encode(String(value || "")).byteLength;
  }

  function base64Bytes(value) {
    const text = String(value || "");
    if (text.length > Math.ceil(MAX_SAVE_BYTES * 4 / 3) + 4) throw new Error("Save payload is too large");
    if (text && (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0)) throw new Error("Invalid base64 payload");
    const decoded = atob(text);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    return bytes;
  }

  function payloadBlob(data, encoding = "utf8", filename = "") {
    const mode = String(encoding || "utf8").toLowerCase();
    let body;
    if (mode === "base64") body = base64Bytes(data);
    else if (typeof data === "string") {
      if (textBytes(data) > MAX_SAVE_BYTES) throw new Error("Save payload is too large");
      body = data;
    } else if (data instanceof ArrayBuffer) body = data;
    else if (ArrayBuffer.isView(data)) body = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    else throw new Error("Save payload must be text or binary data");
    const extension = String(filename).split(".").pop()?.toLowerCase() || "";
    const types = {
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      json: "application/json",
      tmj: "application/json",
      pxbuild: "application/json",
      html: "text/html",
      txt: "text/plain",
      gpl: "text/plain",
      obj: "text/plain",
      mtl: "text/plain",
      wav: "audio/wav",
      glb: "model/gltf-binary",
      stl: "model/stl"
    };
    return new Blob([body], { type: types[extension] || "application/octet-stream" });
  }

  function prepareEntries(options) {
    const filename = cleanFilename(options?.defaultPath, "pixel-bug-file");
    const primary = { filename, blob: payloadBlob(options?.data, options?.encoding, filename), text: typeof options?.data === "string" && String(options?.encoding || "utf8").toLowerCase() !== "base64" ? options.data : "" };
    const extras = Array.isArray(options?.extraFiles) ? options.extraFiles.slice(0, 16).map(extra => {
      const extraName = cleanFilename(extra?.filename, "pixel-bug-extra.txt");
      return { filename: extraName, blob: payloadBlob(extra?.data, extra?.encoding, extraName), text: typeof extra?.data === "string" && String(extra?.encoding || "utf8").toLowerCase() !== "base64" ? extra.data : "" };
    }) : [];
    const total = [primary, ...extras].reduce((sum, entry) => sum + entry.blob.size, 0);
    if (total > MAX_SAVE_BYTES) throw new Error("Combined save payload is too large");
    return [primary, ...extras];
  }

  function pickerTypes(filters) {
    if (!Array.isArray(filters)) return [];
    return filters.slice(0, 12).map(filter => {
      const extensions = Array.isArray(filter?.extensions) ? filter.extensions.map(extension => `.${String(extension).replace(/[^a-z0-9]/gi, "").toLowerCase()}`).filter(extension => extension.length > 1).slice(0, 12) : [];
      if (!extensions.length) return null;
      return { description: String(filter?.name || "File").slice(0, 80), accept: { "application/octet-stream": extensions } };
    }).filter(Boolean);
  }

  async function writeHandle(handle, blob) {
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function isCancel(error) {
    return error?.name === "AbortError";
  }

  async function saveEntries(options, entries) {
    if (entries.length > 1 && typeof window.showDirectoryPicker === "function") {
      try {
        const directory = await window.showDirectoryPicker({ mode: "readwrite" });
        for (const entry of entries) {
          const handle = await directory.getFileHandle(entry.filename, { create: true });
          await writeHandle(handle, entry.blob);
        }
        return { ok: true, filePath: entries[0].filename };
      } catch (error) {
        if (isCancel(error)) return { ok: false };
      }
    }
    if (entries.length === 1 && typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: entries[0].filename, types: pickerTypes(options?.filters), excludeAcceptAllOption: false });
        await writeHandle(handle, entries[0].blob);
        return { ok: true, filePath: handle.name || entries[0].filename, handle };
      } catch (error) {
        if (isCancel(error)) return { ok: false };
      }
    }
    entries.forEach(entry => downloadBlob(entry.blob, entry.filename));
    return { ok: true, filePath: entries[0].filename };
  }

  async function rememberRecentProject(filePath, text) {
    const cleanPath = cleanFilename(filePath, "project.pxbuild");
    if (!/\.pxbuild$/i.test(cleanPath) || typeof text !== "string" || textBytes(text) > MAX_SAVE_BYTES) return;
    const record = {
      id: cleanPath.toLowerCase(),
      filePath: cleanPath,
      name: cleanPath.replace(/\.pxbuild$/i, "").slice(0, 80),
      lastOpened: Date.now(),
      text
    };
    await putRecord("recent", record);
    const records = (await getAllRecords("recent") || []).sort((a, b) => Number(b.lastOpened || 0) - Number(a.lastOpened || 0));
    for (const stale of records.slice(MAX_RECENT_PROJECTS)) await deleteRecord("recent", stale.id);
  }

  async function chooseInputFile(accept) {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.hidden = true;
      const finish = file => {
        input.remove();
        resolve(file || null);
      };
      input.addEventListener("change", () => finish(input.files?.[0]), { once: true });
      input.addEventListener("cancel", () => finish(null), { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  async function openTextFile(settings) {
    let file = null;
    let handle = null;
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const handles = await window.showOpenFilePicker({ multiple: false, types: pickerTypes(settings.filters), excludeAcceptAllOption: false });
        handle = handles?.[0] || null;
        file = handle ? await handle.getFile() : null;
      } catch (error) {
        if (isCancel(error)) return { ok: false };
      }
    }
    if (!file) file = await chooseInputFile(settings.accept);
    if (!file) return { ok: false };
    if (!file.size || file.size > settings.maxBytes) throw new Error("Selected file is too large");
    const text = await file.text();
    if (handle) openedHandles.set(file.name, handle);
    if (settings.remember) await rememberRecentProject(file.name, text);
    return { ok: true, text, filePath: file.name };
  }

  function cleanText(value, limit) {
    return String(value || "").slice(0, limit);
  }

  function cleanSummary(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const thumbnail = cleanText(source.thumbnail, 256 * 1024);
    return {
      name: cleanText(source.name || "Recovery Snapshot", 80),
      tabCount: Math.max(1, Math.min(Number(source.tabCount) || 1, 12)),
      dirtyCount: Math.max(0, Math.min(Number(source.dirtyCount) || 0, 12)),
      dimensions: cleanText(source.dimensions, 40),
      thumbnail: thumbnail.startsWith("data:image/png;base64,") ? thumbnail : ""
    };
  }

  async function checksum(value) {
    const bytes = new TextEncoder().encode(value);
    if (window.crypto?.subtle) {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      return [...digest].map(item => item.toString(16).padStart(2, "0")).join("");
    }
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    return Math.abs(hash >>> 0).toString(16).padStart(8, "0").repeat(8);
  }

  function recoveryTask(task) {
    const next = recoveryQueue.then(task, task);
    recoveryQueue = next.catch(() => {});
    return next;
  }

  async function createSnapshot(payload, summary, snapshots) {
    const savedAt = Date.now();
    const digest = await checksum(payload);
    const random = new Uint32Array(2);
    crypto.getRandomValues(random);
    const id = `${savedAt.toString(36)}-${digest.slice(0, 12)}-${[...random].map(value => value.toString(16)).join("")}`;
    const record = { id, savedAt, checksum: digest, bytes: textBytes(payload), summary, payload };
    await putRecord("snapshots", record);
    const ordered = [record, ...snapshots.filter(item => item.id !== id)].sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    let total = 0;
    const kept = [];
    for (const item of ordered) {
      if (kept.length < MAX_RECOVERY_SNAPSHOTS && total + Number(item.bytes || 0) <= MAX_RECOVERY_TOTAL_BYTES) {
        kept.push(item);
        total += Number(item.bytes || 0);
      } else await deleteRecord("snapshots", item.id);
    }
    return record;
  }

  function cleanColor(value) {
    if (value == null || value === false || value === "") return null;
    const text = String(value);
    if (text.length > 64) throw new Error("Invalid mod color");
    return text;
  }

  function cleanPixels(value, width, height) {
    if (!Array.isArray(value) || value.length !== height) throw new Error("Invalid mod pixels");
    return value.map(row => {
      if (!Array.isArray(row) || row.length !== width) throw new Error("Invalid mod pixels");
      return row.map(cleanColor);
    });
  }

  function cleanModRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid mod request");
    const kind = request.kind === "brush" ? "brush" : request.kind === "effect" ? "effect" : "";
    if (!kind) throw new Error("Invalid mod kind");
    const code = String(request.code || "");
    if (!code.trim() || code.length > 12000) throw new Error("Invalid mod code");
    const permissions = Array.isArray(request.permissions) ? request.permissions.map(item => String(item || "")) : [];
    if (!permissions.includes("canvas.read") || !permissions.includes("pixels.write")) throw new Error("Mod permission denied");
    const input = request.payload;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid mod payload");
    const width = Number(input.app?.width);
    const height = Number(input.app?.height);
    if (!Number.isInteger(width) || width < 1 || width > 512 || !Number.isInteger(height) || height < 1 || height > 512) throw new Error("Invalid mod value");
    const payload = { pixels: cleanPixels(input.pixels, width, height), app: { width, height }, color: cleanColor(input.color) };
    if (kind === "brush") {
      const x = Number(input.x);
      const y = Number(input.y);
      if (!Number.isInteger(x) || x < -512 || x > 1024 || !Number.isInteger(y) || y < -512 || y > 1024) throw new Error("Invalid mod value");
      payload.x = x;
      payload.y = y;
    }
    return { kind, code, payload };
  }

  function cleanBrushResult(value) {
    if (value == null || value === false) return value;
    if (typeof value === "string") return cleanColor(value);
    const source = Array.isArray(value) ? value : [value];
    if (source.length > 4096) throw new Error("Mod returned too many paint marks");
    return source.map(item => {
      if (item == null || item === false || typeof item === "string") return typeof item === "string" ? cleanColor(item) : item;
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid mod paint mark");
      const clean = { color: cleanColor(item.color) };
      if (Number.isFinite(Number(item.x))) clean.x = Number(item.x);
      if (Number.isFinite(Number(item.y))) clean.y = Number(item.y);
      return clean;
    });
  }

  function workerFor(kind) {
    let worker = modWorkers.get(kind);
    if (worker) return worker;
    worker = new Worker("./mod-worker.js");
    modWorkers.set(kind, worker);
    return worker;
  }

  function runModCode(request) {
    const clean = cleanModRequest(request);
    const worker = workerFor(clean.kind);
    const id = `${clean.kind}-${Date.now().toString(36)}-${++modSequence}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        modWorkers.delete(clean.kind);
        reject(new Error("Mod timed out and was stopped"));
      }, 900);
      const receive = event => {
        if (event.data?.id !== id) return;
        clearTimeout(timeout);
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", fail);
        if (event.data.error) {
          reject(new Error(String(event.data.error).slice(0, 500)));
          return;
        }
        try {
          const result = clean.kind === "effect" ? cleanPixels(event.data.result, clean.payload.app.width, clean.payload.app.height) : cleanBrushResult(event.data.result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      const fail = event => {
        clearTimeout(timeout);
        worker.removeEventListener("message", receive);
        worker.removeEventListener("error", fail);
        worker.terminate();
        modWorkers.delete(clean.kind);
        reject(new Error(event?.message || "Mod runner stopped"));
      };
      worker.addEventListener("message", receive);
      worker.addEventListener("error", fail);
      worker.postMessage({ id, kind: clean.kind, code: clean.code, payload: clean.payload });
    });
  }

  const api = Object.freeze({
    async saveFile(options) {
      const entries = prepareEntries(options || {});
      const result = await saveEntries(options || {}, entries);
      if (result.ok && /\.pxbuild$/i.test(result.filePath || "") && entries[0].text) await rememberRecentProject(result.filePath, entries[0].text);
      return { ok: result.ok, filePath: result.filePath };
    },
    async saveProjectFile(options) {
      const entries = prepareEntries(options || {});
      if (entries.length !== 1) throw new Error("Project saves do not support extra files");
      const documentId = String(options?.documentId || "").slice(0, 120);
      let handle = options?.forceDialog === true ? null : projectHandles.get(documentId);
      if (handle) {
        try {
          await writeHandle(handle, entries[0].blob);
          await rememberRecentProject(handle.name || entries[0].filename, entries[0].text);
          return { ok: true, filePath: handle.name || entries[0].filename };
        } catch (_error) {
          projectHandles.delete(documentId);
          handle = null;
        }
      }
      let result;
      if (typeof window.showSaveFilePicker === "function") {
        try {
          handle = await window.showSaveFilePicker({ suggestedName: entries[0].filename, types: pickerTypes(options?.filters), excludeAcceptAllOption: false });
          await writeHandle(handle, entries[0].blob);
          if (documentId) projectHandles.set(documentId, handle);
          result = { ok: true, filePath: handle.name || entries[0].filename };
        } catch (error) {
          if (isCancel(error)) return { ok: false };
        }
      }
      if (!result) {
        downloadBlob(entries[0].blob, entries[0].filename);
        result = { ok: true, filePath: entries[0].filename };
      }
      await rememberRecentProject(result.filePath, entries[0].text);
      return result;
    },
    async bindProjectPath(documentId, filePath) {
      const handle = openedHandles.get(String(filePath || ""));
      if (handle && documentId) projectHandles.set(String(documentId), handle);
      return true;
    },
    async forgetProjectPath(documentId) {
      projectHandles.delete(String(documentId || ""));
      return true;
    },
    async decodePsdTemplate(data) {
      const result = window.PixelBugPsdTemplate.decodePsdTemplate(data);
      return { width: result.width, height: result.height, rgba: result.rgba.buffer };
    },
    openProject() {
      return openTextFile({ accept: ".pxbuild,.json,application/json", filters: [{ name: "Pixel Bug Project", extensions: ["pxbuild", "json"] }], maxBytes: MAX_SAVE_BYTES, remember: true });
    },
    async openRecentProject(filePath) {
      const key = cleanFilename(filePath, "project.pxbuild").toLowerCase();
      const record = await getRecord("recent", key);
      if (!record?.text) throw new Error("Recent project is not available");
      record.lastOpened = Date.now();
      await putRecord("recent", record);
      return { ok: true, text: record.text, filePath: record.filePath };
    },
    async listRecentProjects() {
      const records = await getAllRecords("recent") || [];
      return records.sort((a, b) => Number(b.lastOpened || 0) - Number(a.lastOpened || 0)).slice(0, MAX_RECENT_PROJECTS).map(record => ({ filePath: record.filePath, name: record.name, lastOpened: record.lastOpened }));
    },
    openVoxelModel() {
      return openTextFile({ accept: ".json,application/json", filters: [{ name: "Voxel Model JSON", extensions: ["json"] }], maxBytes: 12 * 1024 * 1024, remember: false });
    },
    getSystemTheme() {
      return Promise.resolve(matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    },
    runModCode,
    resetModRunner(kind) {
      const kinds = kind === "brush" || kind === "effect" ? [kind] : ["brush", "effect"];
      kinds.forEach(item => {
        modWorkers.get(item)?.terminate();
        modWorkers.delete(item);
      });
      return Promise.resolve(true);
    },
    saveRecovery(value) {
      return recoveryTask(async () => {
        const request = typeof value === "string" ? { payload: value, summary: cleanSummary(null), forceSnapshot: false } : { payload: String(value?.payload || ""), summary: cleanSummary(value?.summary), forceSnapshot: value?.forceSnapshot === true };
        if (!request.payload) throw new Error("Recovery data must be text");
        const bytes = textBytes(request.payload);
        if (bytes > MAX_RECOVERY_BYTES) throw new Error("Recovery data is too large");
        await putRecord("recovery", { id: "current", payload: request.payload, savedAt: Date.now(), bytes });
        const snapshots = (await getAllRecords("snapshots") || []).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
        const newest = snapshots[0];
        const digest = await checksum(request.payload);
        const due = !newest || Date.now() - Number(newest.savedAt || 0) >= MIN_SNAPSHOT_INTERVAL_MS;
        if (request.forceSnapshot || (due && newest?.checksum !== digest)) await createSnapshot(request.payload, request.summary, snapshots);
        return true;
      });
    },
    loadRecovery() {
      return recoveryTask(async () => (await getRecord("recovery", "current"))?.payload || "");
    },
    clearRecovery() {
      return recoveryTask(async () => {
        await deleteRecord("recovery", "current");
        return true;
      });
    },
    listRecoverySnapshots() {
      return recoveryTask(async () => (await getAllRecords("snapshots") || []).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).map(record => ({ id: record.id, savedAt: record.savedAt, checksum: record.checksum, bytes: record.bytes, summary: record.summary })));
    },
    loadRecoverySnapshot(snapshotId) {
      return recoveryTask(async () => {
        const record = await getRecord("snapshots", String(snapshotId || ""));
        if (!record?.payload) throw new Error("Recovery snapshot was not found");
        if (record.checksum && await checksum(record.payload) !== record.checksum) throw new Error("Recovery snapshot integrity check failed");
        return { ok: true, payload: record.payload, entry: { id: record.id, savedAt: record.savedAt, checksum: record.checksum, bytes: record.bytes, summary: record.summary } };
      });
    },
    deleteRecoverySnapshot(snapshotId) {
      return recoveryTask(async () => {
        await deleteRecord("snapshots", String(snapshotId || ""));
        return true;
      });
    },
    onSystemThemeChanged(callback) {
      if (typeof callback !== "function") return () => {};
      const media = matchMedia("(prefers-color-scheme: dark)");
      const listener = event => callback(event.matches ? "dark" : "light");
      media.addEventListener?.("change", listener);
      return () => media.removeEventListener?.("change", listener);
    },
    onBrowserZoomBlocked() {
      return () => {};
    }
  });

  window.pixelBug = api;
})();
