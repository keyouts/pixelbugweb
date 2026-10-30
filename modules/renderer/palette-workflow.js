(() => {
  function create(options) {
    const {
      WorkflowFeatures,
      SpritesheetTools,
      pushHistory,
      getState,
      maxPalettePresets,
      maxProjectFrames,
      maxImportFileBytes,
      maxImageSourcePixels,
      activePreset,
      projectWidth,
      projectHeight,
      renderAll,
      setStatus,
      freshProject,
      blankPixels,
      rgbToHex,
      newLayer,
      setLayerSource,
      createProjectDocument,
      closeExportModal
    } = options;
    let pendingSpritesheetFile = null;

    function importPaletteFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => setStatus("Palette file could not be read.");
      reader.onload = () => {
        const state = getState();
        const colors = WorkflowFeatures.parsePaletteText(reader.result);
        if (!colors.length) return setStatus("No valid palette colors were found.");
        pushHistory();
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 48) || "Imported";
        state.palettePresets.push({ name, colors });
        state.palettePresets = state.palettePresets.slice(0, maxPalettePresets);
        state.activePalettePreset = state.palettePresets.length - 1;
        state.palette = state.palettePresets[state.activePalettePreset].colors;
        renderAll();
        setStatus(`${colors.length} colors imported into ${name}.`);
      };
      reader.readAsText(file);
    }

    async function exportPaletteGpl() {
      const preset = activePreset();
      const name = WorkflowFeatures.safeFilename(preset.name || "pixel-bug-palette");
      const result = await window.pixelBug.saveFile({ title: "Export GPL Palette", defaultPath: `${name}.gpl`, filters: [{ name: "GIMP Palette", extensions: ["gpl"] }], data: WorkflowFeatures.paletteToGpl(preset.name, preset.colors), encoding: "utf8" });
      setStatus(result.ok ? "GPL palette exported." : "Palette export cancelled.");
    }

    async function exportPaletteText() {
      const preset = activePreset();
      const name = WorkflowFeatures.safeFilename(preset.name || "pixel-bug-palette");
      const result = await window.pixelBug.saveFile({ title: "Export Text Palette", defaultPath: `${name}.txt`, filters: [{ name: "Text Palette", extensions: ["txt"] }], data: WorkflowFeatures.paletteToText(preset.colors), encoding: "utf8" });
      setStatus(result.ok ? "Text palette exported." : "Palette export cancelled.");
    }

    function imageFileToElement(file, message = "Image could not be loaded.") {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(message)); };
        image.src = url;
      });
    }

    function validateImportFile(file, label = "File") {
      if (!file) throw new Error(`Choose a ${label.toLowerCase()} first.`);
      if (Number(file.size) > maxImportFileBytes) throw new Error(`${label} is too large to import safely.`);
    }

    function validateImageFile(file) { validateImportFile(file, "Image file"); }

    function imageDimensions(image) {
      const width = Math.max(1, Number(image.naturalWidth || image.width) || 1);
      const height = Math.max(1, Number(image.naturalHeight || image.height) || 1);
      if (width * height > maxImageSourcePixels) throw new Error("Image dimensions exceed the safe import limit.");
      return { width, height };
    }

    function imageToPixels(sourceContext, sourceX, sourceY, width, height) {
      const pixels = blankPixels(width, height);
      const imageData = sourceContext.getImageData(sourceX, sourceY, width, height).data;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        if (imageData[offset + 3] < 20) continue;
        pixels[y][x] = rgbToHex(imageData[offset], imageData[offset + 1], imageData[offset + 2]);
      }
      return pixels;
    }

    async function importSpriteAtlas(fileList) {
      const files = [...(fileList || [])];
      const jsonFile = files.find(file => /\.json$/i.test(file.name) || file.type === "application/json");
      const imageFile = files.find(file => /\.png$/i.test(file.name) || file.type === "image/png");
      if (!jsonFile || !imageFile) return setStatus("Choose one PNG spritesheet and one JSON atlas together.");
      try {
        validateImportFile(jsonFile, "Atlas JSON");
        validateImageFile(imageFile);
        const atlas = JSON.parse(await jsonFile.text());
        const records = WorkflowFeatures.atlasFrameRecords(atlas);
        if (!records.length) throw new Error("The atlas does not contain frames.");
        if (records.length > maxProjectFrames) throw new Error(`Atlas contains ${records.length} frames; the project limit is ${maxProjectFrames}.`);
        if (records.some(record => record.rotated)) throw new Error("Rotated atlas frames are not supported.");
        const atlasScale = Math.max(1, Math.min(Number(atlas.meta?.scale) || 1, 16));
        const image = await imageFileToElement(imageFile, "Atlas image could not be loaded.");
        const dimensions = imageDimensions(image);
        const width = Math.max(...records.map(record => record.sourceSize.w));
        const height = Math.max(...records.map(record => record.sourceSize.h));
        const imported = freshProject(width, height);
        imported.name = jsonFile.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Imported Atlas";
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = dimensions.width;
        sourceCanvas.height = dimensions.height;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        sourceContext.drawImage(image, 0, 0);
        imported.frames = records.map(record => {
          if (record.frame.x < 0 || record.frame.y < 0 || record.frame.x + record.frame.w > dimensions.width || record.frame.y + record.frame.h > dimensions.height) throw new Error("Atlas frame lies outside the spritesheet image.");
          const framePixels = blankPixels(width, height);
          const imageData = sourceContext.getImageData(record.frame.x, record.frame.y, record.frame.w, record.frame.h).data;
          const outputWidth = Math.min(record.spriteSourceSize.w, Math.max(1, Math.round(record.frame.w / atlasScale)));
          const outputHeight = Math.min(record.spriteSourceSize.h, Math.max(1, Math.round(record.frame.h / atlasScale)));
          for (let y = 0; y < outputHeight; y++) for (let x = 0; x < outputWidth; x++) {
            const sourceX = Math.min(record.frame.w - 1, Math.floor((x + 0.5) * record.frame.w / outputWidth));
            const sourceY = Math.min(record.frame.h - 1, Math.floor((y + 0.5) * record.frame.h / outputHeight));
            const offset = (sourceY * record.frame.w + sourceX) * 4;
            if (imageData[offset + 3] < 20) continue;
            const targetX = record.spriteSourceSize.x + x;
            const targetY = record.spriteSourceSize.y + y;
            if (targetX >= 0 && targetY >= 0 && targetX < width && targetY < height) framePixels[targetY][targetX] = rgbToHex(imageData[offset], imageData[offset + 1], imageData[offset + 2]);
          }
          const importedLayer = newLayer(width, "Layer 1", height);
          importedLayer.pixels = framePixels;
          setLayerSource(importedLayer, width, height);
          return { duration: record.duration, tag: record.name.replace(/\.[^.]+$/, "").slice(0, 32), layers: [importedLayer] };
        });
        imported.animation = { activeClipId: "clip-main", clips: [{ id: "clip-main", name: atlas.meta?.frameTags?.[0]?.name || "Main", start: 0, end: imported.frames.length - 1, loop: atlas.meta?.frameTags?.[0]?.direction === "pingpong" ? "pingpong" : "loop" }] };
        createProjectDocument(imported, imported.name, "", { clean: false });
        closeExportModal();
        setStatus(`${imported.frames.length} atlas frames imported into a new project tab.`);
      } catch (error) {
        setStatus(error?.message || "Atlas import failed.");
      }
    }

    function spritesheetControls() {
      return {
        overlay: document.querySelector("#spritesheet-import-overlay"),
        input: document.querySelector("#spritesheet-import-input"),
        width: document.querySelector("#spritesheet-cell-width"),
        height: document.querySelector("#spritesheet-cell-height"),
        margin: document.querySelector("#spritesheet-margin"),
        spacing: document.querySelector("#spritesheet-spacing"),
        order: document.querySelector("#spritesheet-order"),
        status: document.querySelector("#spritesheet-import-status")
      };
    }

    function closeSpritesheetImport() {
      const controls = spritesheetControls();
      if (controls.overlay) controls.overlay.hidden = true;
      pendingSpritesheetFile = null;
      if (controls.input) controls.input.value = "";
    }

    async function openSpritesheetImport(file) {
      const controls = spritesheetControls();
      try {
        validateImageFile(file);
        const image = await imageFileToElement(file, "Spritesheet image could not be loaded.");
        const dimensions = imageDimensions(image);
        pendingSpritesheetFile = file;
        if (controls.width) controls.width.value = String(Math.min(512, Math.max(1, projectWidth())));
        if (controls.height) controls.height.value = String(Math.min(512, Math.max(1, projectHeight())));
        if (controls.status) controls.status.textContent = `${file.name} · ${dimensions.width} × ${dimensions.height} pixels`;
        closeExportModal();
        if (controls.overlay) controls.overlay.hidden = false;
        document.querySelector("#spritesheet-cell-width")?.focus();
      } catch (error) {
        if (controls.input) controls.input.value = "";
        setStatus(error?.message || "Spritesheet import failed.");
      }
    }

    async function applySpritesheetImport() {
      const controls = spritesheetControls();
      try {
        validateImageFile(pendingSpritesheetFile);
        const image = await imageFileToElement(pendingSpritesheetFile, "Spritesheet image could not be loaded.");
        const dimensions = imageDimensions(image);
        const layout = SpritesheetTools.layout(dimensions.width, dimensions.height, {
          cellWidth: Number(controls.width?.value),
          cellHeight: Number(controls.height?.value),
          margin: Number(controls.margin?.value),
          spacing: Number(controls.spacing?.value),
          order: controls.order?.value
        }, maxProjectFrames);
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = dimensions.width;
        sourceCanvas.height = dimensions.height;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        sourceContext.drawImage(image, 0, 0);
        const imported = freshProject(layout.cellWidth, layout.cellHeight);
        imported.name = pendingSpritesheetFile.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Imported Spritesheet";
        imported.frames = layout.cells.map((cell, index) => {
          const importedLayer = newLayer(layout.cellWidth, "Layer 1", layout.cellHeight);
          importedLayer.pixels = imageToPixels(sourceContext, cell.x, cell.y, layout.cellWidth, layout.cellHeight);
          setLayerSource(importedLayer, layout.cellWidth, layout.cellHeight);
          return { duration: 100, tag: `Frame ${index + 1}`, layers: [importedLayer] };
        });
        imported.animation = { activeClipId: "clip-main", clips: [{ id: "clip-main", name: "Main", start: 0, end: imported.frames.length - 1, loop: "loop" }] };
        createProjectDocument(imported, imported.name, "", { clean: false });
        closeSpritesheetImport();
        setStatus(`${layout.total} spritesheet frames imported from a ${layout.columns} × ${layout.rows} grid.`);
      } catch (error) {
        if (controls.status) controls.status.textContent = error?.message || "Spritesheet import failed.";
        setStatus(error?.message || "Spritesheet import failed.");
      }
    }

    function setup() {
      document.querySelector("#atlas-import-input")?.addEventListener("change", event => importSpriteAtlas(event.target.files));
      document.querySelector("#spritesheet-import-input")?.addEventListener("change", event => openSpritesheetImport(event.target.files?.[0]));
      document.querySelector("#apply-spritesheet-import-btn")?.addEventListener("click", applySpritesheetImport);
      document.querySelector("#close-spritesheet-import-btn")?.addEventListener("click", closeSpritesheetImport);
      document.querySelector("#cancel-spritesheet-import-btn")?.addEventListener("click", closeSpritesheetImport);
      document.querySelector("#spritesheet-import-overlay")?.addEventListener("click", event => { if (event.target === event.currentTarget) closeSpritesheetImport(); });
      document.addEventListener("keydown", event => {
        const overlay = document.querySelector("#spritesheet-import-overlay");
        if (event.key !== "Escape" || !overlay || overlay.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        closeSpritesheetImport();
      });
      document.querySelector("#palette-import-btn")?.addEventListener("click", () => document.querySelector("#palette-import-input")?.click());
      document.querySelector("#palette-import-input")?.addEventListener("change", event => importPaletteFile(event.target.files?.[0]));
      document.querySelector("#palette-export-gpl-btn")?.addEventListener("click", exportPaletteGpl);
      document.querySelector("#palette-export-text-btn")?.addEventListener("click", exportPaletteText);
    }

    return Object.freeze({ applySpritesheetImport, importSpriteAtlas, openSpritesheetImport, setup });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPaletteWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
