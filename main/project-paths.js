const path = require("path");

function cleanDocumentId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9_-]{1,120}$/i.test(id)) throw new Error("Invalid document identifier");
  return id;
}

function cleanPath(value) {
  const resolved = path.resolve(String(value || ""));
  if (!resolved || resolved === path.parse(resolved).root) throw new Error("Invalid project path");
  return resolved;
}

function pathKey(value) {
  const resolved = cleanPath(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

class ProjectPathStore {
  constructor() {
    this.paths = new Map();
    this.approved = new Map();
  }

  records(contentsId) {
    if (!this.paths.has(contentsId)) this.paths.set(contentsId, new Map());
    return this.paths.get(contentsId);
  }

  approvals(contentsId) {
    if (!this.approved.has(contentsId)) this.approved.set(contentsId, new Map());
    return this.approved.get(contentsId);
  }

  approve(contentsId, filePath) {
    const resolved = cleanPath(filePath);
    this.approvals(contentsId).set(pathKey(resolved), resolved);
    return resolved;
  }

  bind(contentsId, documentId, filePath) {
    const id = cleanDocumentId(documentId);
    const key = pathKey(filePath);
    const approvedPath = this.approvals(contentsId).get(key);
    if (!approvedPath) throw new Error("Project path is not approved");
    this.records(contentsId).set(id, approvedPath);
    return approvedPath;
  }

  bindSaved(contentsId, documentId, filePath) {
    const approvedPath = this.approve(contentsId, filePath);
    return this.bind(contentsId, documentId, approvedPath);
  }

  get(contentsId, documentId) {
    return this.records(contentsId).get(cleanDocumentId(documentId)) || "";
  }

  forget(contentsId, documentId) {
    this.records(contentsId).delete(cleanDocumentId(documentId));
  }

  clear(contentsId) {
    this.paths.delete(contentsId);
    this.approved.delete(contentsId);
  }
}

module.exports = { ProjectPathStore, cleanDocumentId, cleanPath, pathKey };
