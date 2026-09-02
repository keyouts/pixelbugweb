"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { APP_URL, registerHandler, registerScheme } = require("../src/main/app-protocol");

const errors = [];
registerScheme();

ipcMain.handle("get-system-theme", () => "light");
ipcMain.handle("load-recovery", () => "");
ipcMain.handle("save-recovery", () => true);
ipcMain.handle("clear-recovery", () => true);
ipcMain.handle("list-recovery-snapshots", () => []);
ipcMain.handle("load-recovery-snapshot", () => ({ ok: false }));
ipcMain.handle("delete-recovery-snapshot", () => true);
ipcMain.handle("list-recent-projects", () => []);
ipcMain.handle("bind-project-path", () => true);
ipcMain.handle("forget-project-path", () => true);
ipcMain.handle("reset-mod-runner", () => true);
ipcMain.handle("run-mod-code", () => ({ ok: false, error: "Unavailable during smoke test" }));

app.whenReady().then(async () => {
  registerHandler(path.join(__dirname, "..", "src"));
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "src", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2) errors.push(message);
  });
  window.webContents.on("render-process-gone", (_event, details) => errors.push(`Renderer stopped: ${details.reason}`));
  await window.loadURL(APP_URL);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const pause = () => new Promise(resolve => setTimeout(resolve, 80));
    const state = window.PixelBugAppApi?.getState?.();
    const firstPixel = () => state?.frames?.[0]?.layers?.[0]?.pixels?.[0]?.[0] ?? null;
    const canvas = document.querySelector("#pixel-canvas");
    const activeTab = () => document.querySelector('[role="tab"][aria-selected="true"]');
    const cleanBeforePreferences = !activeTab()?.getAttribute("aria-label")?.includes("unsaved changes");
    const colorPicker = document.querySelector("#color-picker");
    if (colorPicker) {
      colorPicker.value = "#123456";
      colorPicker.dispatchEvent(new Event("input", { bubbles: true }));
    }
    document.querySelector("#toggle-grid-btn")?.click();
    document.querySelector("#toggle-grid-btn")?.click();
    await pause();
    const preferencesStayClean = cleanBeforePreferences && !activeTab()?.getAttribute("aria-label")?.includes("unsaved changes");
    const before = firstPixel();
    canvas?.focus();
    canvas?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await pause();
    const painted = firstPixel();
    document.querySelector("#undo-btn")?.click();
    await pause();
    const undone = firstPixel();
    document.querySelector("#redo-btn")?.click();
    await pause();
    const redone = firstPixel();
    const opacity = document.querySelector("#layer-opacity");
    const opacityBefore = state?.frames?.[0]?.layers?.[0]?.opacity;
    if (opacity) {
      opacity.value = "35";
      opacity.dispatchEvent(new Event("input", { bubbles: true }));
      opacity.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await pause();
    const opacityChanged = state?.frames?.[0]?.layers?.[0]?.opacity === 0.35;
    document.querySelector("#undo-btn")?.click();
    await pause();
    const opacityUndo = state?.frames?.[0]?.layers?.[0]?.opacity === opacityBefore;

    const settings = document.querySelector("#settings-btn");
    settings?.click();
    await pause();
    const size = document.querySelector("#settings-text-size");
    if (size) {
      size.value = "large";
      size.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const contrast = document.querySelector("#settings-high-contrast");
    if (contrast) {
      contrast.checked = true;
      contrast.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await pause();
    const settingsOpen = document.querySelector("#settings-overlay")?.hidden === false;
    const accessibilityApplied = document.documentElement.classList.contains("a11y-high-contrast") && document.documentElement.style.getPropertyValue("--a11y-text-scale") === "1.1";
    const interfaceScale = document.querySelector("#settings-interface-scale");
    if (interfaceScale) {
      interfaceScale.value = "200";
      interfaceScale.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await pause();
    const interfaceScaleStable = getComputedStyle(document.documentElement).fontSize === "16px" && document.documentElement.dataset.interfaceScale === "200";
    if (interfaceScale) {
      interfaceScale.value = "100";
      interfaceScale.dispatchEvent(new Event("change", { bubbles: true }));
    }
    document.querySelector("#close-settings-btn")?.click();

    const canvasSize = document.querySelector("#canvas-size");
    if (canvasSize) {
      canvasSize.value = "512";
      canvasSize.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await pause();
    const largeCanvasRect = canvas?.getBoundingClientRect();
    const largeCanvasUsable = Boolean(largeCanvasRect && largeCanvasRect.width >= 500 && largeCanvasRect.height >= 500);

    document.querySelector("#export-menu-btn")?.click();
    document.querySelector("#export-png-btn")?.click();
    await pause();
    const preflightOpen = document.querySelector("#export-preflight-overlay")?.hidden === false;
    document.querySelector("#export-preflight-cancel-btn")?.click();

    document.querySelector("#play-mode-btn")?.click();
    await pause();
    const playModeBefore = JSON.stringify(state?.playMode);
    document.querySelector("#play-run-btn")?.click();
    await pause();
    if (state?.playMode) {
      state.playMode.checkpoint = { sceneId: "runtime-only", x: 91, y: 37 };
      state.playMode.dialogue.currentLine = Math.min(1, Math.max(0, state.playMode.dialogue.lines.length - 1));
    }
    document.querySelector("#play-run-btn")?.click();
    await pause();
    const playRuntimeIsolated = JSON.stringify(state?.playMode) === playModeBefore;
    document.querySelector("#play-mode-btn")?.click();

    const modeCheck = async (buttonSelector, bodyClass, panelSelector) => {
      const button = document.querySelector(buttonSelector);
      const panel = document.querySelector(panelSelector);
      button?.click();
      await pause();
      const entered = document.body.classList.contains(bodyClass) && button?.getAttribute("aria-pressed") === "true" && panel?.hidden === false;
      button?.click();
      await pause();
      const exited = !document.body.classList.contains(bodyClass) && button?.getAttribute("aria-pressed") === "false" && panel?.hidden === true;
      return entered && exited;
    };
    const printModeFunctional = await modeCheck("#print-mode-btn", "print-mode", ".print-panel");
    const voxelModeFunctional = await modeCheck("#voxel-mode-btn", "voxel-mode", ".voxel-panel");
    const modModeFunctional = await modeCheck("#mod-mode-btn", "mod-mode", "#mod-sandbox-panel");

    document.querySelector("#print-mode-btn")?.click();
    document.querySelector("#voxel-mode-btn")?.click();
    await pause();
    const modesStayExclusive = document.body.classList.contains("voxel-mode") && !document.body.classList.contains("print-mode");
    document.querySelector("#voxel-mode-btn")?.click();

    document.querySelector("#document-new-tab-btn")?.click();
    await pause();
    let documentTabButtons = [...document.querySelectorAll("#document-tabs .document-tab-main")];
    documentTabButtons[0]?.click();
    await pause();
    const firstDocumentMode = JSON.stringify(window.PixelBugAppApi?.getState?.()?.playMode);
    document.querySelector("#play-mode-btn")?.click();
    document.querySelector("#play-run-btn")?.click();
    await pause();
    const runtimeState = window.PixelBugAppApi?.getState?.();
    if (runtimeState?.playMode) runtimeState.playMode.checkpoint = { sceneId: "tab-runtime-only", x: 12, y: 34 };
    documentTabButtons = [...document.querySelectorAll("#document-tabs .document-tab-main")];
    documentTabButtons[1]?.click();
    await pause();
    const runtimeStoppedOnTabSwitch = document.querySelector("#play-run-btn")?.getAttribute("aria-pressed") === "false";
    documentTabButtons = [...document.querySelectorAll("#document-tabs .document-tab-main")];
    documentTabButtons[0]?.click();
    await pause();
    const tabRuntimeIsolated = JSON.stringify(window.PixelBugAppApi?.getState?.()?.playMode) === firstDocumentMode;
    if (document.body.classList.contains("play-mode")) document.querySelector("#play-mode-btn")?.click();

    const recovery = window.PixelBugDocuments?.serializeRecovery?.();
    const parsedRecovery = window.PixelBugSessionRecovery?.parse?.(recovery, window.PixelBugProjectPackage);
    const checks = {
      controllers: Boolean(window.PixelBugWorkflowControllers?.documents),
      packageApi: typeof window.PixelBugProjectPackage?.recover === "function",
      historyApi: typeof window.PixelBugHistoryPatches?.create === "function",
      recoveryApi: parsedRecovery?.documents?.length >= 1,
      settingsOpen,
      accessibilityApplied,
      interfaceScaleStable,
      preferencesStayClean,
      opacityChanged,
      opacityUndo,
      playRuntimeIsolated,
      printModeFunctional,
      voxelModeFunctional,
      modModeFunctional,
      modesStayExclusive,
      runtimeStoppedOnTabSwitch,
      tabRuntimeIsolated,
      largeCanvasUsable,
      accessibility: ["#settings-reduced-motion", "#settings-strong-focus", "#settings-large-targets", "#settings-font-preset", "#settings-bold-text", "#settings-high-contrast", "#settings-text-size"].every(selector => Boolean(document.querySelector(selector))),
      projectHealth: Boolean(document.querySelector("#project-health-grid")?.children.length),
      modPermissions: ["#mod-permission-canvas-read", "#mod-permission-pixels-write", "#mod-permission-play-ui"].every(selector => Boolean(document.querySelector(selector))),
      preflightOpen,
      tabs: document.querySelectorAll('[role="tab"]').length >= 1,
      saveAnnouncements: Boolean(document.querySelector('#document-save-status[role="status"][aria-live="polite"]')),
      canvas: Boolean(canvas?.getContext("2d")),
      keyboardPaint: before === null && painted !== null && undone === null && redone === painted
    };
    return { checks, failed: Object.entries(checks).filter(([, value]) => !value).map(([key]) => key) };
  })()`);
  if (errors.length || result.failed.length) {
    process.stderr.write(JSON.stringify({ errors, result }, null, 2));
    app.exit(1);
    return;
  }
  process.stdout.write(JSON.stringify(result.checks));
  app.exit(0);
}).catch(error => {
  process.stderr.write(String(error?.stack || error));
  app.exit(1);
});
