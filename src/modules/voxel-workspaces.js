(() => {
  const $ = selector => document.querySelector(selector);
  const overlay = $("#voxel-tool-workspace-overlay");
  const dialog = overlay?.querySelector('[role="dialog"]');
  const closeBtn = $("#voxel-workspace-close-btn");
  const undoBtn = $("#voxel-workspace-undo-btn");
  const redoBtn = $("#voxel-workspace-redo-btn");
  const title = $("#voxel-tool-workspace-title");
  const previewHost = $("#voxel-workspace-preview-host");
  const controlsHost = $("#voxel-workspace-controls");
  const voxelPanel = $(".voxel-panel");
  const launchers = [...document.querySelectorAll("[data-voxel-workspace-open]")];
  const sources = [...document.querySelectorAll("[data-voxel-workspace-source]")];
  const switchers = [...document.querySelectorAll("[data-voxel-workspace-switch]")];
  const previewNodes = [
    $(".voxel-preview-toolbar"),
    $("#voxel-mode-stage"),
    $("#voxel-mode-multi-view"),
    $("#voxel-preview-help"),
    $("#voxel-mode-preview-status")
  ].filter(Boolean);
  if (!overlay || !dialog || !closeBtn || !title || !previewHost || !controlsHost || !launchers.length || !sources.length || !previewNodes.length) return;

  const sourceByName = new Map(sources.map(source => [source.dataset.voxelWorkspaceSource, source]));
  const markers = new Map();
  let activeSource = null;
  let activeTrigger = null;

  function markerFor(node) {
    if (markers.has(node)) return markers.get(node);
    const marker = document.createComment("voxel-workspace-slot");
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

  function syncExpanded(open) {
    launchers.forEach(button => button.setAttribute("aria-expanded", String(open && button.dataset.voxelWorkspaceOpen === overlay.dataset.activeWorkspace)));
    switchers.forEach(button => {
      const active = open && button.dataset.voxelWorkspaceSwitch === overlay.dataset.activeWorkspace;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function refreshPreview() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      $("#voxel-mode-preview")?.focus?.({ preventScroll: true });
    });
  }

  function openWorkspace(name, trigger) {
    const source = sourceByName.get(name);
    if (!source) return;
    if (!overlay.hidden && activeSource && activeSource !== source) restoreNodes([activeSource]);
    activeSource = source;
    activeTrigger = trigger || activeTrigger;
    overlay.dataset.activeWorkspace = name;
    title.textContent = source.dataset.voxelWorkspaceTitle || "Tool Workspace";
    parkNodes(previewNodes, previewHost);
    parkNodes([source], controlsHost);
    overlay.hidden = false;
    syncExpanded(true);
    document.body.classList.add("voxel-workspace-open");
    refreshPreview();
    document.dispatchEvent(new CustomEvent("pixelbug:voxel-workspace-opened", { detail: { name } }));
  }

  function closeWorkspace() {
    if (overlay.hidden) return;
    if (activeSource) restoreNodes([activeSource]);
    restoreNodes(previewNodes);
    overlay.hidden = true;
    overlay.dataset.activeWorkspace = "";
    document.body.classList.remove("voxel-workspace-open");
    syncExpanded(false);
    const target = activeTrigger;
    activeSource = null;
    activeTrigger = null;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      target?.focus?.();
    });
  }

  launchers.forEach(button => button.addEventListener("click", () => openWorkspace(button.dataset.voxelWorkspaceOpen, button)));
  switchers.forEach(button => button.addEventListener("click", () => openWorkspace(button.dataset.voxelWorkspaceSwitch, activeTrigger)));
  undoBtn?.addEventListener("click", () => $("#voxel-mode-undo-btn")?.click());
  redoBtn?.addEventListener("click", () => $("#voxel-mode-redo-btn")?.click());
  closeBtn.addEventListener("click", closeWorkspace);
  overlay.addEventListener("click", event => { if (event.target === overlay) closeWorkspace(); });
  document.addEventListener("keydown", event => {
    if (overlay.hidden || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeWorkspace();
  }, true);
  if (voxelPanel) new MutationObserver(() => { if (voxelPanel.hidden) closeWorkspace(); }).observe(voxelPanel, { attributes: true, attributeFilter: ["hidden"] });
})();
