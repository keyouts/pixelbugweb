const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { writeFileAtomic } = require("./file-transactions");

const MAX_RECOVERY_BYTES = 96 * 1024 * 1024;
const MAX_RECOVERY_SNAPSHOTS = 8;
const MAX_RECOVERY_TOTAL_BYTES = 192 * 1024 * 1024;
const MIN_SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_THUMBNAIL_CHARS = 256 * 1024;
let recoveryQueue = Promise.resolve();

function recoveryDirectory(app) {
  return path.join(app.getPath("userData"), "recovery");
}

function currentPath(app) {
  return path.join(recoveryDirectory(app), "current.json");
}

function legacyPath(app) {
  return path.join(recoveryDirectory(app), "project.json");
}

function indexPath(app) {
  return path.join(recoveryDirectory(app), "snapshots.json");
}

function snapshotDirectory(app) {
  return path.join(recoveryDirectory(app), "snapshots");
}

function checksum(payload) {
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function enqueue(task) {
  const next = recoveryQueue.then(task, task);
  recoveryQueue = next.catch(() => {});
  return next;
}

function cleanText(value, limit) {
  return String(value || "").slice(0, limit);
}

function cleanSummary(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const thumbnail = cleanText(source.thumbnail, MAX_THUMBNAIL_CHARS);
  return {
    name: cleanText(source.name || "Recovery Snapshot", 80),
    tabCount: Math.max(1, Math.min(Number(source.tabCount) || 1, 12)),
    dirtyCount: Math.max(0, Math.min(Number(source.dirtyCount) || 0, 12)),
    dimensions: cleanText(source.dimensions, 40),
    thumbnail: thumbnail.startsWith("data:image/png;base64,") ? thumbnail : ""
  };
}

function normalizeRequest(value) {
  if (typeof value === "string") return { payload: value, summary: cleanSummary(null), forceSnapshot: false };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Recovery data must be text");
  return {
    payload: String(value.payload || ""),
    summary: cleanSummary(value.summary),
    forceSnapshot: value.forceSnapshot === true
  };
}

async function readIndex(app) {
  try {
    const parsed = JSON.parse(await fs.readFile(indexPath(app), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && /^[a-z0-9-]{8,120}$/i.test(String(entry.id || ""))).map(entry => ({
      id: String(entry.id),
      savedAt: Math.max(0, Number(entry.savedAt) || 0),
      checksum: /^[a-f0-9]{64}$/i.test(String(entry.checksum || "")) ? String(entry.checksum).toLowerCase() : "",
      bytes: Math.max(0, Number(entry.bytes) || 0),
      summary: cleanSummary(entry.summary)
    }));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeIndex(app, entries) {
  await writeFileAtomic(indexPath(app), JSON.stringify(entries, null, 2));
}

async function pruneSnapshots(app, entries) {
  const ordered = entries.slice().sort((a, b) => b.savedAt - a.savedAt);
  const kept = [];
  let total = 0;
  for (const entry of ordered) {
    if (kept.length < MAX_RECOVERY_SNAPSHOTS && total + entry.bytes <= MAX_RECOVERY_TOTAL_BYTES) {
      kept.push(entry);
      total += entry.bytes;
      continue;
    }
    await fs.rm(path.join(snapshotDirectory(app), `${entry.id}.json`), { force: true });
  }
  return kept;
}

async function createSnapshot(app, payload, summary, entries) {
  const savedAt = Date.now();
  const digest = checksum(payload);
  const id = `${savedAt.toString(36)}-${digest.slice(0, 12)}-${crypto.randomBytes(4).toString("hex")}`;
  const filePath = path.join(snapshotDirectory(app), `${id}.json`);
  await fs.mkdir(snapshotDirectory(app), { recursive: true });
  await writeFileAtomic(filePath, payload);
  const entry = { id, savedAt, checksum: digest, bytes: Buffer.byteLength(payload, "utf8"), summary };
  const next = await pruneSnapshots(app, [entry, ...entries.filter(item => item.id !== id)]);
  await writeIndex(app, next);
  return entry;
}

function saveRecovery(app, value) {
  let request;
  try {
    request = normalizeRequest(value);
  } catch (error) {
    return Promise.reject(error);
  }
  if (!request.payload) return Promise.reject(new Error("Recovery data must be text"));
  if (Buffer.byteLength(request.payload, "utf8") > MAX_RECOVERY_BYTES) return Promise.reject(new Error("Recovery data is too large"));
  return enqueue(async () => {
    await fs.mkdir(recoveryDirectory(app), { recursive: true });
    await writeFileAtomic(currentPath(app), request.payload);
    const entries = await readIndex(app);
    const newest = entries.slice().sort((a, b) => b.savedAt - a.savedAt)[0];
    const digest = checksum(request.payload);
    const due = !newest || Date.now() - newest.savedAt >= MIN_SNAPSHOT_INTERVAL_MS;
    if (request.forceSnapshot || (due && newest?.checksum !== digest)) await createSnapshot(app, request.payload, request.summary, entries);
    return true;
  });
}

function loadRecovery(app) {
  return enqueue(async () => {
    for (const filePath of [currentPath(app), legacyPath(app)]) {
      try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile() || stats.size > MAX_RECOVERY_BYTES) continue;
        return await fs.readFile(filePath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    return "";
  });
}

function listRecoverySnapshots(app) {
  return enqueue(async () => {
    const entries = await readIndex(app);
    const valid = [];
    for (const entry of entries.sort((a, b) => b.savedAt - a.savedAt)) {
      try {
        const stats = await fs.stat(path.join(snapshotDirectory(app), `${entry.id}.json`));
        if (stats.isFile() && stats.size <= MAX_RECOVERY_BYTES) valid.push({ ...entry, bytes: stats.size });
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
    if (valid.length !== entries.length) await writeIndex(app, valid);
    return valid;
  });
}

function loadRecoverySnapshot(app, snapshotId) {
  const id = String(snapshotId || "");
  if (!/^[a-z0-9-]{8,120}$/i.test(id)) return Promise.reject(new Error("Recovery snapshot is not valid"));
  return enqueue(async () => {
    const entries = await readIndex(app);
    const entry = entries.find(item => item.id === id);
    if (!entry) throw new Error("Recovery snapshot was not found");
    const filePath = path.join(snapshotDirectory(app), `${id}.json`);
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size > MAX_RECOVERY_BYTES) throw new Error("Recovery snapshot is too large");
    const payload = await fs.readFile(filePath, "utf8");
    if (entry.checksum && checksum(payload) !== entry.checksum) throw new Error("Recovery snapshot integrity check failed");
    return { ok: true, payload, entry: { ...entry, bytes: stats.size } };
  });
}

function deleteRecoverySnapshot(app, snapshotId) {
  const id = String(snapshotId || "");
  if (!/^[a-z0-9-]{8,120}$/i.test(id)) return Promise.reject(new Error("Recovery snapshot is not valid"));
  return enqueue(async () => {
    const entries = await readIndex(app);
    await fs.rm(path.join(snapshotDirectory(app), `${id}.json`), { force: true });
    await writeIndex(app, entries.filter(entry => entry.id !== id));
    return true;
  });
}

function clearRecovery(app) {
  return enqueue(async () => {
    await fs.rm(currentPath(app), { force: true });
    await fs.rm(legacyPath(app), { force: true });
    return true;
  });
}

module.exports = {
  MAX_RECOVERY_BYTES,
  MAX_RECOVERY_SNAPSHOTS,
  MAX_RECOVERY_TOTAL_BYTES,
  clearRecovery,
  deleteRecoverySnapshot,
  listRecoverySnapshots,
  loadRecovery,
  loadRecoverySnapshot,
  saveRecovery
};
