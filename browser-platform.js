(() => {
  if (window.pixelBug || !/^https?:$/.test(location.protocol)) return;
  const MiB = 1024 * 1024;
  const encoder = new TextEncoder();
  const byteSize = text => new Blob([text]).size;
  const text = (value, limit) => String(value || "").slice(0, limit);
  const thumbnail = value => typeof value === "string" && value.startsWith("data:image/png;base64,") ? value.slice(0, 256 * 1024) : "";
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join("");
  const scope = new URL("./", location.href).pathname;
  let database;
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open(`pixelbug-web:${scope}`, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("metadata");
        request.result.createObjectStore("payloads");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Browser storage is blocked."));
    }).catch(error => { database = null; throw error; });
    return database;
  }
  const result = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function transaction(mode, work) {
    const connection = await db();
    const tx = connection.transaction(["metadata", "payloads"], mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error("Browser storage transaction failed."));
      tx.onerror = () => {};
    });
    try {
      const value = await work(tx.objectStore("metadata"), tx.objectStore("payloads"));
      await done;
      return value;
    } catch (error) {
      try { tx.abort(); } catch (_) {}
      await done.catch(() => {});
      throw error;
    }
  }
  const range = prefix => IDBKeyRange.bound(prefix + ":", prefix + ":\uffff");
  const entries = async (store, prefix) => (await result(store.getAll(range(prefix)))).sort((a,b) => b.savedAt - a.savedAt);
  function prune(meta, payloads, prefix, items, count, limit, preferred) {
    let total = 0, kept = 0;
    items.sort((a,b) => Number(b.id === preferred) - Number(a.id === preferred) || b.savedAt - a.savedAt);
    for (const item of items) {
      if (kept < count && total + item.bytes <= limit) { total += item.bytes; kept++; }
      else { meta.delete(`${prefix}:${item.id}`); payloads.delete(`${prefix}:${item.id}`); }
    }
  }
  const limits = { gallery: [24, 512 * MiB], snapshots: [36, 384 * MiB] };
  function kindCheck(kind) {
    if (!Object.hasOwn(limits, kind)) throw new Error("Invalid project collection.");
    return kind;
  }
  function cleanJson(value) {
    return JSON.stringify(value, (key, item) => {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Invalid project property.");
      return item;
    });
  }
  async function saveStoredProject(kind, value) {
    kindCheck(kind);
    if (!value?.project || typeof value.project !== "object") throw new Error("Invalid project.");
    const payload = cleanJson(value.project), bytes = byteSize(payload);
    if (bytes > 128 * MiB) throw new Error("Stored project is too large.");
    return transaction("readwrite", async (meta, payloads) => {
      const items = await entries(meta, kind);
      const projectId = text(value.projectId, 120);
      const id = (kind === "gallery" && projectId && items.find(item => item.projectId === projectId)?.id) || uid();
      const entry = { id, projectId, name: text(value.name || "Untitled Project", 80), savedAt: Number(value.savedAt) || Date.now(), thumbnail: thumbnail(value.thumbnail), meta: text(value.meta, 240), bytes };
      meta.put(entry, `${kind}:${id}`); payloads.put(payload, `${kind}:${id}`);
      prune(meta, payloads, kind, [entry, ...items.filter(x => x.id !== id)], ...limits[kind], id);
      return entry;
    });
  }
  async function getEntry(prefix, id) {
    return transaction("readonly", async (meta, payloads) => {
      const key = `${prefix}:${id}`;
      const entry = await result(meta.get(key)), payload = await result(payloads.get(key));
      if (!entry || typeof payload !== "string") throw new Error("Stored project was not found.");
      return { entry, payload };
    });
  }
  function removeEntry(prefix, id) {
    return transaction("readwrite", (meta, payloads) => {
      meta.delete(`${prefix}:${id}`); payloads.delete(`${prefix}:${id}`); return true;
    });
  }
  async function saveRecovery(value) {
    const payload = typeof value === "string" ? value : value?.payload;
    if (typeof payload !== "string" || !payload || byteSize(payload) > 96 * MiB) throw new Error("Recovery data is too large or invalid.");
    const bytes = byteSize(payload), savedAt = Date.now();
    const source = value?.summary || {};
    const summary = { name: text(source.name || "Recovery Snapshot", 80), tabCount: Math.max(1, Math.min(Number(source.tabCount) || 1, 12)), dirtyCount: Math.max(0, Math.min(Number(source.dirtyCount) || 0, 12)), dimensions: text(source.dimensions, 40), thumbnail: thumbnail(source.thumbnail) };
    return transaction("readwrite", async (meta, payloads) => {
      const items = await entries(meta, "recovery");
      payloads.put(payload, "current");
      if (value?.forceSnapshot || !items.length || savedAt - items[0].savedAt >= 300000) {
        const id = uid(), entry = { id, savedAt, bytes, summary };
        meta.put(entry, `recovery:${id}`); payloads.put(payload, `recovery:${id}`);
        prune(meta, payloads, "recovery", [entry, ...items], 8, 192 * MiB, id);
      }
      return true;
    });
  }
  const recent = new Map();
  function pick(accept, max) {
    return new Promise(resolve => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = accept; input.hidden = true;
      const finish = value => { input.remove(); resolve(value); };
      input.addEventListener("cancel", () => finish({ ok: false }), { once: true });
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return finish({ ok: false });
        try {
          if (file.size > max) throw new Error("File is too large.");
          const data = await file.text();
          if (accept.includes("pxbuild")) {
            recent.delete(file.name); recent.set(file.name, file);
            while (recent.size > 12 || [...recent.values()].reduce((sum, item) => sum + item.size, 0) > 256 * MiB) recent.delete(recent.keys().next().value);
          }
          finish({ ok: true, filePath: file.name, text: data });
        } catch (error) {
          window.alert(error.message || "File could not be read."); finish({ ok: false });
        }
      }, { once: true });
      document.body.append(input);
      input.click();
    });
  }
  function filename(value) {
    const name = String(value || "");
    if (!name || name.length > 240 || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) || /^[ .]+$|[ .]$/.test(name)) throw new Error("Invalid file name.");
    return name;
  }
  function bytesFor(file) {
    if (typeof file.data !== "string") throw new Error("Invalid export data.");
    if (file.encoding === "base64") {
      if (file.data.length > 358 * MiB) throw new Error("Export is too large.");
      const raw = atob(file.data);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return bytes;
    }
    if (file.encoding && file.encoding !== "utf8") throw new Error("Invalid export encoding.");
    return encoder.encode(file.data);
  }
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const body = [], directory = [];
    let offset = 0, dirSize = 0;
    for (const file of files) {
      const name = encoder.encode(file.name), size = file.bytes.length, crc = crc32(file.bytes);
      const local = new Uint8Array(30), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint16(12, 33, true);
      l.setUint32(14, crc, true); l.setUint32(18, size, true); l.setUint32(22, size, true); l.setUint16(26, name.length, true);
      const central = new Uint8Array(46), c = new DataView(central.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint16(14, 33, true);
      c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      body.push(local, name, file.bytes); directory.push(central, name);
      offset += local.length + name.length + size; dirSize += central.length + name.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, dirSize, true); e.setUint32(16, offset, true);
    return new Blob([...body, ...directory, end], { type: "application/zip" });
  }
  async function saveFile(options) {
    const name = filename(options.defaultPath || "pixel-bug-export");
    const extras = options.extraFiles || [];
    if (!Array.isArray(extras) || extras.length > 16) throw new Error("Invalid companion files.");
    const files = [{ name, bytes: bytesFor(options) }, ...extras.map(file => ({ name: filename(file.filename), bytes: bytesFor(file) }))];
    if (new Set(files.map(file => file.name.toLowerCase())).size !== files.length || files.reduce((sum, file) => sum + file.bytes.length, 0) > 256 * MiB) throw new Error("Invalid or oversized export.");
    const downloadName = extras.length ? name.replace(/\.[^.]+$/, "") + ".zip" : name;
    const blob = extras.length ? zip(files) : new Blob([files[0].bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = downloadName; link.hidden = true;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { ok: true, filePath: downloadName };
  }
  function decodePsdTemplate(data) {
    return new Promise((resolve, reject) => {
      if (data.byteLength > 128 * MiB) return reject(new Error("PSD file is too large."));
      const worker = new Worker("./workers/browser-psd-worker.js");
      const finish = (fn, value) => { clearTimeout(timer); worker.terminate(); fn(value); };
      const timer = setTimeout(() => finish(reject, new Error("PSD decoding timed out.")), 20000);
      worker.onmessage = event => event.data.error ? finish(reject, new Error(event.data.error)) : finish(resolve, event.data);
      worker.onerror = () => finish(reject, new Error("PSD decoding failed."));
      worker.postMessage(data, [data]);
    });
  }
  const theme = matchMedia("(prefers-color-scheme: dark)");
  window.pixelBug = Object.freeze({
    browser: true, saveFile, saveProjectFile: saveFile, decodePsdTemplate,
    openProject: () => pick(".pxbuild,.json", 256 * MiB), openVoxelModel: () => pick(".json", 12 * MiB),
    listRecentProjects: async () => [...recent.keys()].reverse().map(name => ({ name, filePath: name })),
    openRecentProject: async name => { const file = recent.get(name); if (!file) throw new Error("Select the file again."); return { ok: true, filePath: name, text: await file.text() }; },
    bindProjectPath: async () => false, forgetProjectPath: async () => true,
    getSystemTheme: async () => theme.matches ? "dark" : "light",
    onSystemThemeChanged: callback => { const listener = event => callback(event.matches ? "dark" : "light"); theme.addEventListener("change", listener); return () => theme.removeEventListener("change", listener); },
    runModCode: async () => { throw new Error("Mod execution requires the desktop app."); }, resetModRunner: async () => true,
    saveRecovery, loadRecovery: () => transaction("readonly", async (_, payloads) => (await result(payloads.get("current"))) || ""),
    clearRecovery: () => transaction("readwrite", (_, payloads) => { payloads.delete("current"); return true; }),
    listRecoverySnapshots: () => transaction("readonly", meta => entries(meta, "recovery")),
    loadRecoverySnapshot: async id => ({ ok: true, ...await getEntry("recovery", id) }),
    deleteRecoverySnapshot: id => removeEntry("recovery", id),
    listStoredProjects: kind => transaction("readonly", meta => entries(meta, kindCheck(kind))), saveStoredProject,
    loadStoredProject: async (kind, id) => { const { entry, payload } = await getEntry(kindCheck(kind), id); return { ...entry, project: JSON.parse(payload) }; },
    deleteStoredProject: (kind, id) => removeEntry(kindCheck(kind), id),
    requestWindowClose: async () => ({ action: "cancel" }), cancelWindowClose: async () => true, completeWindowClose: async () => false
  });
})();
