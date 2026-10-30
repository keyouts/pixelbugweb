/* Browser services for the original Pixel Bug renderer. No server or account is used. */
(() => {
  "use strict";

  const DB_NAME = "pixelbug-web-v1";
  const STORE = "records";
  const MAX_FILE_BYTES = 256 * 1024 * 1024;
  const MAX_RECOVERY_BYTES = 96 * 1024 * 1024;
  const MAX_SNAPSHOTS = 8;
  const MAX_RECOVERY_TOTAL = 192 * 1024 * 1024;
  const MAX_THUMBNAIL = 256 * 1024;
  const textEncoder = new TextEncoder();
  const projectBindings = new Map();
  const runningMods = new Set();
  let dbPromise;
  let writeChain = Promise.resolve();

  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Browser storage is unavailable"));
      request.onblocked = () => reject(new Error("Browser storage is blocked by another tab"));
    });
    return dbPromise;
  }

  async function read(key, fallback = null) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result === undefined ? fallback : request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function update(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      if (value === undefined) tx.objectStore(STORE).delete(key);
      else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function sequential(task) {
    const next = writeChain.then(task, task);
    writeChain = next.catch(() => {});
    return next;
  }

  function safeFilename(name, fallback = "pixel-bug-export") {
    return (String(name || "").replace(/^.*[\\/]/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 180).trim() || fallback);
  }

  function fileData(data, encoding = "utf8") {
    if (typeof data !== "string") throw new Error("File data must be text");
    if (encoding === "base64") {
      if (data.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 4 || (data.length % 4) !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error("Invalid or oversized file data");
      const binary = atob(data);
      if (binary.length > MAX_FILE_BYTES) throw new Error("File is too large");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    if (encoding !== "utf8") throw new Error("Unsupported file encoding");
    const bytes = textEncoder.encode(data);
    if (bytes.length > MAX_FILE_BYTES) throw new Error("File is too large");
    return bytes;
  }

  function download(filename, data, mime = "application/octet-stream") {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // One download per export: bundle any companion images/metadata into a ZIP.
  const crcTable = Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  function crc32(bytes) {
    let result = -1;
    for (const byte of bytes) result = crcTable[(result ^ byte) & 255] ^ (result >>> 8);
    return (result ^ -1) >>> 0;
  }
  function zipEntries(entries) {
    const parts = [], central = [];
    let offset = 0;
    const enc = textEncoder;
    for (const item of entries) {
      const filename = enc.encode(item.name);
      if (filename.length > 65535 || item.bytes.length > 0xffffffff) throw new Error("Archive entry is too large");
      const checksum = crc32(item.bytes);
      const local = new Uint8Array(30 + filename.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x800, true);
      lv.setUint32(14, checksum, true);
      lv.setUint32(18, item.bytes.length, true);
      lv.setUint32(22, item.bytes.length, true);
      lv.setUint16(26, filename.length, true);
      local.set(filename, 30);
      parts.push(local, item.bytes);
      const header = new Uint8Array(46 + filename.length);
      const cv = new DataView(header.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x800, true);
      cv.setUint32(16, checksum, true);
      cv.setUint32(20, item.bytes.length, true);
      cv.setUint32(24, item.bytes.length, true);
      cv.setUint16(28, filename.length, true);
      cv.setUint32(42, offset, true);
      header.set(filename, 46);
      central.push(header);
      offset += local.length + item.bytes.length;
    }
    const centralLength = central.reduce((n, part) => n + part.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralLength, true);
    view.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }

  async function saveFile(options) {
    const filename = safeFilename(options?.defaultPath);
    const entries = [{ name: filename, bytes: fileData(options?.data, options?.encoding) }];
    for (const extra of options?.extraFiles || []) entries.push({ name: safeFilename(extra.filename), bytes: fileData(extra.data, extra.encoding) });
    if (entries.reduce((n, entry) => n + entry.bytes.length, 0) > MAX_FILE_BYTES) throw new Error("Combined export is too large");
    if (entries.length > 1) {
      download(filename.replace(/\.[^.]+$/, "") + ".zip", zipEntries(entries), "application/zip");
    } else {
      download(filename, entries[0].bytes);
    }
    return { ok: true, filePath: filename };
  }

  async function rememberRecent(filePath, contents) {
    const path = safeFilename(filePath);
    return sequential(async () => {
      const recent = await read("recent", []);
      const next = [{ filePath: path, name: path.replace(/\.(pxbuild|json)$/i, "").slice(0, 80), lastOpened: Date.now() }, ...recent.filter(item => item.filePath !== path)].slice(0, 20);
      await update("recentFile:" + path, contents);
      await update("recent", next);
    });
  }

  async function saveProjectFile(options) {
    const path = safeFilename(options?.defaultPath || "pixel-bug-project.pxbuild");
    const filename = options?.forceDialog ? path : (projectBindings.get(options?.documentId) || path);
    const result = await saveFile({ ...options, defaultPath: filename });
    if (result.ok) {
      projectBindings.set(options?.documentId, filename);
      await rememberRecent(filename, options.data);
    }
    return result;
  }

  function selectFile(extensions, title) {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = extensions;
      input.hidden = true;
      document.body.append(input);
      let settled = false;
      const cleanup = () => { input.remove(); window.removeEventListener("focus", focused); };
      const finish = value => { if (settled) return; settled = true; cleanup(); resolve(value); };
      const focused = () => {
        setTimeout(() => { if (!settled && (!input.files || input.files.length === 0)) finish({ ok: false }); }, 450);
      };
      input.addEventListener("cancel", () => finish({ ok: false }), { once: true });
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return finish({ ok: false });
        if (file.size > MAX_FILE_BYTES) { cleanup(); reject(new Error("Selected file is too large")); return; }
        try {
          const contents = await file.text();
          if (/\.pxbuild$/i.test(file.name)) await rememberRecent(file.name, contents);
          finish({ ok: true, filePath: file.name, text: contents });
        } catch (error) { cleanup(); reject(error); }
      }, { once: true });
      window.addEventListener("focus", focused);
      input.click();
    });
  }

  async function saveRecovery(request) {
    const payload = typeof request === "string" ? request : String(request?.payload || "");
    if (!payload || textEncoder.encode(payload).length > MAX_RECOVERY_BYTES) throw new Error("Recovery file is empty or too large");
    const summary = typeof request === "string" ? {} : (request?.summary || {});
    const force = request?.forceSnapshot === true;
    return sequential(async () => {
      await update("recoveryCurrent", payload);
      let entries = await read("recoveryIndex", []);
      const newest = entries[0];
      const due = !newest || Date.now() - newest.savedAt >= 300000;
      if (force || due) {
        const id = `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`;
        const entry = { id, savedAt: Date.now(), bytes: textEncoder.encode(payload).length, summary };
        entries = [entry, ...entries].sort((a, b) => b.savedAt - a.savedAt);
        await update("recoverySnap:" + id, payload);
        let bytes = 0, kept = [];
        for (const item of entries) {
          if (kept.length < MAX_SNAPSHOTS && bytes + item.bytes <= MAX_RECOVERY_TOTAL) { kept.push(item); bytes += item.bytes; }
          else await update("recoverySnap:" + item.id, undefined);
        }
        await update("recoveryIndex", kept);
      }
      return true;
    });
  }

  async function loadRecoverySnapshot(id) {
    const entries = await read("recoveryIndex", []);
    const entry = entries.find(item => item.id === id);
    if (!entry) throw new Error("Recovery snapshot was not found");
    const payload = await read("recoverySnap:" + id);
    if (typeof payload !== "string") throw new Error("Recovery snapshot data is missing");
    return { ok: true, payload, entry };
  }

  const kindLimits = { gallery: 24, snapshots: 36 };
  function validateKind(kind) {
    if (!Object.hasOwn(kindLimits, kind)) throw new Error("Unknown project collection");
    return kind;
  }
  async function saveStoredProject(kind, value) {
    validateKind(kind);
    if (!value?.project || typeof value.project !== "object") throw new Error("Invalid project record");
    const encoded = JSON.stringify(value);
    if (textEncoder.encode(encoded).length > 128 * 1024 * 1024) throw new Error("Stored project is too large");
    return sequential(async () => {
      let entries = await read("storedIndex:" + kind, []);
      const existing = kind === "gallery" && value.projectId ? entries.find(item => item.projectId === value.projectId) : null;
      const id = existing?.id || `${Date.now().toString(36)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const entry = {
        id, projectId: String(value.projectId || "").slice(0, 120),
        name: String(value.name || value.project.name || "Untitled Project").slice(0, 80),
        savedAt: Number(value.savedAt) || Date.now(), thumbnail: String(value.thumbnail || "").slice(0, MAX_THUMBNAIL),
        meta: String(value.meta || "").slice(0, 240), bytes: textEncoder.encode(encoded).length
      };
      entries = [entry, ...entries.filter(item => item.id !== id)].sort((a, b) => b.savedAt - a.savedAt);
      await update(`storedItem:${kind}:${id}`, JSON.parse(encoded));
      for (const expired of entries.slice(kindLimits[kind])) await update(`storedItem:${kind}:${expired.id}`, undefined);
      entries = entries.slice(0, kindLimits[kind]);
      await update("storedIndex:" + kind, entries);
      return entry;
    });
  }

  async function loadStoredProject(kind, id) {
    validateKind(kind);
    const entry = (await read("storedIndex:" + kind, [])).find(item => item.id === id);
    const record = await read(`storedItem:${kind}:${id}`);
    if (!entry || !record) throw new Error("Stored project was not found");
    return { ...entry, project: record.project };
  }

  // Brush/effect scripts execute in a short-lived worker, not in the app window.
  const EFFECT_HELPERS = `
    const pixels = input.pixels, app = input.app, color = input.color;
    const getPixel = (x,y) => pixels[y] && pixels[y][x] ? pixels[y][x] : null;
    const clamp = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    const toHex = value => clamp(value).toString(16).padStart(2, "0");
    const parsePixel = px => { if (!px || typeof px !== "string") return {r:0,g:0,b:0,a:0}; const value = px.startsWith("#") ? px.slice(1) : px; if (value.length !== 6) return {r:0,g:0,b:0,a:255}; const n = parseInt(value,16); return {r:(n>>16)&255,g:(n>>8)&255,b:n&255,a:255}; };
    const normalizePixel = (next, fallback) => { if (next === undefined) return fallback; if (next === null || next === false || next === "") return null; if (typeof next === "string") return next; if (typeof next === "object") { const alpha = next.a ?? next.alpha ?? 255; if (alpha <= 0) return null; return \`#\${toHex(next.r ?? next.red)}\${toHex(next.g ?? next.green)}\${toHex(next.b ?? next.blue)}\`; } return fallback; };
  `;

  function workerScript(kind, source) {
    let code;
    if (kind === "brush") {
      code = /function\s+brush\s*\(/.test(source)
        ? `${source}\nreturn brush(input.x, input.y, input.color, input.pixels, input.app);`
        : `const {x,y,color,pixels,app}=input;\n${source}`;
    } else {
      const match = source.match(/function\s+effect\s*\(([^)]*)\)/);
      if (!match) code = `const {pixels,app,color}=input;\n${source}`;
      else {
        const first = (match[1].split(",")[0] || "").trim().toLowerCase();
        const mode = ["pixels", "image", "layer"].includes(first) ? "pixels" : ["r", "red"].includes(first) ? "rgba" : "cell";
        const call = mode === "pixels" ? "const next=effect(pixels,app,color); return Array.isArray(next)?next:pixels;"
          : mode === "rgba" ? "return pixels.map((row,y)=>row.map((px,x)=>{const rgba=parsePixel(px);if(!px&&rgba.a===0)return null; const next=effect(rgba.r,rgba.g,rgba.b,rgba.a,x,y,app,color);return normalizePixel(next,px);}));"
          : "return pixels.map((row,y)=>row.map((px,x)=>normalizePixel(effect(x,y,px,getPixel,app,color),px)));";
        code = `${source}\n${EFFECT_HELPERS}\n${call}`;
      }
    }
    // Compiling a fresh Blob script avoids eval/unsafe-eval in the page.
    return `"use strict";\nasync function invoke(input){ "use strict";\n${code}\n}\nself.onmessage=async(event)=>{try{const result=await invoke(event.data); self.postMessage({ok:true,result});}catch(error){self.postMessage({ok:false,error:String(error?.message||error).slice(0,500)});}};`;
  }

  async function runModCode(request) {
    const kind = request?.kind;
    if (kind !== "brush" && kind !== "effect") throw new Error("Invalid mod kind");
    const code = window.PixelBugModCodePolicy.validate(request.code);
    if (!code.trim()) throw new Error("Invalid mod code");
    const permissions = window.PixelBugModPermissions.authorize(request.permissions, ["canvas.read", "pixels.write"]);
    if (!permissions.ok) throw new Error("Mod permission denied: " + permissions.missing.join(", "));
    const data = request.payload;
    const w = Number(data?.app?.width), h = Number(data?.app?.height);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 512 || h > 512 || !Array.isArray(data?.pixels) || data.pixels.length !== h || data.pixels.some(row => !Array.isArray(row) || row.length !== w)) throw new Error("Invalid mod pixels");
    const blobUrl = URL.createObjectURL(new Blob([workerScript(kind, code)], { type: "text/javascript" }));
    let worker;
    try { worker = new Worker(blobUrl); } catch (error) { URL.revokeObjectURL(blobUrl); throw error; }
    runningMods.add(worker);
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timeout); worker.terminate(); runningMods.delete(worker); URL.revokeObjectURL(blobUrl); };
      const timeout = setTimeout(() => { cleanup(); reject(new Error("Mod timed out and was stopped")); }, 900);
      worker.onmessage = event => {
        cleanup();
        const message = event.data;
        if (!message?.ok) return reject(new Error(message?.error || "Mod failed"));
        const result = message.result;
        if (kind === "effect") {
          if (!Array.isArray(result) || result.length !== h || result.some(row => !Array.isArray(row) || row.length !== w || row.some(pixel => pixel != null && typeof pixel !== "string"))) return reject(new Error("Invalid mod pixels"));
        } else if (Array.isArray(result) && result.length > 4096) return reject(new Error("Mod returned too many paint marks"));
        resolve(result);
      };
      worker.onerror = event => { cleanup(); reject(new Error(event.message || "Mod could not be started")); };
      worker.postMessage(data);
    });
  }

  const darkMode = window.matchMedia("(prefers-color-scheme: dark)");
  const api = {
    saveFile,
    saveProjectFile,
    bindProjectPath: async (id, path) => { if (id && path) projectBindings.set(id, safeFilename(path)); return true; },
    forgetProjectPath: async id => { projectBindings.delete(id); return true; },
    decodePsdTemplate: async bytes => window.PixelBugPsdTemplate.decodePsdTemplate(bytes),
    openProject: () => selectFile(".pxbuild,.json", "Open project"),
    openRecentProject: async path => {
      const text = await read("recentFile:" + safeFilename(path));
      if (typeof text !== "string") throw new Error("This recent project is unavailable. Use File → Open.");
      return { ok: true, filePath: safeFilename(path), text };
    },
    listRecentProjects: async () => read("recent", []),
    openVoxelModel: () => selectFile(".json", "Open voxel model"),
    getSystemTheme: async () => darkMode.matches ? "dark" : "light",
    onSystemThemeChanged: callback => { const listener = event => callback(event.matches ? "dark" : "light"); darkMode.addEventListener("change", listener); return () => darkMode.removeEventListener("change", listener); },
    onBrowserZoomBlocked: () => () => {},
    runModCode,
    resetModRunner: async () => { for (const worker of runningMods) worker.terminate(); runningMods.clear(); return true; },
    saveRecovery,
    loadRecovery: () => read("recoveryCurrent", ""),
    clearRecovery: () => sequential(() => update("recoveryCurrent", undefined)),
    listRecoverySnapshots: () => read("recoveryIndex", []),
    loadRecoverySnapshot,
    deleteRecoverySnapshot: id => sequential(async () => {
      await update("recoverySnap:" + id, undefined);
      await update("recoveryIndex", (await read("recoveryIndex", [])).filter(item => item.id !== id));
      return true;
    }),
    listStoredProjects: kind => { validateKind(kind); return read("storedIndex:" + kind, []); },
    saveStoredProject,
    loadStoredProject,
    deleteStoredProject: (kind, id) => { validateKind(kind); return sequential(async () => {
      await update(`storedItem:${kind}:${id}`, undefined);
      await update("storedIndex:" + kind, (await read("storedIndex:" + kind, [])).filter(item => item.id !== id));
      return true;
    }); },
    requestWindowClose: async () => ({ action: "cancel" }),
    completeWindowClose: async () => false,
    cancelWindowClose: async () => true,
    signalWindowCloseReady: () => {},
    onWindowCloseRequested: () => () => {}
  };
  Object.defineProperty(window, "pixelBug", { value: Object.freeze(api), configurable: false, writable: false });
})();
