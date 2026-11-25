// Play workspaces
(() => {
  const $ = selector => document.querySelector(selector);
  const overlay = $("#play-tool-workspace-overlay");
  const dialog = overlay?.querySelector('[role="dialog"]');
  const closeBtn = $("#play-workspace-close-btn");
  const undoBtn = $("#play-workspace-undo-btn");
  const redoBtn = $("#play-workspace-redo-btn");
  const title = $("#play-tool-workspace-title");
  const previewHost = $("#play-workspace-preview-host");
  const controlsHost = $("#play-workspace-controls");
  const previewToggle = $("#play-workspace-preview-toggle");
  const previewPane = previewHost?.closest(".play-workspace-preview-pane");
  const playPanel = $(".play-panel");
  const stageShell = $(".play-panel .play-stage-shell");
  const launchers = [...document.querySelectorAll("[data-play-workspace-open]")];
  const switchers = [...document.querySelectorAll("[data-play-workspace-switch]")];
  const staticSources = [...document.querySelectorAll("[data-play-workspace-source]")];
  if (!overlay || !dialog || !closeBtn || !title || !previewHost || !controlsHost || !playPanel || !stageShell || !launchers.length) return;

  const markers = new Map();
  let activeName = "";
  let activeNodes = [];
  let activeTrigger = null;

  function markerFor(node) {
    if (markers.has(node)) return markers.get(node);
    const marker = document.createComment("play-workspace-slot");
    node.parentNode?.insertBefore(marker, node);
    markers.set(node, marker);
    return marker;
  }

  function parkNodes(nodes, host) {
    nodes.forEach(node => {
      markerFor(node);
      host.appendChild(node);
    });
  }

  function restoreNodes(nodes) {
    nodes.forEach(node => {
      const marker = markers.get(node);
      if (marker?.parentNode) marker.parentNode.insertBefore(node, marker.nextSibling);
    });
  }

  function sourceNodes(name) {
    return staticSources.filter(source => source.dataset.playWorkspaceSource === name);
  }

  function openRulesDirect() {
    if (!overlay.hidden) {
      closeWorkspace(false);
      $("#play-workspace-rules-btn")?.focus();
    }
    window.PixelBugNodeEditor?.render?.();
    window.PixelBugNodeEditor?.openOverlay?.();
  }

  function workspaceTitle(name) {
    const launcher = launchers.find(button => button.dataset.playWorkspaceOpen === name);
    return launcher?.dataset.playWorkspaceTitle || launcher?.textContent?.trim() || "Tool Workspace";
  }

  function syncExpanded(open) {
    launchers.forEach(button => button.setAttribute("aria-expanded", String(open && button.dataset.playWorkspaceOpen === activeName)));
    switchers.forEach(button => {
      const active = open && button.dataset.playWorkspaceSwitch === activeName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function setPreviewVisible(visible) {
    if (!previewPane || !previewToggle) return;
    previewPane.hidden = !visible;
    overlay.classList.toggle("play-preview-hidden", !visible);
    previewToggle.setAttribute("aria-expanded", String(visible));
    previewToggle.textContent = visible ? "Hide Preview" : "Show Preview";
    window.dispatchEvent(new Event("resize"));
  }

  previewToggle?.addEventListener("click", () => setPreviewVisible(Boolean(previewPane?.hidden)));

  function refreshPreview() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.PixelBugPlayGuide?.render?.();
      controlsHost.scrollTop = 0;
      controlsHost.querySelector("button:not(:disabled), select:not(:disabled), input:not(:disabled), summary")?.focus?.({ preventScroll: true });
    });
  }

  function openWorkspace(name, trigger = null) {
    const nodes = sourceNodes(name);
    if (!nodes.length) return false;
    if (!overlay.hidden && activeNodes.length) restoreNodes(activeNodes);
    if (overlay.hidden) setPreviewVisible(true);
    activeName = name;
    activeNodes = nodes;
    activeTrigger = trigger || activeTrigger;
    overlay.dataset.activeWorkspace = name;
    title.textContent = workspaceTitle(name);
    parkNodes([stageShell], previewHost);
    parkNodes(nodes, controlsHost);
    overlay.hidden = false;
    document.body.classList.add("play-workspace-open");
    syncExpanded(true);
    refreshPreview();
    document.dispatchEvent(new CustomEvent("pixelbug:play-workspace-opened", { detail: { name } }));
    return true;
  }

  function closeWorkspace(restoreFocus = true) {
    if (overlay.hidden) return;
    restoreNodes(activeNodes);
    restoreNodes([stageShell]);
    overlay.hidden = true;
    setPreviewVisible(true);
    overlay.dataset.activeWorkspace = "";
    document.body.classList.remove("play-workspace-open");
    syncExpanded(false);
    const target = activeTrigger?.closest("[data-play-workspace-source]")
      ? launchers.find(button => button.dataset.playWorkspaceOpen === activeName)
      : activeTrigger || launchers.find(button => button.dataset.playWorkspaceOpen === activeName);
    activeName = "";
    activeNodes = [];
    activeTrigger = null;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      window.PixelBugPlayGuide?.render?.();
      if (restoreFocus) target?.focus?.();
    });
  }

  launchers.forEach(button => button.addEventListener("click", () => {
    if (button.dataset.playWorkspaceOpen === "rules") { openRulesDirect(); return; }
    openWorkspace(button.dataset.playWorkspaceOpen, button);
  }));
  switchers.forEach(button => button.addEventListener("click", () => {
    if (button.dataset.playWorkspaceSwitch === "rules") { openRulesDirect(); return; }
    openWorkspace(button.dataset.playWorkspaceSwitch, activeTrigger);
  }));
  const historyButtons = [[undoBtn, $("#play-undo-btn")], [redoBtn, $("#play-redo-btn")]];
  for (const [proxy, original] of historyButtons) {
    if (!proxy || !original) continue;
    const sync = () => { proxy.disabled = original.disabled; };
    new MutationObserver(sync).observe(original, { attributes: true, attributeFilter: ["disabled"] });
    sync();
  }
  undoBtn?.addEventListener("click", () => $("#play-undo-btn")?.click());
  redoBtn?.addEventListener("click", () => $("#play-redo-btn")?.click());
  closeBtn.addEventListener("click", closeWorkspace);
  overlay.addEventListener("click", event => { if (event.target === overlay) closeWorkspace(); });
  document.addEventListener("keydown", event => {
    if (overlay.hidden || event.key !== "Escape") return;
    const nestedOverlay = [...document.querySelectorAll(".modal-overlay")].some(item => item !== overlay && !item.hidden);
    if (nestedOverlay) return;
    event.preventDefault();
    event.stopPropagation();
    closeWorkspace();
  }, true);
  new MutationObserver(() => { if (playPanel.hidden) closeWorkspace(); }).observe(playPanel, { attributes: true, attributeFilter: ["hidden"] });
  window.PixelBugPlayWorkspaces = { open: openWorkspace, close: closeWorkspace, active: () => activeName };
})();
