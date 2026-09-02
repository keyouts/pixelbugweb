// Snapshot module
(() => {
  const LEGACY_KEY = "pixel-bug-snapshot-history-v1";
  const STORE_KIND = "snapshots";
  let api = null;
  let overlay = null;
  let list = null;
  let items = [];
  let loaded = false;
  let dirty = false;
  let modalController = null;

  function legacyItems() {
    try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]").filter(item => item && item.project).slice(0, 36); }
    catch (_error) { return []; }
  }

  async function migrateLegacy() {
    const legacy = legacyItems();
    if (!legacy.length) return false;
    try {
      const existing = await window.pixelBug.listStoredProjects(STORE_KIND);
      const known = new Set(existing.map(item => `${item.projectId || ""}|${Number(item.savedAt) || 0}|${item.name || ""}`));
      for (const item of legacy.slice().reverse()) {
        const key = `${item.projectId || ""}|${Number(item.savedAt) || 0}|${item.name || ""}`;
        if (!known.has(key)) await window.pixelBug.saveStoredProject(STORE_KIND, item);
        known.add(key);
      }
      localStorage.removeItem(LEGACY_KEY);
      return true;
    } catch (_error) {
      api?.setStatus?.("Snapshot migration could not be completed. Existing local snapshots were kept.");
      return false;
    }
  }

  async function loadItems() {
    if (!window.pixelBug?.listStoredProjects) return;
    try {
      await migrateLegacy();
      items = await window.pixelBug.listStoredProjects(STORE_KIND);
      loaded = true;
    } catch (_error) {
      loaded = true;
      api?.setStatus?.("Snapshot history could not be loaded.");
    }
    render();
  }

  function makeButton(text, label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", handler);
    return button;
  }

  function close() {
    if (!overlay) return;
    if (modalController) modalController.close();
    else {
      overlay.hidden = true;
      const trigger = document.getElementById("snapshot-history-btn");
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.focus();
    }
  }

  async function open() {
    build();
    loaded = false;
    render();
    if (modalController) modalController.open();
    else {
      overlay.hidden = false;
      document.getElementById("snapshot-history-btn")?.setAttribute("aria-expanded", "true");
      overlay.querySelector("button")?.focus();
    }
    await loadItems();
  }

  async function createSnapshot() {
    try {
      const project = api.cloneProject();
      await window.pixelBug.saveStoredProject(STORE_KIND, {
        projectId: api.getProjectId(),
        name: project.name || "Untitled Project",
        savedAt: Date.now(),
        thumbnail: api.makeThumbnail(project),
        meta: api.projectMeta(project),
        project
      });
      dirty = false;
      api.setStatus("Snapshot created.");
      await loadItems();
    } catch (error) {
      api.setStatus(error?.message || "Snapshot could not be created.");
    }
  }

  async function restore(item) {
    try {
      const record = await window.pixelBug.loadStoredProject(STORE_KIND, item.id);
      if (api.restoreProject(record.project, "Snapshot restored.")) close();
    } catch (error) {
      api.setStatus(error?.message || "Snapshot could not be restored.");
    }
  }

  async function remove(item) {
    try {
      await window.pixelBug.deleteStoredProject(STORE_KIND, item.id);
      api.setStatus("Snapshot deleted.");
      await loadItems();
    } catch (error) {
      api.setStatus(error?.message || "Snapshot could not be deleted.");
    }
  }

  function renderCard(item) {
    const card = document.createElement("article");
    card.className = "project-card";
    const titleId = `snapshot-card-${String(item.id || "item").replace(/[^a-z0-9-]/gi, "-")}`;
    card.setAttribute("aria-labelledby", titleId);
    const img = document.createElement("img");
    img.alt = "";
    img.src = item.thumbnail || "";
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.id = titleId;
    title.textContent = item.name || "Untitled Project";
    const meta = document.createElement("p");
    meta.textContent = `${item.meta || "Stored project"} · ${new Date(item.savedAt || Date.now()).toLocaleString()}`;
    const actions = document.createElement("div");
    actions.className = "project-card-actions";
    actions.append(makeButton("Restore", `Restore ${title.textContent}`, () => restore(item)), makeButton("Delete", `Delete ${title.textContent}`, () => remove(item)));
    body.append(title, meta, actions);
    card.append(img, body);
    return card;
  }

  function render() {
    if (!list || !api) return;
    list.innerHTML = "";
    list.setAttribute("aria-busy", String(!loaded));
    const note = document.createElement("p");
    note.className = "modal-note";
    note.textContent = dirty ? "Unsaved changes detected since the last snapshot." : "Create a restore point before risky edits.";
    list.appendChild(note);
    if (!loaded) return;
    items.forEach(item => list.appendChild(renderCard(item)));
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<section class="modal-card project-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="snapshot-history-title" aria-describedby="snapshot-history-description"><div class="modal-head"><h2 id="snapshot-history-title">Snapshot History</h2><button id="snapshot-history-close" class="mini-square-btn" type="button" aria-label="Close snapshot history">×</button></div><p id="snapshot-history-description" class="modal-note">Snapshots are local restore points on this device.</p><div class="button-row"><button id="snapshot-create-current" type="button">Create Snapshot<span class="sr-only"> from current project</span></button></div><div id="snapshot-history-list" class="project-gallery-list" aria-live="polite"></div></section>`;
    document.body.appendChild(overlay);
    list = overlay.querySelector("#snapshot-history-list");
    modalController = window.PixelBugModalAccess?.createController?.({ overlay, trigger: document.getElementById("snapshot-history-btn"), closeButton: overlay.querySelector("#snapshot-history-close") });
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.querySelector("#snapshot-history-close")?.addEventListener("click", close);
    overlay.querySelector("#snapshot-create-current")?.addEventListener("click", createSnapshot);
  }

  function markDirty() {
    dirty = true;
    render();
  }

  function mount(nextApi) {
    api = nextApi;
    const button = document.getElementById("snapshot-history-btn");
    if (button && !button.dataset.snapshotReady) {
      button.dataset.snapshotReady = "true";
      button.addEventListener("click", open);
    }
  }

  function refresh() {
    if (overlay && !overlay.hidden) loadItems();
  }

  window.PixelBugSnapshots = { mount, refresh, markDirty };
  if (window.PixelBugAppApi) try { mount(window.PixelBugAppApi); } catch (err) { console.error(err); }
})();
