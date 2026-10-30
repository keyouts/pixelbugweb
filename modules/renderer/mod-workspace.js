// Mod workspace
(() => {
  "use strict";

  function clonePixels(pixels) {
    return Array.isArray(pixels) ? pixels.map(row => Array.isArray(row) ? row.slice() : []) : [];
  }

  function createHistory(limit = 48) {
    const undo = [];
    const redo = [];
    const cap = Math.max(4, Math.min(128, Number(limit) || 48));
    const snapshot = pixels => clonePixels(pixels);
    return {
      clear() { undo.length = 0; redo.length = 0; },
      push(pixels) {
        undo.push(snapshot(pixels));
        if (undo.length > cap) undo.shift();
        redo.length = 0;
      },
      undo(pixels) {
        if (!undo.length) return null;
        redo.push(snapshot(pixels));
        return undo.pop();
      },
      redo(pixels) {
        if (!redo.length) return null;
        undo.push(snapshot(pixels));
        return redo.pop();
      },
      state() { return { canUndo: undo.length > 0, canRedo: redo.length > 0, undoCount: undo.length, redoCount: redo.length }; }
    };
  }

  function cleanDraft(value = {}) {
    return {
      name: String(value.name || "My Mod").slice(0, 80),
      id: String(value.id || "my-mod").slice(0, 80),
      brushCode: String(value.brushCode || "").slice(0, 12000),
      effectCode: String(value.effectCode || "").slice(0, 12000),
      playUiCode: String(value.playUiCode || "").slice(0, 12000),
      brushSource: value.brushSource === "installed" ? "installed" : "code",
      effectSource: value.effectSource === "installed" ? "installed" : "code",
      brushId: String(value.brushId || "").slice(0, 120),
      effectId: String(value.effectId || "").slice(0, 120),
      includeBrush: value.includeBrush !== false,
      includeEffect: value.includeEffect !== false,
      includePlayUi: value.includePlayUi !== false,
      permissions: Array.isArray(value.permissions) ? value.permissions.map(item => String(item)).slice(0, 16) : [],
      live: value.live === true
    };
  }

  function validate(input, helpers) {
    const issues = [];
    const warnings = [];
    const name = String(input?.name || "").trim();
    const id = String(input?.id || "").trim();
    const brushCode = String(input?.brushCode || "");
    const effectCode = String(input?.effectCode || "");
    const playUiCode = String(input?.playUiCode || "");
    if (!name) issues.push("Add a mod name.");
    if (!id) issues.push("Add a mod ID.");
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) issues.push("Use lowercase letters, numbers, and hyphens for the mod ID.");
    try { if (brushCode.trim()) helpers.validateCode(brushCode); } catch (error) { issues.push(`Brush: ${error.message}`); }
    try { if (effectCode.trim()) helpers.validateCode(effectCode); } catch (error) { issues.push(`Effect: ${error.message}`); }
    try { if (playUiCode.trim()) helpers.parsePlayUi(playUiCode); } catch (error) { issues.push(`Play UI: ${error.message}`); }
    const pack = {
      brushCode: input?.includeBrush === false ? "" : brushCode,
      effectCode: input?.includeEffect === false ? "" : effectCode,
      playUiCode: input?.includePlayUi === false ? "" : playUiCode
    };
    const required = helpers.requiredForPack(pack);
    const authorization = helpers.authorize(input?.permissions || [], required);
    if (!authorization.ok) issues.push(`Enable: ${helpers.describe(authorization.missing).join(", ")}.`);
    if (!pack.brushCode.trim() && !pack.effectCode.trim() && !pack.playUiCode.trim()) warnings.push("This package currently contains no enabled mod component.");
    return { ok: issues.length === 0, issues, warnings, required };
  }

  const api = Object.freeze({ cleanDraft, clonePixels, createHistory, validate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
