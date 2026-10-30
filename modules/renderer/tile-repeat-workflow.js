(() => {
  const MAX_STAMPS = 262144;
  const DEFAULTS = Object.freeze({ enabled: false, mode: "fill", gapX: 0, gapY: 0, originX: 0, originY: 0, columns: 4, rows: 4, stagger: "straight" });

  function clampInteger(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  }

  function normalizeSettings(input = {}) {
    const value = input && typeof input === "object" ? input : {};
    return {
      enabled: value.enabled === true,
      mode: value.mode === "count" ? "count" : "fill",
      gapX: clampInteger(value.gapX, 0, 0, 256),
      gapY: clampInteger(value.gapY, 0, 0, 256),
      originX: clampInteger(value.originX, 0, -512, 512),
      originY: clampInteger(value.originY, 0, -512, 512),
      columns: clampInteger(value.columns, 4, 1, 128),
      rows: clampInteger(value.rows, 4, 1, 128),
      stagger: value.stagger === "brick" ? "brick" : "straight"
    };
  }

  // Repeat geometry
  function planRepeat(config) {
    const width = clampInteger(config.canvasWidth, 1, 1, 4096);
    const height = clampInteger(config.canvasHeight, 1, 1, 4096);
    const tileWidth = clampInteger(config.tileWidth, 1, 1, 128);
    const tileHeight = clampInteger(config.tileHeight, 1, 1, 128);
    const options = normalizeSettings(config);
    const stepX = tileWidth + options.gapX;
    const stepY = tileHeight + options.gapY;
    const fill = options.mode === "fill";
    const firstRow = fill ? Math.floor((-tileHeight - options.originY) / stepY) + 1 : 0;
    const lastRow = fill ? Math.ceil((height - options.originY) / stepY) - 1 : options.rows - 1;
    const rowCount = Math.max(0, lastRow - firstRow + 1);
    const placements = [];
    let total = 0;
    let columns = 0;
    for (let row = firstRow; row <= lastRow; row++) {
      const y = options.originY + row * stepY;
      const offset = options.stagger === "brick" && Math.abs(row % 2) === 1 ? Math.floor(stepX / 2) : 0;
      const startX = options.originX + offset;
      const firstColumn = fill ? Math.floor((-tileWidth - startX) / stepX) + 1 : 0;
      const lastColumn = fill ? Math.ceil((width - startX) / stepX) - 1 : options.columns - 1;
      columns = Math.max(columns, Math.max(0, lastColumn - firstColumn + 1));
      for (let column = firstColumn; column <= lastColumn; column++) {
        const x = startX + column * stepX;
        if (x + tileWidth <= 0 || y + tileHeight <= 0 || x >= width || y >= height) continue;
        total++;
        if (total <= MAX_STAMPS) placements.push({ x, y });
      }
      if (total > MAX_STAMPS) break;
    }
    return {
      placements: total > MAX_STAMPS ? [] : placements,
      overflow: total > MAX_STAMPS,
      visibleCount: total,
      columns,
      rows: rowCount,
      stepX,
      stepY,
      tileWidth,
      tileHeight,
      canvasWidth: width,
      canvasHeight: height
    };
  }

  function create({ getState, getTile, getCanvas, projectWidth, projectHeight, pushHistory, setPixel, renderAll, saveLocal, setStatus, getActiveLayer, clearLayerSource, selectTile, onRefresh }) {
    const byId = id => document.getElementById(id);
    const panel = byId("tile-repeat-panel");
    const toggle = byId("tile-repeat-toggle");
    const close = byId("tile-repeat-close");
    const visibility = byId("tile-repeat-overlay-enabled");
    const preview = byId("tile-repeat-preview");
    const overlay = byId("tile-repeat-overlay");
    const summary = byId("tile-repeat-summary");
    const applyButton = byId("tile-repeat-apply");
    const patternSection = byId("tile-repeat-pattern-section");
    const terrainSection = byId("tile-terrain-details");
    const patternTab = byId("tile-pattern-tab");
    const terrainTab = byId("tile-terrain-tab");
    const swatch = byId("tile-repeat-swatch");
    const sourceSelect = byId("tile-repeat-source-select");
    const ids = { mode: "tile-repeat-mode", gapX: "tile-repeat-gap-x", gapY: "tile-repeat-gap-y", originX: "tile-repeat-origin-x", originY: "tile-repeat-origin-y", columns: "tile-repeat-columns", rows: "tile-repeat-rows", stagger: "tile-repeat-stagger" };
    let open = false;
    let activeTab = "pattern";
    let currentProject = null;
    let imageCache = null;
    let planCache = null;
    let renderKey = "";
    let overlayDrawn = false;

    function settings() {
      const project = getState();
      if (!project.tilemap || typeof project.tilemap !== "object") project.tilemap = {};
      project.tilemap.repeat = normalizeSettings(project.tilemap.repeat);
      return project.tilemap.repeat;
    }

    function baseMode() {
      const classes = document.body?.classList;
      return !["print-mode", "play-mode", "voxel-mode", "mod-mode"].some(name => classes?.contains(name));
    }

    function tileCanvas(tile) {
      if (imageCache?.project === getState() && imageCache.tile === tile && imageCache.canvas) return imageCache.canvas;
      const image = document.createElement("canvas");
      image.width = tile.w;
      image.height = tile.h;
      const context = image.getContext("2d");
      for (let y = 0; y < tile.h; y++) for (let x = 0; x < tile.w; x++) {
        const color = tile.pixels[y]?.[x];
        if (color) { context.fillStyle = color; context.fillRect(x, y, 1, 1); }
      }
      imageCache = { project: getState(), tile, canvas: image };
      return image;
    }

    function drawSwatch(tile) {
      const context = swatch.getContext("2d");
      context.clearRect(0, 0, swatch.width, swatch.height);
      if (!tile) return;
      context.imageSmoothingEnabled = false;
      const image = tileCanvas(tile);
      const scale = Math.min((swatch.width - 10) / image.width, (swatch.height - 10) / image.height);
      context.drawImage(image, (swatch.width - image.width * scale) / 2, (swatch.height - image.height * scale) / 2, image.width * scale, image.height * scale);
    }

    function drawPreview(tile, options) {
      const context = preview.getContext("2d");
      context.clearRect(0, 0, preview.width, preview.height);
      if (!tile) return;
      const columns = options.mode === "count" ? Math.min(4, options.columns) : 4;
      const rows = options.mode === "count" ? Math.min(3, options.rows) : 3;
      const stepX = tile.w + options.gapX;
      const stepY = tile.h + options.gapY;
      const shift = options.stagger === "brick" ? Math.floor(stepX / 2) : 0;
      const sampleWidth = (columns - 1) * stepX + tile.w + (rows > 1 ? shift : 0);
      const sampleHeight = (rows - 1) * stepY + tile.h;
      const scale = Math.min((preview.width - 24) / sampleWidth, (preview.height - 24) / sampleHeight);
      const originX = (preview.width - sampleWidth * scale) / 2;
      const originY = (preview.height - sampleHeight * scale) / 2;
      context.imageSmoothingEnabled = false;
      const image = tileCanvas(tile);
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 === 1 ? shift : 0;
        for (let col = 0; col < columns; col++) {
          context.drawImage(image, originX + (col * stepX + offset) * scale, originY + row * stepY * scale, tile.w * scale, tile.h * scale);
        }
      }
    }

    function currentPlan(tile) {
      const options = settings();
      const key = [projectWidth(), projectHeight(), tile.id, tile.w, tile.h,
        options.mode, options.gapX, options.gapY, options.originX, options.originY,
        options.columns, options.rows, options.stagger].join(":");
      if (planCache?.project === getState() && planCache.tile === tile && planCache.key === key) return planCache.plan;
      const plan = planRepeat({ ...options, canvasWidth: projectWidth(), canvasHeight: projectHeight(), tileWidth: tile.w, tileHeight: tile.h });
      planCache = { key, project: getState(), tile, plan };
      return plan;
    }

    function clearOverlay() {
      renderKey = "";
      if (overlayDrawn) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
      overlayDrawn = false;
      overlay.hidden = true;
    }

    function syncSourceTiles() {
      const tilemap = getState().tilemap || {};
      const tiles = tilemap.tiles || [];
      const active = tilemap.activeTileId || "";
      if (sourceSelect.options?.length !== tiles.length || [...sourceSelect.options].some((option, index) => option.value !== tiles[index]?.id)) {
        sourceSelect.replaceChildren();
        if (!tiles.length) {
          const option = document.createElement("option"); option.value = ""; option.textContent = "No saved tiles";
          sourceSelect.appendChild(option);
        } else tiles.forEach(tile => {
          const option = document.createElement("option");
          option.value = tile.id;
          option.textContent = tile.name;
          sourceSelect.appendChild(option);
        });
      }
      sourceSelect.value = active;
    }

    function refresh() {
      const options = settings();
      if (currentProject !== getState()) {
        currentProject = getState(); imageCache = null; planCache = null; renderKey = "";
        if (!open) options.enabled = false;
      }
      panel.hidden = !open;
      patternSection.hidden = activeTab !== "pattern";
      terrainSection.hidden = activeTab !== "terrain";
      patternTab.setAttribute("aria-selected", String(activeTab === "pattern"));
      terrainTab.setAttribute("aria-selected", String(activeTab === "terrain"));
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-pressed", String(open));
      visibility.checked = options.enabled;
      syncSourceTiles();
      for (const [key, id] of Object.entries(ids)) {
        const input = byId(id);
        if (input && document.activeElement !== input) input.value = String(options[key]);
      }
      document.querySelectorAll(".tile-repeat-count-field").forEach(field => { field.hidden = options.mode !== "count"; });
      const tile = getTile();
      byId("tile-repeat-source-size").textContent = tile ? `${tile.w} × ${tile.h} pixels` : "Save a selection with Tilemap → Save Sel Tile.";
      applyButton.disabled = !tile;
      if (open) { drawSwatch(tile); drawPreview(tile, options); }
      render();
      onRefresh?.();
    }

    function render() {
      if (!baseMode()) {
        if (open) {
          open = false;
          panel.hidden = true;
          toggle.setAttribute("aria-expanded", "false");
          toggle.setAttribute("aria-pressed", "false");
          settings().enabled = false;
        }
        return clearOverlay();
      }
      if (!open || activeTab !== "pattern") return clearOverlay();
      const tile = getTile();
      if (!tile) {
        summary.textContent = "Save a selection as a tile in the Tilemap tools to begin.";
        applyButton.disabled = true;
        return clearOverlay();
      }
      const options = settings();
      const plan = currentPlan(tile);
      summary.textContent = plan.overflow
        ? `Over ${MAX_STAMPS.toLocaleString()} tiles. Increase tile size or gaps.`
        : `${plan.visibleCount.toLocaleString()} visible tile${plan.visibleCount === 1 ? "" : "s"} · ${plan.columns} columns × ${plan.rows} rows · step ${plan.stepX} × ${plan.stepY} px`;
      applyButton.disabled = plan.overflow || !plan.visibleCount || !tile.pixels.some(row => row?.some(Boolean));
      if (!options.enabled || plan.overflow) return clearOverlay();

      const canvas = getCanvas();
      const left = canvas.offsetLeft + canvas.clientLeft;
      const top = canvas.offsetTop + canvas.clientTop;
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`;
      overlay.style.width = `${canvas.width}px`;
      overlay.style.height = `${canvas.height}px`;
      overlay.hidden = false;
      const key = [canvas.width, canvas.height, getState() === currentProject,
        tile.id, tile.w, tile.h, ...Object.values(options), document.documentElement.dataset.theme].join(":");
      if (key === renderKey) return;
      renderKey = key;
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlayDrawn = true;
      const context = overlay.getContext("2d");
      const scaleX = overlay.width / projectWidth();
      const scaleY = overlay.height / projectHeight();
      const image = tileCanvas(tile);
      context.imageSmoothingEnabled = false;
      context.globalAlpha = .74;
      if (options.mode === "fill" && plan.placements.length > 1800 && plan.stepX * scaleX <= 4096 && plan.stepY * scaleY <= 2048) {
        const block = document.createElement("canvas");
        block.width = Math.max(1, Math.round(plan.stepX * scaleX));
        block.height = Math.max(1, Math.round(plan.stepY * scaleY)) * (options.stagger === "brick" ? 2 : 1);
        const bctx = block.getContext("2d");
        bctx.imageSmoothingEnabled = false;
        bctx.drawImage(image, 0, 0, tile.w * scaleX, tile.h * scaleY);
        if (options.stagger === "brick") {
          const offset = Math.floor(plan.stepX / 2) * scaleX;
          const y = plan.stepY * scaleY;
          bctx.drawImage(image, offset, y, tile.w * scaleX, tile.h * scaleY);
          if (offset + tile.w * scaleX > block.width) bctx.drawImage(image, offset - block.width, y, tile.w * scaleX, tile.h * scaleY);
        }
        context.save();
        context.translate(options.originX * scaleX, options.originY * scaleY);
        context.fillStyle = context.createPattern(block, "repeat");
        context.fillRect(-options.originX * scaleX, -options.originY * scaleY, overlay.width, overlay.height);
        context.restore();
      } else {
        for (const position of plan.placements) {
          context.drawImage(image, position.x * scaleX, position.y * scaleY, tile.w * scaleX, tile.h * scaleY);
        }
      }
      context.globalAlpha = 1;
      if (plan.placements.length <= 320) {
        context.save();
        context.lineWidth = 1;
        context.strokeStyle = document.documentElement.dataset.theme === "dark" ? "rgba(141,240,220,.85)" : "rgba(9,105,129,.85)";
        context.setLineDash([5, 4]);
        for (const { x, y } of plan.placements) {
          context.strokeRect(x * scaleX + .5, y * scaleY + .5, tile.w * scaleX - 1, tile.h * scaleY - 1);
        }
        context.restore();
      }
    }

    function setTab(tab) {
      activeTab = tab === "terrain" ? "terrain" : "pattern";
      refresh();
    }

    function setOpen(value) {
      open = Boolean(value);
      const options = settings();
      options.enabled = open;
      getState().tilemap.repeat = options;
      refresh();
      if (open) close.focus(); else toggle.focus();
    }

    function change(key, value) {
      const options = settings();
      options[key] = value;
      getState().tilemap.repeat = normalizeSettings(options);
      renderKey = "";
      refresh();
      saveLocal();
    }

    function apply() {
      const tile = getTile();
      if (!open || !tile) return setStatus("Open Tile Repeat and choose a saved tile.");
      const plan = currentPlan(tile);
      if (plan.overflow) return setStatus(`Too many stamps (limit ${MAX_STAMPS.toLocaleString()}). Adjust the pattern.`);
      if (!plan.visibleCount) return setStatus("No tiles intersect the canvas.");
      if (getActiveLayer()?.visible === false) return setStatus("Make the active layer visible before applying a pattern.");
      const pixels = [];
      for (let y = 0; y < tile.h; y++) for (let x = 0; x < tile.w; x++) {
        const color = tile.pixels[y]?.[x];
        if (color) pixels.push({ x, y, color });
      }
      if (!pixels.length) return setStatus("This tile is empty. Choose one containing painted pixels.");
      pushHistory();
      clearLayerSource();
      let changed = 0;
      for (const origin of plan.placements) for (const pixel of pixels) {
        if (setPixel(origin.x + pixel.x, origin.y + pixel.y, pixel.color)) changed++;
      }
      const options = settings();
      options.enabled = false;
      getState().tilemap.repeat = options;
      refresh();
      renderAll();
      setStatus(changed ? `Applied ${plan.visibleCount.toLocaleString()} tiles to the active layer · Undo available.` : "Pattern already matches the artwork.");
    }

    function setup() {
      toggle.addEventListener("click", () => setOpen(!open));
      patternTab.addEventListener("click", () => setTab("pattern"));
      terrainTab.addEventListener("click", () => setTab("terrain"));
      close.addEventListener("click", () => setOpen(false));
      panel.addEventListener("keydown", event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } });
      visibility.addEventListener("change", event => change("enabled", event.target.checked));
      sourceSelect.addEventListener("change", event => { selectTile(event.target.value); refresh(); });
      for (const [key, id] of Object.entries(ids)) {
        byId(id).addEventListener("change", event => change(key, event.target.value));
      }
      byId("tile-repeat-reset").addEventListener("click", () => {
        const options = settings();
        options.originX = 0; options.originY = 0;
        getState().tilemap.repeat = options;
        renderKey = ""; refresh(); saveLocal();
      });
      applyButton.addEventListener("click", apply);
      refresh();
    }

    return Object.freeze({ setup, refresh, render, apply, clearOverlay });
  }

  const api = Object.freeze({ create, normalizeSettings, planRepeat, MAX_STAMPS });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTileRepeatWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
