const crypto = require("crypto");
const path = require("path");
const { BrowserWindow, session } = require("electron");

const { cleanInput, cleanResult } = require("./mod-validation");

const RUN_TIMEOUT_MS = 900;
const IDLE_TIMEOUT_MS = 30000;

function hardenRunnerSession(activeSession) {
  activeSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  activeSession.setPermissionCheckHandler(() => false);
  activeSession.setDevicePermissionHandler?.(() => false);
  activeSession.setDisplayMediaRequestHandler?.((_request, callback) => callback({}));
  activeSession.on("will-download", event => event.preventDefault());
  activeSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url === "pixelbug://mod/runner.html" || details.url === "pixelbug://mod/mod-runner.js";
    callback({ cancel: !allowed });
  });
}

class ModRunnerManager {
  constructor(ipcMain, runnerUrl) {
    this.ipcMain = ipcMain;
    this.runnerUrl = runnerUrl;
    this.runners = new Map();
    this.contents = new Map();
    this.owners = new Set();
    this.sequence = 0;
    ipcMain.on("mod-run-response", (event, response) => this.receive(event, response));
  }

  ownerKey(owner, kind) {
    return `${owner.id}:${kind}`;
  }

  watchOwner(owner) {
    if (this.owners.has(owner.id)) return;
    this.owners.add(owner.id);
    owner.once("destroyed", () => {
      this.owners.delete(owner.id);
      for (const [key, runner] of this.runners) if (runner.ownerId === owner.id) this.destroy(key, runner, new Error("Mod owner closed"));
    });
  }

  async create(owner, kind, code) {
    const partition = `pixelbug-mod-${crypto.randomBytes(12).toString("hex")}`;
    const runnerSession = session.fromPartition(partition, { cache: false });
    hardenRunnerSession(runnerSession);
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, "../mod-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        webviewTag: false,
        devTools: false,
        spellcheck: false,
        partition
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    window.webContents.on("will-redirect", event => event.preventDefault());
    window.webContents.on("will-attach-webview", event => event.preventDefault());
    const contentsId = window.webContents.id;
    const runner = { window, ownerId: owner.id, kind, code, pending: new Map(), idleTimer: null };
    this.contents.set(contentsId, runner);
    window.webContents.on("render-process-gone", () => {
      const key = this.ownerKey({ id: owner.id }, kind);
      this.destroy(key, runner, new Error("Mod runner stopped"));
    });
    window.on("closed", () => {
      this.contents.delete(contentsId);
      for (const [key, value] of this.runners) if (value === runner) this.destroy(key, runner, new Error("Mod runner closed"));
    });
    try {
      await window.loadURL(this.runnerUrl);
      return runner;
    } catch (error) {
      this.contents.delete(contentsId);
      if (!window.isDestroyed()) window.destroy();
      throw error;
    }
  }

  destroy(key, runner, error) {
    if (!runner) return;
    if (this.runners.get(key) === runner) this.runners.delete(key);
    clearTimeout(runner.idleTimer);
    for (const pending of runner.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error || new Error("Mod runner reset"));
    }
    runner.pending.clear();
    if (!runner.window.isDestroyed()) runner.window.destroy();
  }

  scheduleIdle(key, runner) {
    clearTimeout(runner.idleTimer);
    runner.idleTimer = setTimeout(() => this.destroy(key, runner, new Error("Mod runner expired")), IDLE_TIMEOUT_MS);
  }

  receive(event, response) {
    const runner = this.contents.get(event.sender.id);
    if (!runner || !response || typeof response !== "object") return;
    const pending = runner.pending.get(response.id);
    if (!pending) return;
    runner.pending.delete(response.id);
    clearTimeout(pending.timer);
    try {
      if (response.error) throw new Error(String(response.error).slice(0, 500));
      pending.resolve(cleanResult(runner.kind, response.result, pending.payload));
    } catch (error) {
      pending.reject(error);
    }
  }

  async run(event, request) {
    const owner = event.sender;
    if (!owner || owner.isDestroyed()) throw new Error("Mod owner is unavailable");
    const input = cleanInput(request);
    this.watchOwner(owner);
    const key = this.ownerKey(owner, input.kind);
    let runner = this.runners.get(key);
    if (!runner || runner.code !== input.code || runner.window.isDestroyed()) {
      if (runner) this.destroy(key, runner, new Error("Mod code changed"));
      runner = await this.create(owner, input.kind, input.code);
      this.runners.set(key, runner);
    }
    const id = `${owner.id}-${++this.sequence}`;
    this.scheduleIdle(key, runner);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.destroy(key, runner, new Error("Mod timed out and was stopped"));
      }, RUN_TIMEOUT_MS);
      runner.pending.set(id, { resolve, reject, timer, payload: input.payload });
      runner.window.webContents.send("mod-run-request", { id, kind: input.kind, code: input.code, payload: input.payload });
    });
  }

  reset(event, kind) {
    const owner = event.sender;
    if (!owner || owner.isDestroyed()) return false;
    const kinds = kind === "brush" || kind === "effect" ? [kind] : ["brush", "effect"];
    for (const item of kinds) {
      const key = this.ownerKey(owner, item);
      const runner = this.runners.get(key);
      if (runner) this.destroy(key, runner, new Error("Mod runner reset"));
    }
    return true;
  }
}

module.exports = { ModRunnerManager };
