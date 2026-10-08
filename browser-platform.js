(() => {
  "use strict";

  const DB_NAME = "pixel-bug-pages-v1";
  const DB_VERSION = 1;
  const MAX_TEXT_BYTES = 96 * 1024 * 1024;
  const MAX_PSD_BYTES = 128 * 1024 * 1024;
  const MAX_PSD_PIXELS = 25 * 1024 * 1024;
  const MAX_PSD_DIMENSION = 30000;
  const MAX_RECOVERY_SNAPSHOTS = 8;
  const MIN_RECOVERY_SNAPSHOT_MS = 5 * 60 * 1000;
  const documentHandles = new Map();
  const pendingHandles = new Map();
  let databasePromise = null;
  let modFrame = null;
  let modFrameReady = null;
  let modSequence = 0;
  const modPending = new Map();

  function byteLength(value) {
    return new TextEncoder().encode(String(value || "")).byteLength;
  }

  function cleanName(value, fallback = "pixel-bug-file") {
    const name = String(value || fallback).split(/[\\/]/).pop().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();
    return (name || fallback).slice(0, 180);
  }

  function randomId(prefix = "item") {
    if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return `${prefix}-${Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("recovery")) db.createObjectStore("recovery", { keyPath: "id" });
        if (!db.objectStoreNames.contains("recent")) db.createObjectStore("recent", { keyPath: "filePath" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage could not be opened"));
    });
    return databasePromise;
  }

  async function storeRequest(storeName, mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      try { request = operation(store); }
      catch (error) { reject(error); return; }
      if (request && "onsuccess" in request) {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Browser storage operation failed"));
      } else {
        transaction.oncomplete = () => resolve(request);
        transaction.onerror = () => reject(transaction.error || new Error("Browser storage operation failed"));
      }
    });
  }

  const dbGet = (store, key) => storeRequest(store, "readonly", objectStore => objectStore.get(key));
  const dbGetAll = store => storeRequest(store, "readonly", objectStore => objectStore.getAll());
  const dbPut = (store, value) => storeRequest(store, "readwrite", objectStore => objectStore.put(value));
  const dbDelete = (store, key) => storeRequest(store, "readwrite", objectStore => objectStore.delete(key));

  function safeJson(value) {
    return JSON.stringify(value, (key, item) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error("Stored project contains an unsafe property");
      return item;
    });
  }

  function mimeForName(filename) {
    const ext = String(filename || "").split(".").pop().toLowerCase();
    return ({
      png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      json: "application/json", pxbuild: "application/json", txt: "text/plain", obj: "text/plain",
      mtl: "text/plain", glb: "model/gltf-binary", stl: "model/stl", wav: "audio/wav",
      mp3: "audio/mpeg", ogg: "audio/ogg", zip: "application/zip"
    })[ext] || "application/octet-stream";
  }

  function bytesFromBase64(value) {
    const binary = atob(String(value || ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function blobFromRequest(data, encoding, filename) {
    const payload = encoding === "base64" ? bytesFromBase64(data) : String(data || "");
    return new Blob([payload], { type: mimeForName(filename) });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = cleanName(filename);
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function pickerTypes(filters) {
    if (!Array.isArray(filters) || !filters.length) return undefined;
    return filters.map(filter => {
      const extensions = (filter.extensions || []).map(ext => `.${String(ext).replace(/[^a-z0-9]/gi, "")}`).filter(ext => ext.length > 1);
      if (!extensions.length) return null;
      const accept = {};
      for (const extension of extensions) {
        const mime = mimeForName(`file${extension}`);
        if (!accept[mime]) accept[mime] = [];
        accept[mime].push(extension);
      }
      return { description: String(filter.name || "File").slice(0, 80), accept };
    }).filter(Boolean);
  }

  async function writeHandle(handle, blob) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  async function rememberRecent(handle) {
    if (!handle || handle.kind !== "file") return;
    const filePath = cleanName(handle.name, "project.pxbuild");
    try {
      await dbPut("recent", { filePath, name: filePath.replace(/\.(pxbuild|json)$/i, ""), lastOpenedAt: Date.now(), handle });
    } catch (_error) {}
  }

  async function saveFile(options = {}) {
    const filename = cleanName(options.defaultPath || "pixel-bug-export");
    const blob = blobFromRequest(options.data, options.encoding, filename);
    const extras = Array.isArray(options.extraFiles) ? options.extraFiles.slice(0, 16) : [];
    if (!extras.length && typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: pickerTypes(options.filters) });
        await writeHandle(handle, blob);
        return { ok: true, filePath: handle.name };
      } catch (error) {
        if (error?.name === "AbortError") return { ok: false };
      }
    }
    downloadBlob(blob, filename);
    for (const extra of extras) {
      const extraName = cleanName(extra.filename || "pixel-bug-extra");
      downloadBlob(blobFromRequest(extra.data, extra.encoding, extraName), extraName);
    }
    return { ok: true, filePath: filename };
  }

  async function saveProjectFile(options = {}) {
    const documentId = String(options.documentId || "");
    const filename = cleanName(options.defaultPath || "pixel-bug-project.pxbuild", "pixel-bug-project.pxbuild");
    const blob = blobFromRequest(options.data, options.encoding, filename);
    let handle = options.forceDialog === true ? null : documentHandles.get(documentId);
    if (handle) {
      try {
        const permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission === "granted" || await handle.requestPermission({ mode: "readwrite" }) === "granted") {
          await writeHandle(handle, blob);
          await rememberRecent(handle);
          return { ok: true, filePath: handle.name };
        }
      } catch (_error) { handle = null; }
    }
    if (typeof window.showSaveFilePicker === "function") {
      try {
        handle = await window.showSaveFilePicker({ suggestedName: filename, types: pickerTypes(options.filters) });
        await writeHandle(handle, blob);
        if (documentId) documentHandles.set(documentId, handle);
        await rememberRecent(handle);
        return { ok: true, filePath: handle.name };
      } catch (error) {
        if (error?.name === "AbortError") return { ok: false };
      }
    }
    downloadBlob(blob, filename);
    return { ok: true, filePath: filename };
  }

  function chooseFile(accept) {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.hidden = true;
      input.addEventListener("change", () => {
        const file = input.files?.[0] || null;
        input.remove();
        resolve(file);
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  async function openTextFile(settings = {}) {
    const maxBytes = Math.min(Number(settings.maxBytes) || MAX_TEXT_BYTES, MAX_TEXT_BYTES);
    const accept = String(settings.accept || ".pxbuild,.json");
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: pickerTypes(settings.filters) });
        const file = await handle.getFile();
        if (file.size > maxBytes) throw new Error("Selected file is too large");
        const text = await file.text();
        const filePath = cleanName(file.name);
        pendingHandles.set(filePath, handle);
        if (/\.(pxbuild|json)$/i.test(filePath)) await rememberRecent(handle);
        return { ok: true, text, filePath };
      } catch (error) {
        if (error?.name === "AbortError") return { ok: false };
        throw error;
      }
    }
    const file = await chooseFile(accept);
    if (!file) return { ok: false };
    if (file.size > maxBytes) throw new Error("Selected file is too large");
    return { ok: true, text: await file.text(), filePath: cleanName(file.name) };
  }

  async function bindProjectPath(documentId, filePath) {
    const key = cleanName(filePath || "");
    let handle = pendingHandles.get(key);
    if (!handle) {
      try { handle = (await dbGet("recent", key))?.handle || null; } catch (_error) {}
    }
    if (handle) documentHandles.set(String(documentId || ""), handle);
    pendingHandles.delete(key);
    return Boolean(handle);
  }

  function forgetProjectPath(documentId) {
    documentHandles.delete(String(documentId || ""));
    return Promise.resolve(true);
  }

  async function listRecentProjects() {
    try {
      const entries = await dbGetAll("recent");
      return entries.sort((a, b) => Number(b.lastOpenedAt || 0) - Number(a.lastOpenedAt || 0)).slice(0, 12).map(item => ({
        name: String(item.name || item.filePath || "Project").slice(0, 80),
        filePath: String(item.filePath || "").slice(0, 180),
        lastOpenedAt: Number(item.lastOpenedAt || 0)
      }));
    } catch (_error) { return []; }
  }

  async function openRecentProject(filePath) {
    const record = await dbGet("recent", cleanName(filePath || ""));
    if (!record?.handle) throw new Error("This recent project is no longer available. Use Open Project instead.");
    let permission = "prompt";
    try { permission = await record.handle.queryPermission({ mode: "read" }); } catch (_error) {}
    if (permission !== "granted") permission = await record.handle.requestPermission({ mode: "read" });
    if (permission !== "granted") throw new Error("Permission to open this project was not granted.");
    const file = await record.handle.getFile();
    if (file.size > MAX_TEXT_BYTES) throw new Error("Selected file is too large");
    pendingHandles.set(record.filePath, record.handle);
    record.lastOpenedAt = Date.now();
    await dbPut("recent", record);
    return { ok: true, text: await file.text(), filePath: record.filePath };
  }

  async function digestText(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, "0")).join("");
  }

  function cleanRecoverySummary(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const thumbnail = String(source.thumbnail || "").slice(0, 256 * 1024);
    return {
      name: String(source.name || "Recovery Snapshot").slice(0, 80),
      tabCount: Math.max(1, Math.min(Number(source.tabCount) || 1, 12)),
      dirtyCount: Math.max(0, Math.min(Number(source.dirtyCount) || 0, 12)),
      dimensions: String(source.dimensions || "").slice(0, 40),
      thumbnail: thumbnail.startsWith("data:image/png;base64,") ? thumbnail : ""
    };
  }

  async function saveRecovery(value) {
    const request = typeof value === "string" ? { payload: value, summary: null, forceSnapshot: false } : value || {};
    const payload = String(request.payload || "");
    if (!payload) throw new Error("Recovery data must be text");
    const bytes = byteLength(payload);
    if (bytes > MAX_TEXT_BYTES) throw new Error("Recovery data is too large");
    await dbPut("kv", { key: "recovery-current", payload, savedAt: Date.now() });
    const snapshots = (await dbGetAll("recovery")).sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    const newest = snapshots[0];
    const checksum = await digestText(payload);
    const due = !newest || Date.now() - Number(newest.savedAt || 0) >= MIN_RECOVERY_SNAPSHOT_MS;
    if (request.forceSnapshot === true || (due && newest?.checksum !== checksum)) {
      const entry = {
        id: randomId("recovery"), savedAt: Date.now(), checksum, bytes,
        summary: cleanRecoverySummary(request.summary), payload
      };
      await dbPut("recovery", entry);
      const all = [entry, ...snapshots.filter(item => item.id !== entry.id)].sort((a, b) => b.savedAt - a.savedAt);
      for (const stale of all.slice(MAX_RECOVERY_SNAPSHOTS)) await dbDelete("recovery", stale.id);
    }
    return true;
  }

  async function loadRecovery() {
    return String((await dbGet("kv", "recovery-current"))?.payload || "");
  }

  async function clearRecovery() {
    await dbDelete("kv", "recovery-current");
    return true;
  }

  async function listRecoverySnapshots() {
    return (await dbGetAll("recovery")).sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_RECOVERY_SNAPSHOTS).map(({ payload: _payload, ...entry }) => entry);
  }

  async function loadRecoverySnapshot(id) {
    const record = await dbGet("recovery", String(id || ""));
    if (!record) throw new Error("Recovery snapshot was not found");
    const { payload, ...entry } = record;
    return { ok: true, payload, entry };
  }

  async function deleteRecoverySnapshot(id) {
    await dbDelete("recovery", String(id || ""));
    return true;
  }

  const STORE_LIMITS = Object.freeze({ gallery: 24, snapshots: 36 });

  async function listStoredProjects(kind) {
    const type = kind === "gallery" || kind === "snapshots" ? kind : "";
    if (!type) throw new Error("Stored project collection is not valid");
    const records = (await dbGetAll("projects")).filter(item => item.kind === type).sort((a, b) => b.savedAt - a.savedAt);
    return records.map(({ project: _project, kind: _kind, ...entry }) => entry);
  }

  async function saveStoredProject(kind, value) {
    const type = kind === "gallery" || kind === "snapshots" ? kind : "";
    if (!type) throw new Error("Stored project collection is not valid");
    if (!value?.project || typeof value.project !== "object") throw new Error("Stored project data is not valid");
    const payload = safeJson(value.project);
    if (byteLength(payload) > 128 * 1024 * 1024) throw new Error("Stored project is too large");
    let records = (await dbGetAll("projects")).filter(item => item.kind === type).sort((a, b) => b.savedAt - a.savedAt);
    const existing = type === "gallery" && value.projectId ? records.find(item => item.projectId === String(value.projectId)) : null;
    const id = existing?.id || randomId(type);
    const record = {
      id, kind: type,
      projectId: String(value.projectId || "").slice(0, 120),
      name: String(value.name || value.project.name || "Untitled Project").slice(0, 80),
      savedAt: Math.max(1, Number(value.savedAt) || Date.now()),
      thumbnail: String(value.thumbnail || "").slice(0, 256 * 1024),
      meta: String(value.meta || "").slice(0, 240),
      bytes: byteLength(payload),
      project: JSON.parse(payload)
    };
    await dbPut("projects", record);
    records = [record, ...records.filter(item => item.id !== id)].sort((a, b) => b.savedAt - a.savedAt);
    for (const stale of records.slice(STORE_LIMITS[type])) await dbDelete("projects", stale.id);
    const { project: _project, kind: _kind, ...entry } = record;
    return entry;
  }

  async function loadStoredProject(kind, id) {
    const record = await dbGet("projects", String(id || ""));
    if (!record || record.kind !== kind) throw new Error("Stored project was not found");
    const { kind: _kind, ...result } = record;
    return result;
  }

  async function deleteStoredProject(kind, id) {
    const record = await dbGet("projects", String(id || ""));
    if (record?.kind === kind) await dbDelete("projects", record.id);
    return true;
  }

  function asBytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw new Error("Invalid PSD data");
  }

  function readUint16(view, offset) {
    if (offset < 0 || offset + 2 > view.byteLength) throw new Error("PSD data is incomplete");
    return view.getUint16(offset, false);
  }

  function readUint32(view, offset) {
    if (offset < 0 || offset + 4 > view.byteLength) throw new Error("PSD data is incomplete");
    return view.getUint32(offset, false);
  }

  function skipSection(view, offset) {
    const length = readUint32(view, offset);
    const next = offset + 4 + length;
    if (!Number.isSafeInteger(next) || next > view.byteLength) throw new Error("PSD section is incomplete");
    return next;
  }

  function decodePackBitsRow(source, start, length, target, targetOffset, width) {
    const end = start + length;
    const targetEnd = targetOffset + width;
    let sourceOffset = start;
    let outputOffset = targetOffset;
    if (start < 0 || length < 0 || end > source.length) throw new Error("PSD row is incomplete");
    while (sourceOffset < end) {
      const marker = source[sourceOffset++];
      const signedMarker = marker > 127 ? marker - 256 : marker;
      if (signedMarker >= 0) {
        const count = signedMarker + 1;
        if (sourceOffset + count > end || outputOffset + count > targetEnd) throw new Error("PSD row is invalid");
        target.set(source.subarray(sourceOffset, sourceOffset + count), outputOffset);
        sourceOffset += count;
        outputOffset += count;
      } else if (signedMarker >= -127) {
        const count = 1 - signedMarker;
        if (sourceOffset >= end || outputOffset + count > targetEnd) throw new Error("PSD row is invalid");
        target.fill(source[sourceOffset++], outputOffset, outputOffset + count);
        outputOffset += count;
      }
    }
    if (outputOffset !== targetEnd) throw new Error("PSD row size is invalid");
  }

  function decodePlanes(bytes, view, offset, compression, width, height, channels, requiredChannels) {
    const pixelCount = width * height;
    const planes = Array.from({ length: requiredChannels }, () => new Uint8Array(pixelCount));
    if (compression === 0) {
      const totalBytes = pixelCount * channels;
      if (!Number.isSafeInteger(totalBytes) || offset + totalBytes > bytes.length) throw new Error("PSD image data is incomplete");
      for (let channel = 0; channel < channels; channel++) {
        if (channel < requiredChannels) planes[channel].set(bytes.subarray(offset, offset + pixelCount));
        offset += pixelCount;
      }
      return planes;
    }
    if (compression !== 1) throw new Error("This PSD compression is not supported. Save the file with RLE compression and try again.");
    const rowCount = channels * height;
    const tableBytes = rowCount * 2;
    if (!Number.isSafeInteger(tableBytes) || offset + tableBytes > bytes.length) throw new Error("PSD row table is incomplete");
    const rowLengths = new Uint32Array(rowCount);
    for (let row = 0; row < rowCount; row++) rowLengths[row] = readUint16(view, offset + row * 2);
    offset += tableBytes;
    for (let channel = 0; channel < channels; channel++) {
      for (let row = 0; row < height; row++) {
        const rowLength = rowLengths[channel * height + row];
        if (channel < requiredChannels) decodePackBitsRow(bytes, offset, rowLength, planes[channel], row * width, width);
        else if (offset + rowLength > bytes.length) throw new Error("PSD row is incomplete");
        offset += rowLength;
      }
    }
    return planes;
  }

  function convertPlanes(planes, width, height, colorMode, colorChannels) {
    const pixelCount = width * height;
    const rgba = new Uint8Array(pixelCount * 4);
    const alpha = planes[colorChannels];
    for (let index = 0, output = 0; index < pixelCount; index++, output += 4) {
      if (colorMode === 1) {
        const value = planes[0][index];
        rgba[output] = value; rgba[output + 1] = value; rgba[output + 2] = value;
      } else if (colorMode === 3) {
        rgba[output] = planes[0][index]; rgba[output + 1] = planes[1][index]; rgba[output + 2] = planes[2][index];
      } else {
        rgba[output] = Math.round(planes[0][index] * planes[3][index] / 255);
        rgba[output + 1] = Math.round(planes[1][index] * planes[3][index] / 255);
        rgba[output + 2] = Math.round(planes[2][index] * planes[3][index] / 255);
      }
      rgba[output + 3] = alpha ? alpha[index] : 255;
    }
    return rgba;
  }

  function decodePsdTemplate(value) {
    const bytes = asBytes(value);
    if (!bytes.length || bytes.length > MAX_PSD_BYTES) throw new Error("PSD file is too large");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "8BPS") throw new Error("This file is not a valid PSD");
    if (readUint16(view, 4) !== 1) throw new Error("PSB files are not supported. Use a PSD file instead.");
    const channels = readUint16(view, 12);
    const height = readUint32(view, 14);
    const width = readUint32(view, 18);
    const depth = readUint16(view, 22);
    const colorMode = readUint16(view, 24);
    const colorChannels = colorMode === 1 ? 1 : colorMode === 3 ? 3 : colorMode === 4 ? 4 : 0;
    if (!colorChannels) throw new Error("Only grayscale, RGB, and CMYK PSD templates are supported");
    if (depth !== 8) throw new Error("Only 8-bit PSD templates are supported");
    if (channels < colorChannels || channels > 56) throw new Error("PSD channel data is invalid");
    if (!width || !height || width > MAX_PSD_DIMENSION || height > MAX_PSD_DIMENSION) throw new Error("PSD dimensions are not supported");
    const pixelCount = width * height;
    if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_PSD_PIXELS) throw new Error("PSD canvas is too large");
    let offset = 26;
    offset = skipSection(view, offset);
    offset = skipSection(view, offset);
    offset = skipSection(view, offset);
    const compression = readUint16(view, offset);
    offset += 2;
    const requiredChannels = colorChannels + (channels > colorChannels ? 1 : 0);
    const planes = decodePlanes(bytes, view, offset, compression, width, height, channels, requiredChannels);
    return { width, height, rgba: convertPlanes(planes, width, height, colorMode, colorChannels) };
  }

  function cleanModColor(value) {
    if (value == null || value === false || value === "") return null;
    const text = String(value);
    if (text.length > 64) throw new Error("Invalid mod color");
    return text;
  }

  function finiteInteger(value, min, max) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error("Invalid mod value");
    return number;
  }

  function cleanModPixels(value, width, height) {
    if (!Array.isArray(value) || value.length !== height) throw new Error("Invalid mod pixels");
    return value.map(row => {
      if (!Array.isArray(row) || row.length !== width) throw new Error("Invalid mod pixels");
      return row.map(cleanModColor);
    });
  }

  function cleanModRequest(request) {
    if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid mod request");
    const kind = request.kind === "brush" || request.kind === "effect" ? request.kind : "";
    if (!kind) throw new Error("Invalid mod kind");
    const code = window.PixelBugModCodePolicy?.validate?.(request.code) ?? String(request.code || "");
    if (!code.trim()) throw new Error("Invalid mod code");
    const permissions = window.PixelBugModPermissions?.sanitize?.(request.permissions) || [];
    const authorization = window.PixelBugModPermissions?.authorize?.(permissions, ["canvas.read", "pixels.write"]);
    if (authorization && !authorization.ok) throw new Error(`Mod permission denied: ${authorization.missing.join(", ")}`);
    const input = request.payload;
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid mod payload");
    const width = finiteInteger(input.app?.width, 1, 512);
    const height = finiteInteger(input.app?.height, 1, 512);
    const payload = { pixels: cleanModPixels(input.pixels, width, height), app: { width, height }, color: cleanModColor(input.color) };
    if (kind === "brush") {
      payload.x = finiteInteger(input.x, -512, 1024);
      payload.y = finiteInteger(input.y, -512, 1024);
    }
    return { kind, code, payload };
  }

  function cleanModResult(kind, value, payload) {
    if (kind === "effect") return cleanModPixels(value, payload.app.width, payload.app.height);
    if (value == null || value === false) return value;
    if (typeof value === "string") return cleanModColor(value);
    const source = Array.isArray(value) ? value : [value];
    if (source.length > 4096) throw new Error("Mod returned too many paint marks");
    return source.map(item => {
      if (item == null || item === false || typeof item === "string") return typeof item === "string" ? cleanModColor(item) : item;
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid mod paint mark");
      const clean = { color: cleanModColor(item.color) };
      if (Number.isFinite(Number(item.x))) clean.x = Number(item.x);
      if (Number.isFinite(Number(item.y))) clean.y = Number(item.y);
      return clean;
    });
  }

  function destroyModFrame(error) {
    if (modFrame) modFrame.remove();
    modFrame = null;
    modFrameReady = null;
    for (const pending of modPending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error || new Error("Mod runner reset"));
    }
    modPending.clear();
  }

  function ensureModFrame() {
    if (modFrameReady) return modFrameReady;
    modFrameReady = new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      frame.tabIndex = -1;
      frame.setAttribute("aria-hidden", "true");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.src = "./browser-mod-runner.html";
      const timeout = setTimeout(() => { destroyModFrame(new Error("Mod runner could not start")); reject(new Error("Mod runner could not start")); }, 3000);
      frame.addEventListener("load", () => { clearTimeout(timeout); resolve(frame); }, { once: true });
      frame.addEventListener("error", () => { clearTimeout(timeout); destroyModFrame(new Error("Mod runner could not start")); reject(new Error("Mod runner could not start")); }, { once: true });
      modFrame = frame;
      document.body.appendChild(frame);
    });
    return modFrameReady;
  }

  window.addEventListener("message", event => {
    if (!modFrame || event.source !== modFrame.contentWindow) return;
    const message = event.data;
    if (!message || message.type !== "pixelbug-mod-result") return;
    const pending = modPending.get(message.id);
    if (!pending || message.token !== pending.token) return;
    modPending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(String(message.error).slice(0, 500)));
    else {
      try { pending.resolve(cleanModResult(pending.kind, message.result, pending.payload)); }
      catch (error) { pending.reject(error); }
    }
  });

  async function runModCode(request) {
    const input = cleanModRequest(request);
    const frame = await ensureModFrame();
    const id = `mod-${++modSequence}`;
    const token = randomId("token");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        destroyModFrame(new Error("Mod timed out and was stopped"));
      }, 900);
      modPending.set(id, { resolve, reject, timer, token, kind: input.kind, payload: input.payload });
      frame.contentWindow.postMessage({ type: "pixelbug-mod-run", id, token, kind: input.kind, code: input.code, payload: input.payload }, "*");
    });
  }

  function resetModRunner() {
    destroyModFrame(new Error("Mod runner reset"));
    return Promise.resolve(true);
  }

  const themeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");

  const api = Object.freeze({
    saveFile,
    saveProjectFile,
    bindProjectPath,
    forgetProjectPath,
    decodePsdTemplate: async data => decodePsdTemplate(data),
    openProject: () => openTextFile({ accept: ".pxbuild,.json", filters: [{ name: "Pixel Bug Project", extensions: ["pxbuild", "json"] }] }),
    openRecentProject,
    listRecentProjects,
    openVoxelModel: () => openTextFile({ accept: ".json", maxBytes: 12 * 1024 * 1024, filters: [{ name: "Voxel Model JSON", extensions: ["json"] }] }),
    getSystemTheme: async () => themeQuery?.matches ? "dark" : "light",
    onSystemThemeChanged: callback => {
      if (typeof callback !== "function" || !themeQuery) return () => {};
      const listener = event => callback(event.matches ? "dark" : "light");
      themeQuery.addEventListener?.("change", listener);
      return () => themeQuery.removeEventListener?.("change", listener);
    },
    onBrowserZoomBlocked: () => () => {},
    runModCode,
    resetModRunner,
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
    requestWindowClose: async () => ({ action: "cancel" }),
    completeWindowClose: async () => true,
    cancelWindowClose: async () => true,
    signalWindowCloseReady: () => true,
    onWindowCloseRequested: () => () => {}
  });

  Object.defineProperty(window, "pixelBug", { value: api, writable: false, configurable: false });
  Object.defineProperty(window, "PixelBugPlatform", { value: "github-pages", writable: false, configurable: false });
})();
