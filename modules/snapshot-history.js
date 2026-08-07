// Snapshot module
(() => {
  const KEY = "pixel-bug-snapshot-history-v1";
  let api = null;
  let overlay = null;
  let list = null;
  let dirty = false;

  function loadItems() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter(item => item && item.project); }
    catch (_err) { return []; }
  }

  function saveItems(items) {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, 36)));
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
    document.getElementById("snapshot-history-btn")?.setAttribute("aria-expanded", "false");
  }

  function open() {
    build();
    render();
    overlay.hidden = false;
    document.getElementById("snapshot-history-btn")?.setAttribute("aria-expanded", "true");
    overlay.querySelector("button")?.focus();
  }

  function createSnapshot() {
    const project = api.cloneProject();
    const items = loadItems();
    items.unshift({ id: `snapshot-${Date.now().toString(36)}`, name: project.name || "Untitled Project", savedAt: Date.now(), thumbnail: api.makeThumbnail(project), meta: api.projectMeta(project), project });
    saveItems(items);
    dirty = false;
    api.setStatus("Snapshot created.");
    render();
  }

  function restore(item) {
    if (api.restoreProject(item.project, "Snapshot restored.")) close();
  }

  function remove(item) {
    saveItems(loadItems().filter(next => next.id !== item.id));
    api.setStatus("Snapshot deleted.");
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
    actions.append(makeButton("Restore", `Restore ${title.textContent}`, () => restore(item)), makeButton("Delete", `Delete ${title.textContent}`, () => remove(item)));
    body.append(title, meta, actions);
    card.append(img, body);
    return card;
  }

  function render() {
    if (!list || !api) return;
    const items = loadItems();
    list.innerHTML = "";
    const note = document.createElement("p");
    note.className = "modal-note";
    note.textContent = dirty ? "Unsaved changes detected since the last snapshot." : "Create a restore point before risky edits.";
    list.appendChild(note);
    if (!items.length) return;
    items.forEach(item => list.appendChild(renderCard(item)));
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<section class="modal-card project-gallery-modal" role="dialog" aria-modal="true" aria-labelledby="snapshot-history-title"><div class="modal-head"><h2 id="snapshot-history-title">Snapshot History</h2><button id="snapshot-history-close" class="mini-square-btn" type="button" aria-label="Close snapshot history">×</button></div><p class="modal-note">Snapshots are local restore points for the current device.</p><div class="button-row"><button id="snapshot-create-current" type="button">Create Snapshot<span class="sr-only"> from current project</span></button></div><div id="snapshot-history-list" class="project-gallery-list" aria-live="polite"></div></section>`;
    document.body.appendChild(overlay);
    list = overlay.querySelector("#snapshot-history-list");
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

  window.PixelBugSnapshots = { mount, refresh: render, markDirty };
  if (window.PixelBugAppApi) try { mount(window.PixelBugAppApi); } catch (err) { console.error(err); }
})();
