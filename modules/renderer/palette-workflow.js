(() => {
  function create(options) {
    const {
      WorkflowFeatures,
      pushHistory,
      getState,
      maxPalettePresets,
      activePreset,
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

    function imageFileToElement(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Atlas image could not be loaded.")); };
        image.src = url;
      });
    }

    async function importSpriteAtlas(fileList) {
      const files = [...(fileList || [])];
      const jsonFile = files.find(file => /\.json$/i.test(file.name) || file.type === "application/json");
      const imageFile = files.find(file => /\.png$/i.test(file.name) || file.type === "image/png");
      if (!jsonFile || !imageFile) return setStatus("Choose one PNG spritesheet and one JSON atlas together.");
      try {
        const atlas = JSON.parse(await jsonFile.text());
        const records = WorkflowFeatures.atlasFrameRecords(atlas);
        if (!records.length) throw new Error("The atlas does not contain frames.");
        if (records.some(record => record.rotated)) throw new Error("Rotated atlas frames are not supported.");
        const atlasScale = Math.max(1, Math.min(Number(atlas.meta?.scale) || 1, 16));
        const image = await imageFileToElement(imageFile);
        const width = Math.max(...records.map(record => record.sourceSize.w));
        const height = Math.max(...records.map(record => record.sourceSize.h));
        const imported = freshProject(width, height);
        imported.name = jsonFile.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Imported Atlas";
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth || image.width;
        sourceCanvas.height = image.naturalHeight || image.height;
        const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        sourceContext.drawImage(image, 0, 0);
        imported.frames = records.map(record => {
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

    function setup() {
      document.querySelector("#atlas-import-input")?.addEventListener("change", event => importSpriteAtlas(event.target.files));
      document.querySelector("#palette-import-btn")?.addEventListener("click", () => document.querySelector("#palette-import-input")?.click());
      document.querySelector("#palette-import-input")?.addEventListener("change", event => importPaletteFile(event.target.files?.[0]));
      document.querySelector("#palette-export-gpl-btn")?.addEventListener("click", exportPaletteGpl);
      document.querySelector("#palette-export-text-btn")?.addEventListener("click", exportPaletteText);
    }

    return Object.freeze({ importSpriteAtlas, setup });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPaletteWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
