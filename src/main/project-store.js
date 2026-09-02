"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { writeFileAtomic, writeFilesTransaction } = require("./file-transactions");

const STORE_LIMITS = Object.freeze({
  gallery: Object.freeze({ count: 24, totalBytes: 512 * 1024 * 1024 }),
  snapshots: Object.freeze({ count: 36, totalBytes: 384 * 1024 * 1024 })
});
const MAX_ITEM_BYTES = 128 * 1024 * 1024;
const MAX_THUMBNAIL_CHARS = 256 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const queues = new Map();

function storeKind(value) {
  const kind = String(value || "");
  if (!STORE_LIMITS[kind]) throw new Error("Stored project collection is not valid");
  return kind;
}

function storeDirectory(app, kind) {
  return path.join(app.getPath("userData"), "project-store", storeKind(kind));
}

function itemDirectory(app, kind) {
  return path.join(storeDirectory(app, kind), "items");
}

function indexPath(app, kind) {
  return path.join(storeDirectory(app, kind), "index.json");
}

function itemPath(app, kind, id) {
  return path.join(itemDirectory(app, kind), `${cleanId(id)}.json`);
}

function cleanId(value) {
  const id = String(value || "");
  if (!/^[a-z0-9-]{8,120}$/i.test(id)) throw new Error("Stored project id is not valid");
  return id;
}

function cleanText(value, limit) {
  return String(value || "").slice(0, limit);
}

function cleanThumbnail(value) {
  const thumbnail = cleanText(value, MAX_THUMBNAIL_CHARS);
  return thumbnail.startsWith("data:image/png;base64,") ? thumbnail : "";
}

function safeParse(text) {
  return JSON.parse(String(text || ""), (key, value) => {
    if (DANGEROUS_KEYS.has(key)) throw new Error("Stored project contains an unsafe property");
    return value;
  });
}

function safeStringify(value) {
  return JSON.stringify(value, (key, item) => {
    if (DANGEROUS_KEYS.has(key)) throw new Error("Stored project contains an unsafe property");
    return item;
  });
}

function checksum(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function enqueue(kind, task) {
  const previous = queues.get(kind) || Promise.resolve();
  const next = previous.then(task, task);
  queues.set(kind, next.catch(() => {}));
  return next;
}

function normalizeIndexEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    return {
      id: cleanId(value.id),
      projectId: cleanText(value.projectId, 120),
      name: cleanText(value.name || "Untitled Project", 80),
      savedAt: Math.max(0, Number(value.savedAt) || 0),
      thumbnail: cleanThumbnail(value.thumbnail),
      meta: cleanText(value.meta, 240),
      bytes: Math.max(0, Number(value.bytes) || 0),
      checksum: /^[a-f0-9]{64}$/i.test(String(value.checksum || "")) ? String(value.checksum).toLowerCase() : ""
    };
  } catch (_error) {
    return null;
  }
}

async function readIndex(app, kind) {
  try {
    const parsed = safeParse(await fs.readFile(indexPath(app, kind), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeIndexEntry).filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeIndex(app, kind, entries) {
  await fs.mkdir(storeDirectory(app, kind), { recursive: true });
  await writeFileAtomic(indexPath(app, kind), JSON.stringify(entries, null, 2));
}

async function removeEntryFile(app, kind, entry) {
  try { await fs.rm(itemPath(app, kind, entry.id), { force: true }); } catch (_error) {}
}

async function verifiedEntries(app, kind, entries) {
  const valid = [];
  for (const entry of entries) {
    try {
      const stats = await fs.stat(itemPath(app, kind, entry.id));
      if (stats.isFile() && stats.size <= MAX_ITEM_BYTES) valid.push({ ...entry, bytes: stats.size });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return valid;
}

function partitionEntries(kind, entries, preferredId = "") {
  const limits = STORE_LIMITS[kind];
  const ordered = entries.slice().sort((a, b) => b.savedAt - a.savedAt);
  if (preferredId) ordered.sort((a, b) => (b.id === preferredId ? 1 : 0) - (a.id === preferredId ? 1 : 0) || b.savedAt - a.savedAt);
  const kept = [];
  const removed = [];
  let totalBytes = 0;
  for (const entry of ordered) {
    if (kept.length < limits.count && totalBytes + entry.bytes <= limits.totalBytes) {
      kept.push(entry);
      totalBytes += entry.bytes;
    } else removed.push(entry);
  }
  return { kept: kept.sort((a, b) => b.savedAt - a.savedAt), removed };
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !value.project || typeof value.project !== "object") throw new Error("Stored project data is not valid");
  return {
    projectId: cleanText(value.projectId, 120),
    name: cleanText(value.name || value.project?.name || "Untitled Project", 80),
    savedAt: Math.max(1, Number(value.savedAt) || Date.now()),
    thumbnail: cleanThumbnail(value.thumbnail),
    meta: cleanText(value.meta, 240),
    project: value.project
  };
}

function newId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`;
}

function listStoredProjects(app, kindValue) {
  const kind = storeKind(kindValue);
  return enqueue(kind, async () => {
    const entries = await readIndex(app, kind);
    const valid = await verifiedEntries(app, kind, entries);
    if (valid.length !== entries.length || valid.some((entry, index) => entry.bytes !== entries[index]?.bytes)) await writeIndex(app, kind, valid);
    return valid.sort((a, b) => b.savedAt - a.savedAt);
  });
}

function saveStoredProject(app, kindValue, value) {
  const kind = storeKind(kindValue);
  const record = normalizeRecord(value);
  let payload;
  try { payload = safeStringify(record); } catch (error) { return Promise.reject(new Error(error?.message === "Stored project contains an unsafe property" ? error.message : "Stored project could not be serialized")); }
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > MAX_ITEM_BYTES) return Promise.reject(new Error("Stored project is too large"));
  return enqueue(kind, async () => {
    await fs.mkdir(itemDirectory(app, kind), { recursive: true });
    let entries = await verifiedEntries(app, kind, await readIndex(app, kind));
    const existing = kind === "gallery" && record.projectId ? entries.find(entry => entry.projectId === record.projectId) : null;
    const id = existing?.id || newId();
    const entry = { id, projectId: record.projectId, name: record.name, savedAt: record.savedAt, thumbnail: record.thumbnail, meta: record.meta, bytes, checksum: checksum(payload) };
    entries = [entry, ...entries.filter(item => item.id !== id)];
    const { kept, removed } = partitionEntries(kind, entries, id);
    if (!kept.some(item => item.id === id)) throw new Error("Stored project collection is full");
    await writeFilesTransaction([
      { filePath: itemPath(app, kind, id), payload },
      { filePath: indexPath(app, kind), payload: JSON.stringify(kept, null, 2) }
    ]);
    await Promise.all(removed.filter(item => item.id !== id).map(item => removeEntryFile(app, kind, item)));
    return entry;
  });
}

function loadStoredProject(app, kindValue, idValue) {
  const kind = storeKind(kindValue);
  const id = cleanId(idValue);
  return enqueue(kind, async () => {
    const entries = await readIndex(app, kind);
    const entry = entries.find(item => item.id === id);
    if (!entry) throw new Error("Stored project was not found");
    const filePath = itemPath(app, kind, id);
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size > MAX_ITEM_BYTES) throw new Error("Stored project is too large");
    const payload = await fs.readFile(filePath, "utf8");
    if (entry.checksum && checksum(payload) !== entry.checksum) throw new Error("Stored project integrity check failed");
    const record = safeParse(payload);
    if (!record?.project || typeof record.project !== "object") throw new Error("Stored project data is not valid");
    return { ...entry, project: record.project };
  });
}

function deleteStoredProject(app, kindValue, idValue) {
  const kind = storeKind(kindValue);
  const id = cleanId(idValue);
  return enqueue(kind, async () => {
    const entries = await readIndex(app, kind);
    await writeIndex(app, kind, entries.filter(entry => entry.id !== id));
    await fs.rm(itemPath(app, kind, id), { force: true });
    return true;
  });
}

module.exports = Object.freeze({
  MAX_ITEM_BYTES,
  STORE_LIMITS,
  deleteStoredProject,
  listStoredProjects,
  loadStoredProject,
  saveStoredProject
});
