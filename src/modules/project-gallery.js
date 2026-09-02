// Gallery module
(() => {
  const LEGACY_KEY = "pixel-bug-project-gallery-v1";
  const STORE_KIND = "gallery";
  let api = null;
  let overlay = null;
  let list = null;
  let items = [];
  let loaded = false;
  let modalController = null;

  function legacyItems() {
    try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]").filter(item => item && item.project).slice(0, 24); }
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
      api?.setStatus?.("Project gallery migration could not be completed. Existing local gallery data was kept.");
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
      api?.setStatus?.("Project gallery could not be loaded.");
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
      const trigger = document.getElementById("project-gallery-btn");
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
      document.getElementById("project-gallery-btn")?.setAttribute("aria-expanded", "true");
      overlay.querySelector("button")?.focus();
    }
    await loadItems();
  }

  async function saveCurrent() {
    try {
      const project = api.cloneProject();
      const record = {
        projectId: api.getProjectId(),
        name: project.name || "Untitled Project",
        savedAt: Date.now(),
        thumbnail: api.makeThumbnail(project),
        meta: api.projectMeta(project),
        project
      };
      await window.pixelBug.saveStoredProject(STORE_KIND, record);
      api.setStatus("Project saved to gallery.");
      await loadItems();
    } catch (error) {
      api.setStatus(error?.message || "Project could not be saved to gallery.");
    }
  }

  async function restore(item) {
    try {
      const record = await window.pixelBug.loadStoredProject(STORE_KIND, item.id);
      if (api.restoreProject(record.project, "Gallery project restored.")) close();
    } catch (error) {
      api.setStatus(error?.message || "Gallery project could not be opened.");
    }
  }

  async function remove(item) {
    try {
      await window.pixelBug.deleteStoredProject(STORE_KIND, item.id);
      api.setStatus("Gallery project removed.");
      await loadItems();
    } catch (error) {
      api.setStatus(error?.message || "Gallery project could not be removed.");
    }
  }

  function renderCard(item) {
    const card = document.createElement("article");
    card.className = "project-card";
    const titleId = `project-gallery-card-${String(item.id || "item").replace(/[^a-z0-9-]/gi, "-")}`;
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
    actions.append(makeButton("Open", `Open ${title.textContent}`, () => restore(item)), makeButton("Delete", `Delete ${title.textContent}`, () => remove(item)));
    body.append(title, meta, actions);
    card.append(img, body);
    return card;
  }

  function render() {
    if (!list || !api) return;
    list.innerHTML = "";
    list.setAttribute("aria-busy", String(!loaded));
    if (!loaded) {
      const loading = document.createElement("p");
      loading.className = "modal-note";
      loading.textContent = "Loading gallery projects…";
      list.appendChild(loading);
      return;
    }
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "modal-note";
      empty.textContent = "No gallery projects yet. Save the current project to create the first gallery card.";
      list.appendChild(empty);
      return;
    }
    items.forEach(item => list.appendChild(renderCard(item)));
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<section class="modal-card project-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="project-gallery-title" aria-describedby="project-gallery-description"><div class="modal-head"><h2 id="project-gallery-title">Project Gallery</h2><button id="project-gallery-close" class="mini-square-btn" type="button" aria-label="Close project gallery">×</button></div><p id="project-gallery-description" class="modal-note">Gallery projects are stored locally on this device until you delete them.</p><div class="button-row"><button id="project-gallery-save-current" type="button">Save Current<span class="sr-only"> project to gallery</span></button></div><div id="project-gallery-list" class="project-gallery-list" aria-live="polite"></div></section>`;
    document.body.appendChild(overlay);
    list = overlay.querySelector("#project-gallery-list");
    modalController = window.PixelBugModalAccess?.createController?.({ overlay, trigger: document.getElementById("project-gallery-btn"), closeButton: overlay.querySelector("#project-gallery-close") });
    overlay.addEventListener("click", event => { if (event.target === overlay) close(); });
    overlay.querySelector("#project-gallery-close")?.addEventListener("click", close);
    overlay.querySelector("#project-gallery-save-current")?.addEventListener("click", saveCurrent);
  }

  function mount(nextApi) {
    api = nextApi;
    const button = document.getElementById("project-gallery-btn");
    if (button && !button.dataset.galleryReady) {
      button.dataset.galleryReady = "true";
      button.addEventListener("click", open);
    }
  }

  function refresh() {
    if (overlay && !overlay.hidden) loadItems();
  }

  window.PixelBugProjectGallery = { mount, refresh };
  if (window.PixelBugAppApi) try { mount(window.PixelBugAppApi); } catch (err) { console.error(err); }
})();
