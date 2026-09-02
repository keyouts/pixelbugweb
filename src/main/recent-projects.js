const fs = require("fs/promises");
const path = require("path");
const { writeFileAtomic } = require("./file-transactions");

const MAX_RECENT_PROJECTS = 12;
const STORE_NAME = "recent-projects.json";

// Path checks
function cleanProjectPath(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  if (!/\.pxbuild$/i.test(resolved)) throw new Error("Recent project path is not supported");
  return resolved;
}

function storePath(app) {
  return path.join(app.getPath("userData"), STORE_NAME);
}

// Store reads
async function readRecentProjects(app) {
  try {
    const source = JSON.parse(await fs.readFile(storePath(app), "utf8"));
    if (!Array.isArray(source)) return [];
    const seen = new Set();
    return source.filter(item => {
      if (!item || typeof item !== "object") return false;
      try {
        const filePath = cleanProjectPath(item.filePath);
        const key = process.platform === "win32" ? filePath.toLowerCase() : filePath;
        if (seen.has(key)) return false;
        seen.add(key);
        item.filePath = filePath;
        item.name = path.basename(filePath, path.extname(filePath)).slice(0, 80);
        item.lastOpened = Math.max(0, Number(item.lastOpened) || 0);
        return true;
      } catch (_error) {
        return false;
      }
    }).slice(0, MAX_RECENT_PROJECTS);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    return [];
  }
}

// Store writes
async function writeRecentProjects(app, entries) {
  const target = storePath(app);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, JSON.stringify(entries.slice(0, MAX_RECENT_PROJECTS), null, 2));
}

async function rememberRecentProject(app, filePath) {
  const cleanPath = cleanProjectPath(filePath);
  const current = await readRecentProjects(app);
  const identity = process.platform === "win32" ? cleanPath.toLowerCase() : cleanPath;
  const next = [{ filePath: cleanPath, name: path.basename(cleanPath, path.extname(cleanPath)).slice(0, 80), lastOpened: Date.now() }, ...current.filter(item => {
    const itemIdentity = process.platform === "win32" ? item.filePath.toLowerCase() : item.filePath;
    return itemIdentity !== identity;
  })];
  await writeRecentProjects(app, next);
  return next;
}

async function openRecentProject(app, filePath, maxBytes) {
  const cleanPath = cleanProjectPath(filePath);
  const current = await readRecentProjects(app);
  const identity = process.platform === "win32" ? cleanPath.toLowerCase() : cleanPath;
  const allowed = current.some(item => (process.platform === "win32" ? item.filePath.toLowerCase() : item.filePath) === identity);
  if (!allowed) throw new Error("Recent project is not available");
  const stats = await fs.stat(cleanPath);
  if (!stats.isFile() || stats.size > maxBytes) throw new Error("Recent project is too large");
  const text = await fs.readFile(cleanPath, "utf8");
  await rememberRecentProject(app, cleanPath);
  return { ok: true, text, filePath: cleanPath };
}

module.exports = { MAX_RECENT_PROJECTS, openRecentProject, readRecentProjects, rememberRecentProject };
