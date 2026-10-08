(() => {
  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function estimate(context = {}) {
    const width = Math.max(1, Number(context.width) || 1);
    const height = Math.max(1, Number(context.height) || 1);
    const frames = Math.max(1, Number(context.frames) || 1);
    const scale = Math.max(1, Number(context.scale) || 1);
    const rawBytes = width * height * scale * scale * 4 * frames;
    return {
      width,
      height,
      frames,
      scale,
      outputWidth: width * scale,
      outputHeight: height * scale,
      rawBytes,
      rawLabel: formatBytes(rawBytes)
    };
  }

  function create(options = {}) {
    const overlay = document.querySelector("#export-preflight-overlay");
    const title = document.querySelector("#export-preflight-title");
    const details = document.querySelector("#export-preflight-details");
    const status = document.querySelector("#export-preflight-status");
    const progress = document.querySelector("#export-preflight-progress");
    const confirmButton = document.querySelector("#export-preflight-confirm-btn");
    const cancelButton = document.querySelector("#export-preflight-cancel-btn");
    const closeButton = document.querySelector("#close-export-preflight-btn");
    let pending = null;
    let active = false;

    function close(force = false) {
      if (!overlay || (active && !force)) return false;
      overlay.hidden = true;
      pending = null;
      active = false;
      overlay.setAttribute("aria-busy", "false");
      if (progress) progress.hidden = true;
      if (confirmButton) confirmButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      if (closeButton) closeButton.disabled = false;
      return true;
    }

    function open(label, action, context = {}) {
      if (!overlay || typeof action !== "function") return Promise.resolve(action?.());
      const info = estimate(context);
      pending = { action, label: String(label || "Export") };
      if (title) title.textContent = `${pending.label} Preflight`;
      if (details) details.innerHTML = `
        <dt>Output size</dt><dd>${info.outputWidth} × ${info.outputHeight}</dd>
        <dt>Frames</dt><dd>${info.frames}</dd>
        <dt>Scale</dt><dd>${info.scale}×</dd>
        <dt>Working memory</dt><dd>About ${info.rawLabel}</dd>`;
      if (status) status.textContent = "Review the export details before continuing.";
      if (progress) progress.hidden = true;
      overlay.setAttribute("aria-busy", "false");
      if (confirmButton) confirmButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
      if (closeButton) closeButton.disabled = false;
      overlay.hidden = false;
      return Promise.resolve(true);
    }

    async function confirm() {
      if (!pending || active) return;
      const next = pending;
      active = true;
      if (progress) progress.hidden = false;
      overlay?.setAttribute("aria-busy", "true");
      if (status) status.textContent = "Preparing export. Project data remains available while the export completes.";
      if (confirmButton) confirmButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      if (closeButton) closeButton.disabled = true;
      try {
        await next.action();
        if (status) status.textContent = "Export finished or the save dialog was closed.";
      } catch (error) {
        if (status) status.textContent = error?.message || "Export failed.";
      } finally {
        active = false;
        overlay?.setAttribute("aria-busy", "false");
        if (confirmButton) confirmButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
        if (closeButton) closeButton.disabled = false;
        setTimeout(() => close(true), 700);
      }
    }

    function notify(message) {
      if (!active || !status) return;
      const text = String(message || "");
      if (/export|save|cancel|fail/i.test(text)) status.textContent = text;
    }

    confirmButton?.addEventListener("click", confirm);
    cancelButton?.addEventListener("click", close);
    closeButton?.addEventListener("click", close);
    overlay?.addEventListener("click", event => { if (event.target === overlay && !active) close(); });

    return Object.freeze({ close, estimate, notify, open });
  }

  const api = Object.freeze({ create, estimate, formatBytes });
  if (typeof globalThis !== "undefined") globalThis.PixelBugExportPreflight = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
