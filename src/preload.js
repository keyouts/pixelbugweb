const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = Object.freeze({
  saveFile: "save-file",
  saveProjectFile: "save-project-file",
  bindProjectPath: "bind-project-path",
  forgetProjectPath: "forget-project-path",
  decodePsdTemplate: "decode-psd-template",
  openProject: "open-project",
  openRecentProject: "open-recent-project",
  listRecentProjects: "list-recent-projects",
  openVoxelModel: "open-voxel-model",
  getSystemTheme: "get-system-theme",
  systemThemeChanged: "system-theme-changed",
  browserZoomBlocked: "browser-zoom-blocked",
  runModCode: "run-mod-code",
  resetModRunner: "reset-mod-runner",
  saveRecovery: "save-recovery",
  loadRecovery: "load-recovery",
  clearRecovery: "clear-recovery",
  listRecoverySnapshots: "list-recovery-snapshots",
  loadRecoverySnapshot: "load-recovery-snapshot",
  deleteRecoverySnapshot: "delete-recovery-snapshot",
  listStoredProjects: "list-stored-projects",
  saveStoredProject: "save-stored-project",
  loadStoredProject: "load-stored-project",
  deleteStoredProject: "delete-stored-project",
  requestWindowClose: "request-window-close",
  completeWindowClose: "complete-window-close",
  cancelWindowClose: "cancel-window-close",
  windowCloseRequested: "window-close-requested",
  rendererCloseReady: "renderer-close-ready"
});

function plainOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    title: value.title,
    defaultPath: value.defaultPath,
    filters: value.filters,
    data: value.data,
    encoding: value.encoding,
    extraFiles: value.extraFiles
  };
}

function projectOptions(value) {
  return {
    ...plainOptions(value),
    documentId: value?.documentId,
    forceDialog: value?.forceDialog === true
  };
}

function modRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Mod request is required");
  return {
    kind: value.kind,
    code: value.code,
    permissions: Array.isArray(value.permissions) ? value.permissions.slice(0, 8).map(item => String(item || "")) : [],
    payload: value.payload
  };
}

function listen(channel, callback, transform = value => value) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, value) => callback(transform(value));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

function binaryData(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new TypeError("Binary data is required");
}

const api = Object.freeze({
  saveFile: options => ipcRenderer.invoke(CHANNELS.saveFile, plainOptions(options)),
  saveProjectFile: options => ipcRenderer.invoke(CHANNELS.saveProjectFile, projectOptions(options)),
  bindProjectPath: (documentId, filePath) => ipcRenderer.invoke(CHANNELS.bindProjectPath, String(documentId || ""), String(filePath || "")),
  forgetProjectPath: documentId => ipcRenderer.invoke(CHANNELS.forgetProjectPath, String(documentId || "")),
  decodePsdTemplate: data => ipcRenderer.invoke(CHANNELS.decodePsdTemplate, binaryData(data)),
  openProject: () => ipcRenderer.invoke(CHANNELS.openProject),
  openRecentProject: filePath => ipcRenderer.invoke(CHANNELS.openRecentProject, String(filePath || "")),
  listRecentProjects: () => ipcRenderer.invoke(CHANNELS.listRecentProjects),
  openVoxelModel: () => ipcRenderer.invoke(CHANNELS.openVoxelModel),
  getSystemTheme: () => ipcRenderer.invoke(CHANNELS.getSystemTheme),
  runModCode: request => ipcRenderer.invoke(CHANNELS.runModCode, modRequest(request)),
  resetModRunner: kind => ipcRenderer.invoke(CHANNELS.resetModRunner, kind),
  saveRecovery: request => ipcRenderer.invoke(CHANNELS.saveRecovery, typeof request === "string" ? request : {
    payload: String(request?.payload || ""),
    summary: request?.summary,
    forceSnapshot: request?.forceSnapshot === true
  }),
  loadRecovery: () => ipcRenderer.invoke(CHANNELS.loadRecovery),
  clearRecovery: () => ipcRenderer.invoke(CHANNELS.clearRecovery),
  listRecoverySnapshots: () => ipcRenderer.invoke(CHANNELS.listRecoverySnapshots),
  loadRecoverySnapshot: snapshotId => ipcRenderer.invoke(CHANNELS.loadRecoverySnapshot, String(snapshotId || "")),
  deleteRecoverySnapshot: snapshotId => ipcRenderer.invoke(CHANNELS.deleteRecoverySnapshot, String(snapshotId || "")),
  listStoredProjects: kind => ipcRenderer.invoke(CHANNELS.listStoredProjects, String(kind || "")),
  saveStoredProject: (kind, value) => ipcRenderer.invoke(CHANNELS.saveStoredProject, String(kind || ""), value),
  loadStoredProject: (kind, id) => ipcRenderer.invoke(CHANNELS.loadStoredProject, String(kind || ""), String(id || "")),
  deleteStoredProject: (kind, id) => ipcRenderer.invoke(CHANNELS.deleteStoredProject, String(kind || ""), String(id || "")),
  requestWindowClose: request => ipcRenderer.invoke(CHANNELS.requestWindowClose, {
    dirtyNames: Array.isArray(request?.dirtyNames) ? request.dirtyNames.slice(0, 12).map(name => String(name || "")) : [],
    recoveryFailed: request?.recoveryFailed === true
  }),
  completeWindowClose: () => ipcRenderer.invoke(CHANNELS.completeWindowClose),
  cancelWindowClose: () => ipcRenderer.invoke(CHANNELS.cancelWindowClose),
  signalWindowCloseReady: () => ipcRenderer.send(CHANNELS.rendererCloseReady),
  onSystemThemeChanged: callback => listen(CHANNELS.systemThemeChanged, callback, value => value === "dark" ? "dark" : "light"),
  onBrowserZoomBlocked: callback => listen(CHANNELS.browserZoomBlocked, callback, value => ["in", "out", "reset"].includes(value) ? value : "reset"),
  onWindowCloseRequested: callback => listen(CHANNELS.windowCloseRequested, callback)
});

contextBridge.exposeInMainWorld("pixelBug", api);
