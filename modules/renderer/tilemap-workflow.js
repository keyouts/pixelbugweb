(() => {
  function create(options) {
    const {
      WorkflowFeatures,
      getState,
      normalizeTilemapState,
      getActiveTile,
      setActiveTileId,
      renderTilemapPanel,
      saveLocal,
      saveLocalTileLibrary,
      pushHistory,
      setStatus,
      pixelsToPreviewElement,
      pixelsToCanvas,
      canvasBackgroundColor,
      canvasGridColor,
      canvasInkColor,
      dataUrlBase64
    } = options;

    const button = document.querySelector("#tilemap-editor-btn");
    const overlay = document.querySelector("#tilemap-editor-overlay");
    const closeButton = document.querySelector("#close-tilemap-editor-btn");
    const canvas = document.querySelector("#tilemap-map-canvas");
    let cursor = { x: 0, y: 0 };
    let drawing = false;
    let drawMode = "paint";

    function activeMap() {
      const state = getState();
      state.tilemap = normalizeTilemapState(state.tilemap);
      state.tilemap.map = WorkflowFeatures.normalizeTileMap(state.tilemap.map || {});
      return state.tilemap.map;
    }

    function activeLayer() {
      const map = activeMap();
      return map.layers.find(layer => layer.id === map.activeLayerId) || map.layers[0];
    }

    function transformedTilePixels(tile, cell) {
      return WorkflowFeatures.transformSelection({ pixels: tile.pixels, mask: tile.pixels.map(row => row.map(pixel => Boolean(pixel))) }, { width: tile.w, height: tile.h, rotation: cell.rotation, flipH: cell.flipH, flipV: cell.flipV }).pixels;
    }

    function renderCanvas() {
      if (!canvas) return;
      const state = getState();
      const map = activeMap();
      const cellSize = 24;
      canvas.width = map.width * cellSize;
      canvas.height = map.height * cellSize;
      const context = canvas.getContext("2d", { alpha: false });
      context.imageSmoothingEnabled = false;
      context.fillStyle = canvasBackgroundColor();
      context.fillRect(0, 0, canvas.width, canvas.height);
      map.layers.forEach(layerRecord => {
        if (layerRecord.visible === false) return;
        layerRecord.cells.forEach((row, y) => row.forEach((cell, x) => {
          if (!cell) return;
          const tile = state.tilemap.tiles.find(item => item.id === cell.tileId);
          if (!tile) return;
          const pixels = transformedTilePixels(tile, cell);
          const pixelWidth = cellSize / Math.max(1, tile.w);
          const pixelHeight = cellSize / Math.max(1, tile.h);
          pixels.forEach((pixelRow, py) => pixelRow.forEach((pixel, px) => {
            if (!pixel) return;
            context.fillStyle = pixel;
            context.fillRect(x * cellSize + Math.floor(px * pixelWidth), y * cellSize + Math.floor(py * pixelHeight), Math.ceil(pixelWidth), Math.ceil(pixelHeight));
          }));
          if (cell.collision) {
            context.fillStyle = "rgba(255,0,0,0.22)";
            context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            context.strokeStyle = "rgba(180,0,0,0.8)";
            context.beginPath();
            context.moveTo(x * cellSize + 4, y * cellSize + 4);
            context.lineTo((x + 1) * cellSize - 4, (y + 1) * cellSize - 4);
            context.moveTo((x + 1) * cellSize - 4, y * cellSize + 4);
            context.lineTo(x * cellSize + 4, (y + 1) * cellSize - 4);
            context.stroke();
          }
        }));
      });
      context.strokeStyle = canvasGridColor(0.28);
      context.lineWidth = 1;
      for (let x = 0; x <= map.width; x++) {
        context.beginPath();
        context.moveTo(x * cellSize + 0.5, 0);
        context.lineTo(x * cellSize + 0.5, canvas.height);
        context.stroke();
      }
      for (let y = 0; y <= map.height; y++) {
        context.beginPath();
        context.moveTo(0, y * cellSize + 0.5);
        context.lineTo(canvas.width, y * cellSize + 0.5);
        context.stroke();
      }
      context.strokeStyle = canvasInkColor();
      context.lineWidth = 2;
      context.strokeRect(cursor.x * cellSize + 1, cursor.y * cellSize + 1, cellSize - 2, cellSize - 2);
    }

    function renderTileList() {
      const state = getState();
      const list = document.querySelector("#tilemap-tile-list");
      if (!list) return;
      list.innerHTML = "";
      if (!state.tilemap.tiles.length) {
        const empty = document.createElement("p");
        empty.className = "modal-note tilemap-empty-note";
        empty.textContent = "No saved tiles. Save a selection as a tile in the main editor.";
        list.appendChild(empty);
        return;
      }
      state.tilemap.tiles.forEach(tile => {
        const tileButton = document.createElement("button");
        tileButton.type = "button";
        tileButton.className = "tilemap-tile-option";
        tileButton.setAttribute("role", "option");
        tileButton.setAttribute("aria-selected", String(tile.id === state.tilemap.activeTileId));
        tileButton.setAttribute("aria-label", `Select ${tile.name}, ${tile.w} by ${tile.h} pixels`);
        const preview = pixelsToPreviewElement(tile.pixels, tile.w, tile.h);
        preview.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = tile.name;
        const size = document.createElement("small");
        size.textContent = `${tile.w} × ${tile.h}`;
        copy.append(name, size);
        tileButton.append(preview, copy);
        tileButton.onclick = () => {
          setActiveTileId(tile.id);
          renderTilemapPanel();
          renderTileList();
          saveLocal();
          canvas?.focus();
        };
        list.appendChild(tileButton);
      });
    }

    function renderControls() {
      const map = activeMap();
      const widthInput = document.querySelector("#tilemap-map-width");
      const heightInput = document.querySelector("#tilemap-map-height");
      if (widthInput) widthInput.value = String(map.width);
      if (heightInput) heightInput.value = String(map.height);
      const layerSelect = document.querySelector("#tilemap-layer-select");
      if (layerSelect) {
        layerSelect.innerHTML = "";
        map.layers.forEach(layerRecord => {
          const option = document.createElement("option");
          option.value = layerRecord.id;
          option.textContent = layerRecord.name;
          option.selected = layerRecord.id === map.activeLayerId;
          layerSelect.appendChild(option);
        });
      }
      const visibleInput = document.querySelector("#tilemap-layer-visible");
      if (visibleInput) visibleInput.checked = activeLayer().visible !== false;
      cursor.x = Math.max(0, Math.min(cursor.x, map.width - 1));
      cursor.y = Math.max(0, Math.min(cursor.y, map.height - 1));
      renderTileList();
      renderCanvas();
    }

    function open() {
      if (!overlay) return;
      activeMap();
      overlay.hidden = false;
      button?.setAttribute("aria-expanded", "true");
      renderControls();
      canvas?.focus();
    }

    function close() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      button?.setAttribute("aria-expanded", "false");
      saveLocal();
      button?.focus();
    }

    function pointFromEvent(event) {
      const map = activeMap();
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(Math.floor((event.clientX - rect.left) * canvas.width / rect.width / 24), map.width - 1)),
        y: Math.max(0, Math.min(Math.floor((event.clientY - rect.top) * canvas.height / rect.height / 24), map.height - 1))
      };
    }

    function paintCell(x, y, mode = "paint") {
      const layerRecord = activeLayer();
      cursor = { x, y };
      if (mode === "erase") layerRecord.cells[y][x] = null;
      else {
        const tile = getActiveTile();
        if (!tile) return false;
        layerRecord.cells[y][x] = {
          tileId: tile.id,
          collision: document.querySelector("#tilemap-cell-collision")?.checked === true,
          flipH: document.querySelector("#tilemap-cell-flip-h")?.checked === true,
          flipV: document.querySelector("#tilemap-cell-flip-v")?.checked === true,
          rotation: Number(document.querySelector("#tilemap-cell-rotation")?.value) || 0
        };
      }
      renderCanvas();
      return true;
    }

    function addLayer() {
      const map = activeMap();
      if (map.layers.length >= 24) return setStatus("The tile map layer limit was reached.");
      pushHistory();
      const layerRecord = WorkflowFeatures.normalizeTileMap({ width: map.width, height: map.height, layers: [{ id: WorkflowFeatures.uid("map-layer"), name: `Layer ${map.layers.length + 1}` }] }).layers[0];
      map.layers.push(layerRecord);
      map.activeLayerId = layerRecord.id;
      renderControls();
      saveLocal();
    }

    function deleteLayer() {
      const map = activeMap();
      if (map.layers.length <= 1) return setStatus("At least one tile map layer is required.");
      pushHistory();
      map.layers = map.layers.filter(layerRecord => layerRecord.id !== map.activeLayerId);
      map.activeLayerId = map.layers[0].id;
      renderControls();
      saveLocal();
    }

    function resizeMap() {
      const state = getState();
      pushHistory();
      state.tilemap.map = WorkflowFeatures.resizeTileMap(activeMap(), document.querySelector("#tilemap-map-width")?.value, document.querySelector("#tilemap-map-height")?.value);
      renderControls();
      saveLocal();
      setStatus(`Tile map resized to ${state.tilemap.map.width} × ${state.tilemap.map.height}.`);
    }

    function clearLayer() {
      pushHistory();
      const map = activeMap();
      activeLayer().cells = Array.from({ length: map.height }, () => Array.from({ length: map.width }, () => null));
      renderCanvas();
      saveLocal();
      setStatus("Tile map layer cleared.");
    }

    function buildTileSetCanvas(map, tiles, columns) {
      const rows = Math.max(1, Math.ceil(Math.max(1, tiles.length) / columns));
      const output = document.createElement("canvas");
      output.width = columns * map.cellWidth;
      output.height = rows * map.cellHeight;
      const context = output.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      tiles.forEach((tile, index) => {
        const source = pixelsToCanvas(tile.pixels, 1);
        const scale = Math.min(map.cellWidth / Math.max(1, tile.w), map.cellHeight / Math.max(1, tile.h));
        const width = Math.max(1, Math.round(tile.w * scale));
        const height = Math.max(1, Math.round(tile.h * scale));
        const cellX = (index % columns) * map.cellWidth;
        const cellY = Math.floor(index / columns) * map.cellHeight;
        const x = cellX + Math.floor((map.cellWidth - width) / 2);
        const y = cellY + Math.floor((map.cellHeight - height) / 2);
        context.drawImage(source, x, y, width, height);
      });
      return output;
    }

    async function exportJson() {
      const state = getState();
      const map = activeMap();
      const baseName = WorkflowFeatures.safeFilename(state.name || "pixel-bug-map");
      const tiles = state.tilemap.tiles;
      const columns = Math.max(1, Math.min(16, tiles.length || 1));
      const tileImageName = `${baseName}-tiles.png`;
      const data = WorkflowFeatures.tileMapToTiled(map, tiles, state.name || "Pixel Bug Map", { image: tiles.length ? tileImageName : "", columns });
      const extraFiles = tiles.length ? [{ filename: tileImageName, data: dataUrlBase64(buildTileSetCanvas(map, tiles, columns).toDataURL("image/png")), encoding: "base64" }] : [];
      const result = await window.pixelBug.saveFile({ title: "Export Tiled JSON", defaultPath: `${baseName}.tmj`, filters: [{ name: "Tiled JSON Map", extensions: ["tmj", "json"] }], data: JSON.stringify(data, null, 2), encoding: "utf8", extraFiles });
      setStatus(result.ok ? tiles.length ? "Tiled JSON map and tileset exported." : "Tiled JSON map exported." : "Map export cancelled.");
    }

    async function importJson(file) {
      if (!file) return;
      const state = getState();
      try {
        const parsed = JSON.parse(await file.text());
        pushHistory();
        const importedTiles = WorkflowFeatures.tilesFromTiled(parsed);
        if (importedTiles.length) {
          const merged = new Map(state.tilemap.tiles.map(tile => [tile.id, tile]));
          importedTiles.forEach(tile => merged.set(tile.id, tile));
          state.tilemap.tiles = [...merged.values()].slice(0, 80);
          setActiveTileId(importedTiles[0].id);
          saveLocalTileLibrary();
        }
        state.tilemap.map = WorkflowFeatures.tileMapFromTiled(parsed);
        renderTilemapPanel();
        renderControls();
        saveLocal();
        setStatus(importedTiles.length ? `Tiled JSON map and ${importedTiles.length} tile${importedTiles.length === 1 ? "" : "s"} imported.` : "Tiled JSON map imported.");
      } catch (error) {
        setStatus(error?.message || "Map import failed.");
      }
    }

    function setup() {
      button?.addEventListener("click", open);
      closeButton?.addEventListener("click", close);
      overlay?.addEventListener("click", event => { if (event.target === overlay) close(); });
      document.querySelector("#tilemap-map-resize-btn")?.addEventListener("click", resizeMap);
      document.querySelector("#tilemap-layer-select")?.addEventListener("change", event => { activeMap().activeLayerId = event.target.value; renderControls(); saveLocal(); });
      document.querySelector("#tilemap-layer-add-btn")?.addEventListener("click", addLayer);
      document.querySelector("#tilemap-layer-delete-btn")?.addEventListener("click", deleteLayer);
      document.querySelector("#tilemap-layer-visible")?.addEventListener("change", event => { pushHistory(); activeLayer().visible = event.target.checked; renderCanvas(); saveLocal(); });
      document.querySelector("#tilemap-map-clear-btn")?.addEventListener("click", clearLayer);
      document.querySelector("#tilemap-map-export-btn")?.addEventListener("click", exportJson);
      document.querySelector("#tilemap-map-import-input")?.addEventListener("change", event => importJson(event.target.files?.[0]));
      canvas?.addEventListener("contextmenu", event => event.preventDefault());
      canvas?.addEventListener("pointerdown", event => {
        event.preventDefault();
        pushHistory();
        drawing = true;
        drawMode = event.button === 2 ? "erase" : "paint";
        const point = pointFromEvent(event);
        paintCell(point.x, point.y, drawMode);
        canvas.setPointerCapture?.(event.pointerId);
      });
      canvas?.addEventListener("pointermove", event => {
        if (!drawing) return;
        const point = pointFromEvent(event);
        paintCell(point.x, point.y, drawMode);
      });
      const endDraw = event => {
        if (!drawing) return;
        drawing = false;
        canvas.releasePointerCapture?.(event.pointerId);
        saveLocal();
      };
      canvas?.addEventListener("pointerup", endDraw);
      canvas?.addEventListener("pointercancel", endDraw);
      canvas?.addEventListener("keydown", event => {
        const map = activeMap();
        if (event.key === "ArrowLeft") cursor.x = Math.max(0, cursor.x - 1);
        else if (event.key === "ArrowRight") cursor.x = Math.min(map.width - 1, cursor.x + 1);
        else if (event.key === "ArrowUp") cursor.y = Math.max(0, cursor.y - 1);
        else if (event.key === "ArrowDown") cursor.y = Math.min(map.height - 1, cursor.y + 1);
        else if (["Enter", " "].includes(event.key)) { pushHistory(); paintCell(cursor.x, cursor.y, "paint"); saveLocal(); }
        else if (["Delete", "Backspace"].includes(event.key)) { pushHistory(); paintCell(cursor.x, cursor.y, "erase"); saveLocal(); }
        else return;
        event.preventDefault();
        renderCanvas();
      });
    }

    return Object.freeze({ close, open, renderControls, setup });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTilemapWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
