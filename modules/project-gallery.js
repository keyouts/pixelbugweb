// Gallery module
(() => {
  const KEY = "pixel-bug-project-gallery-v1";
  let api = null;
  let overlay = null;
  let list = null;

  function loadItems() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter(item => item && item.project); }
    catch (_err) { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 24)));
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
    overlay.hidden = true;
    document.getElementById("project-gallery-btn")?.setAttribute("aria-expanded", "false");
  }

  function open() {
    build();
    render();
    overlay.hidden = false;
    document.getElementById("project-gallery-btn")?.setAttribute("aria-expanded", "true");
    overlay.querySelector("button")?.focus();
  }

  function saveCurrent() {
    const project = api.cloneProject();
    const id = api.getProjectId();
    const items = loadItems().filter(item => item.projectId !== id);
    items.unshift({ projectId: id, name: project.name || "Untitled Project", savedAt: Date.now(), thumbnail: api.makeThumbnail(project), meta: api.projectMeta(project), project });
    saveItems(items);
    api.setStatus("Project saved to gallery.");
    render();
  }

  function restore(item) {
    if (api.restoreProject(item.project, "Gallery project restored.")) close();
  }

  function remove(item) {
    saveItems(loadItems().filter(next => next.savedAt !== item.savedAt));
    api.setStatus("Gallery project removed.");
    render();
  }

  function renderCard(item) {
    const card = document.createElement("article");
    card.className = "project-card";
    const img = document.createElement("img");
    img.alt = "";
    img.src = item.thumbnail || api.makeThumbnail(item.project);
    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = item.name || "Untitled Project";
    const meta = document.createElement("p");
    meta.textContent = `${item.meta || api.projectMeta(item.project)} · ${new Date(item.savedAt || Date.now()).toLocaleString()}`;
    const actions = document.createElement("div");
    actions.className = "project-card-actions";
    actions.append(makeButton("Open", `Open ${title.textContent}`, () => restore(item)), makeButton("Delete", `Delete ${title.textContent}`, () => remove(item)));
    body.append(title, meta, actions);
    card.append(img, body);
    return card;
  }

  function render() {
    if (!list || !api) return;
    const items = loadItems();
    list.innerHTML = "";
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
    overlay.innerHTML = `<section class="modal-card project-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="project-gallery-title"><div class="modal-head"><h2 id="project-gallery-title">Project Gallery</h2><button id="project-gallery-close" class="mini-square-btn" type="button" aria-label="Close project gallery">×</button></div><p class="modal-note">Local gallery cards stay on this device until you delete them.</p><div class="button-row"><button id="project-gallery-save-current" type="button">Save Current<span class="sr-only"> project to gallery</span></button></div><div id="project-gallery-list" class="project-gallery-list" aria-live="polite"></div></section>`;
    document.body.appendChild(overlay);
    list = overlay.querySelector("#project-gallery-list");
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

  window.PixelBugProjectGallery = { mount, refresh: render };
  if (window.PixelBugAppApi) try { mount(window.PixelBugAppApi); } catch (err) { console.error(err); }
})();
