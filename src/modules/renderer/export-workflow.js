(() => {
  const EXPORT_PROFILE_STORAGE_KEY = "pixelbug-export-profiles-v1";

  function create(options) {
    const {
      WorkflowFeatures,
      EditorFeatures,
      activeAnimationClip,
      animationFrameEntriesForExport,
      animationFramesForExport,
      flattenedPixels,
      frame,
      projectWidth,
      projectHeight,
      pixelsToCanvas,
      dataUrlBase64,
      encodeGif,
      bytesToBase64,
      base64ToBytes,
      writeUint32,
      makePngChunk,
      saveBase64,
      serializeProject,
      setStatus,
      closeExportModal,
      runExportAction
    } = options;

    const sheetScaleInput = document.querySelector("#sheet-scale");
    const sheetColumnsInput = document.querySelector("#sheet-columns");
    const sheetPaddingInput = document.querySelector("#sheet-padding");
    const sheetMarginInput = document.querySelector("#sheet-margin");
    const sheetTrimInput = document.querySelector("#sheet-trim");
    const sheetJsonInput = document.querySelector("#sheet-json");
    const sheetNameTemplateInput = document.querySelector("#sheet-name-template");
    let exportProfiles = loadProfiles();
    let activeProfileId = exportProfiles[0]?.id || "";

    function loadProfiles() {
      try {
        const saved = JSON.parse(localStorage.getItem(EXPORT_PROFILE_STORAGE_KEY) || "[]");
        if (Array.isArray(saved) && saved.length) return saved.slice(0, 24).map(WorkflowFeatures.normalizeExportProfile);
      } catch (_error) {}
      return WorkflowFeatures.defaultExportProfiles();
    }

    function saveProfiles() {
      try { localStorage.setItem(EXPORT_PROFILE_STORAGE_KEY, JSON.stringify(exportProfiles)); } catch (_error) {}
    }

    function profileFromControls() {
      return WorkflowFeatures.normalizeExportProfile({
        id: activeProfileId || WorkflowFeatures.uid("profile"),
        name: document.querySelector("#export-profile-name")?.value,
        baseName: document.querySelector("#export-base-name")?.value,
        png: document.querySelector("#export-format-png")?.checked,
        sheet: document.querySelector("#export-format-sheet")?.checked,
        gif: document.querySelector("#export-format-gif")?.checked,
        apng: document.querySelector("#export-format-apng")?.checked,
        webp: document.querySelector("#export-format-webp")?.checked,
        project: document.querySelector("#export-format-project")?.checked,
        scale: sheetScaleInput?.value,
        columns: sheetColumnsInput?.value,
        padding: sheetPaddingInput?.value,
        margin: sheetMarginInput?.value,
        trim: sheetTrimInput?.checked,
        json: sheetJsonInput?.checked,
        atlasFormat: document.querySelector("#sheet-atlas-format")?.value,
        nameTemplate: sheetNameTemplateInput?.value
      });
    }

    function applyProfile(profile) {
      const clean = WorkflowFeatures.normalizeExportProfile(profile);
      activeProfileId = clean.id;
      const values = {
        "#export-profile-name": clean.name,
        "#export-base-name": clean.baseName,
        "#sheet-scale": clean.scale,
        "#sheet-columns": clean.columns,
        "#sheet-padding": clean.padding,
        "#sheet-margin": clean.margin,
        "#sheet-name-template": clean.nameTemplate,
        "#sheet-atlas-format": clean.atlasFormat
      };
      Object.entries(values).forEach(([selector, value]) => {
        const input = document.querySelector(selector);
        if (input) input.value = String(value);
      });
      const checks = {
        "#export-format-png": clean.png,
        "#export-format-sheet": clean.sheet,
        "#export-format-gif": clean.gif,
        "#export-format-apng": clean.apng,
        "#export-format-webp": clean.webp,
        "#export-format-project": clean.project,
        "#sheet-trim": clean.trim,
        "#sheet-json": clean.json
      };
      Object.entries(checks).forEach(([selector, value]) => {
        const input = document.querySelector(selector);
        if (input) input.checked = value;
      });
      const status = document.querySelector("#export-profile-status");
      if (status) status.textContent = `${clean.name} selected.`;
    }

    function renderProfiles() {
      const select = document.querySelector("#export-profile-select");
      if (!select) return;
      select.innerHTML = "";
      exportProfiles.forEach(profile => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.name;
        option.selected = profile.id === activeProfileId;
        select.appendChild(option);
      });
      const active = exportProfiles.find(profile => profile.id === activeProfileId) || exportProfiles[0];
      if (active) applyProfile(active);
    }

    function createProfile() {
      if (exportProfiles.length >= 24) return setStatus("The export profile limit was reached.");
      const source = profileFromControls();
      const profile = WorkflowFeatures.normalizeExportProfile({ ...source, id: WorkflowFeatures.uid("profile"), name: `${source.name} Copy` }, exportProfiles.length);
      exportProfiles.push(profile);
      activeProfileId = profile.id;
      saveProfiles();
      renderProfiles();
      document.querySelector("#export-profile-name")?.focus();
      document.querySelector("#export-profile-name")?.select();
      setStatus("New export profile created.");
    }

    function storeProfile() {
      const profile = profileFromControls();
      const existingIndex = exportProfiles.findIndex(item => item.id === activeProfileId);
      if (existingIndex >= 0) exportProfiles[existingIndex] = profile;
      else exportProfiles.push(profile);
      activeProfileId = profile.id;
      exportProfiles = exportProfiles.slice(0, 24);
      saveProfiles();
      renderProfiles();
      setStatus(`Export profile ${profile.name} saved.`);
    }

    function deleteProfile() {
      if (exportProfiles.length <= 1) return setStatus("At least one export profile is required.");
      exportProfiles = exportProfiles.filter(profile => profile.id !== activeProfileId);
      activeProfileId = exportProfiles[0].id;
      saveProfiles();
      renderProfiles();
      setStatus("Export profile deleted.");
    }

    function scalePixelGrid(pixels, scale) {
      const factor = Math.max(1, Math.min(Number(scale) || 1, 16));
      return pixels.flatMap(row => Array.from({ length: factor }, () => row.flatMap(pixel => Array.from({ length: factor }, () => pixel))));
    }

    function buildSpritesheet(profile = profileFromControls()) {
      const entries = animationFrameEntriesForExport();
      if (!entries.length) throw new Error("No frames are available to export.");
      const clip = activeAnimationClip();
      const scale = Math.max(1, Math.min(Number(profile.scale) || 1, 16));
      const padding = Math.max(0, Math.min(Number(profile.padding) || 0, 64)) * scale;
      const margin = Math.max(0, Math.min(Number(profile.margin) || 0, 64)) * scale;
      const columns = Math.max(1, Math.min(Number(profile.columns) || entries.length, entries.length));
      const rows = Math.ceil(entries.length / columns);
      const prepared = entries.map(entry => {
        const pixels = flattenedPixels(entry.frame);
        const bounds = profile.trim ? (EditorFeatures.gridBounds(pixels) || { x: 0, y: 0, w: 1, h: 1 }) : { x: 0, y: 0, w: projectWidth(), h: projectHeight() };
        return { ...entry, pixels, bounds };
      });
      const cellWidth = Math.max(...prepared.map(entry => entry.bounds.w)) * scale;
      const cellHeight = Math.max(...prepared.map(entry => entry.bounds.h)) * scale;
      const sheet = document.createElement("canvas");
      sheet.width = margin * 2 + columns * cellWidth + Math.max(0, columns - 1) * padding;
      sheet.height = margin * 2 + rows * cellHeight + Math.max(0, rows - 1) * padding;
      const context = sheet.getContext("2d", { alpha: true });
      context.imageSmoothingEnabled = false;
      const atlasFrames = {};
      prepared.forEach((entry, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = margin + column * (cellWidth + padding);
        const y = margin + row * (cellHeight + padding);
        const cropped = EditorFeatures.cropGrid(entry.pixels, entry.bounds);
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = entry.bounds.w;
        sourceCanvas.height = entry.bounds.h;
        const sourceContext = sourceCanvas.getContext("2d", { alpha: true });
        sourceContext.imageSmoothingEnabled = false;
        for (let py = 0; py < entry.bounds.h; py++) for (let px = 0; px < entry.bounds.w; px++) {
          const pixel = cropped[py]?.[px];
          if (!pixel) continue;
          sourceContext.fillStyle = pixel;
          sourceContext.fillRect(px, py, 1, 1);
        }
        context.drawImage(sourceCanvas, x, y, entry.bounds.w * scale, entry.bounds.h * scale);
        const name = options.spritesheetFrameName(profile.nameTemplate, entry, clip);
        atlasFrames[name] = {
          frame: { x, y, w: entry.bounds.w * scale, h: entry.bounds.h * scale },
          sourceSize: { w: projectWidth(), h: projectHeight() },
          spriteSourceSize: { x: entry.bounds.x, y: entry.bounds.y, w: entry.bounds.w, h: entry.bounds.h },
          duration: entry.frame.duration,
          tag: entry.frame.tag || "",
          sourceFrame: entry.frameIndex,
          trimmed: profile.trim
        };
      });
      const baseName = WorkflowFeatures.safeFilename(profile.baseName || `pixel-bug-${clip.name || "sheet"}`);
      const meta = { app: "Pixel Bug", version: "1.5.18", image: `${baseName}-sheet.png`, format: "RGBA8888", size: { w: sheet.width, h: sheet.height }, scale, clip: { name: clip.name, start: clip.start, end: clip.end, loop: clip.loop } };
      const atlas = profile.atlasFormat === "aseprite" ? WorkflowFeatures.asepriteAtlas(atlasFrames, meta) : { frames: atlasFrames, meta };
      return { sheet, atlas, baseName };
    }

    async function exportSheet() {
      try {
        const profile = profileFromControls();
        const result = buildSpritesheet({ ...profile, sheet: true });
        const extraFiles = profile.json ? [{ filename: `${result.baseName}-sheet.json`, data: JSON.stringify(result.atlas, null, 2), encoding: "utf8" }] : [];
        const saved = await window.pixelBug.saveFile({ title: "Export Spritesheet", defaultPath: `${result.baseName}-sheet.png`, filters: [{ name: "PNG Image", extensions: ["png"] }], data: dataUrlBase64(result.sheet.toDataURL("image/png")), encoding: "base64", extraFiles });
        setStatus(saved.ok ? profile.json ? "Spritesheet and atlas exported." : "Spritesheet exported." : "Save cancelled.");
      } catch (error) {
        setStatus(error?.message || "Spritesheet export failed.");
      }
    }

    function readPngUint32(bytes, offset) {
      return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }

    function concatByteArrays(arrays) {
      const total = arrays.reduce((sum, array) => sum + array.length, 0);
      const output = new Uint8Array(total);
      let offset = 0;
      arrays.forEach(array => { output.set(array, offset); offset += array.length; });
      return output;
    }

    function pngChunkRecords(bytes) {
      const records = [];
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = readPngUint32(bytes, offset);
        const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
        const end = offset + 12 + length;
        if (end > bytes.length) throw new Error("PNG frame data is invalid.");
        records.push({ type, data: bytes.slice(offset + 8, offset + 8 + length), raw: bytes.slice(offset, end) });
        offset = end;
        if (type === "IEND") break;
      }
      return records;
    }

    function apngFrameControl(sequence, width, height, duration) {
      const data = new Uint8Array(26);
      writeUint32(data, 0, sequence);
      writeUint32(data, 4, width);
      writeUint32(data, 8, height);
      writeUint32(data, 12, 0);
      writeUint32(data, 16, 0);
      const delay = Math.max(1, Math.min(Math.round(Number(duration) || 120), 65535));
      data[20] = (delay >>> 8) & 255;
      data[21] = delay & 255;
      data[22] = 3;
      data[23] = 232;
      data[24] = 0;
      data[25] = 0;
      return data;
    }

    function encodeApng(frameCanvases, durations) {
      if (!frameCanvases.length) throw new Error("No animation frames are available.");
      const pngFrames = frameCanvases.map(canvasItem => base64ToBytes(dataUrlBase64(canvasItem.toDataURL("image/png"))));
      const firstRecords = pngChunkRecords(pngFrames[0]);
      const ihdr = firstRecords.find(record => record.type === "IHDR");
      const iend = firstRecords.find(record => record.type === "IEND");
      if (!ihdr || !iend) throw new Error("PNG frame data is incomplete.");
      const width = readPngUint32(ihdr.data, 0);
      const height = readPngUint32(ihdr.data, 4);
      const animationControl = new Uint8Array(8);
      writeUint32(animationControl, 0, pngFrames.length);
      writeUint32(animationControl, 4, 0);
      const output = [pngFrames[0].slice(0, 8), ihdr.raw, makePngChunk("acTL", animationControl)];
      firstRecords.filter(record => !["IHDR", "IDAT", "IEND", "acTL", "fcTL", "fdAT"].includes(record.type)).forEach(record => output.push(record.raw));
      let sequence = 0;
      pngFrames.forEach((bytes, frameIndex) => {
        const records = pngChunkRecords(bytes);
        output.push(makePngChunk("fcTL", apngFrameControl(sequence++, width, height, durations[frameIndex])));
        records.filter(record => record.type === "IDAT").forEach(record => {
          if (frameIndex === 0) output.push(record.raw);
          else {
            const frameData = new Uint8Array(record.data.length + 4);
            writeUint32(frameData, 0, sequence++);
            frameData.set(record.data, 4);
            output.push(makePngChunk("fdAT", frameData));
          }
        });
      });
      output.push(iend.raw);
      return concatByteArrays(output);
    }

    function animationCanvases(scale = 1) {
      return animationFramesForExport().map(projectFrame => pixelsToCanvas(flattenedPixels(projectFrame), scale));
    }

    async function exportAPNG(profile = profileFromControls()) {
      const canvases = animationCanvases(profile.scale);
      const bytes = encodeApng(canvases, animationFramesForExport().map(projectFrame => projectFrame.duration));
      const baseName = WorkflowFeatures.safeFilename(profile.baseName);
      await saveBase64("Export Animated PNG", `${baseName}.apng`, "Animated PNG", "apng", bytesToBase64(bytes));
    }

    async function exportWebP(profile = profileFromControls()) {
      const canvasItem = pixelsToCanvas(flattenedPixels(frame()), profile.scale);
      const baseName = WorkflowFeatures.safeFilename(profile.baseName);
      await saveBase64("Export WebP", `${baseName}.webp`, "WebP Image", "webp", dataUrlBase64(canvasItem.toDataURL("image/webp", 0.95)));
    }

    function buildBatchFiles(profile) {
      const files = [];
      const baseName = WorkflowFeatures.safeFilename(profile.baseName);
      if (profile.png) {
        const canvasItem = pixelsToCanvas(flattenedPixels(frame()), profile.scale);
        files.push({ filename: `${baseName}.png`, data: dataUrlBase64(canvasItem.toDataURL("image/png")), encoding: "base64", name: "PNG Image", ext: "png" });
      }
      if (profile.sheet) {
        const result = buildSpritesheet(profile);
        files.push({ filename: `${baseName}-sheet.png`, data: dataUrlBase64(result.sheet.toDataURL("image/png")), encoding: "base64", name: "PNG Image", ext: "png" });
        if (profile.json) files.push({ filename: `${baseName}-sheet.json`, data: JSON.stringify(result.atlas, null, 2), encoding: "utf8", name: "JSON Atlas", ext: "json" });
      }
      if (profile.gif) {
        const frames = animationFramesForExport().map(projectFrame => ({ pixels: scalePixelGrid(flattenedPixels(projectFrame), profile.scale), delay: Math.max(2, Math.round(projectFrame.duration / 10)) }));
        const bytes = encodeGif(frames, projectWidth() * profile.scale, projectHeight() * profile.scale);
        files.push({ filename: `${baseName}.gif`, data: bytesToBase64(bytes), encoding: "base64", name: "GIF Image", ext: "gif" });
      }
      if (profile.apng) {
        const bytes = encodeApng(animationCanvases(profile.scale), animationFramesForExport().map(projectFrame => projectFrame.duration));
        files.push({ filename: `${baseName}.apng`, data: bytesToBase64(bytes), encoding: "base64", name: "Animated PNG", ext: "apng" });
      }
      if (profile.webp) {
        const canvasItem = pixelsToCanvas(flattenedPixels(frame()), profile.scale);
        files.push({ filename: `${baseName}.webp`, data: dataUrlBase64(canvasItem.toDataURL("image/webp", 0.95)), encoding: "base64", name: "WebP Image", ext: "webp" });
      }
      if (profile.project) files.push({ filename: `${baseName}.pxbuild`, data: serializeProject(2), encoding: "utf8", name: "Pixel Bug Project", ext: "pxbuild" });
      return files;
    }

    async function exportBatch() {
      const profile = profileFromControls();
      try {
        const files = buildBatchFiles(profile);
        if (!files.length) return setStatus("Choose at least one batch export format.");
        const [primary, ...extras] = files;
        const result = await window.pixelBug.saveFile({
          title: `Export ${profile.name}`,
          defaultPath: primary.filename,
          filters: [{ name: primary.name, extensions: [primary.ext] }],
          data: primary.data,
          encoding: primary.encoding,
          extraFiles: extras.map(file => ({ filename: file.filename, data: file.data, encoding: file.encoding }))
        });
        const profileStatus = document.querySelector("#export-profile-status");
        if (profileStatus) profileStatus.textContent = result.ok ? `${files.length} files exported.` : "Batch export cancelled.";
        setStatus(result.ok ? `${files.length} files exported with ${profile.name}.` : "Batch export cancelled.");
        if (result.ok) closeExportModal();
      } catch (error) {
        setStatus(error?.message || "Batch export failed.");
      }
    }

    function setup() {
      renderProfiles();
      document.querySelector("#export-profile-select")?.addEventListener("change", event => {
        activeProfileId = event.target.value;
        applyProfile(exportProfiles.find(profile => profile.id === activeProfileId));
      });
      document.querySelector("#export-profile-new-btn")?.addEventListener("click", createProfile);
      document.querySelector("#export-profile-save-btn")?.addEventListener("click", storeProfile);
      document.querySelector("#export-profile-delete-btn")?.addEventListener("click", deleteProfile);
      document.querySelector("#export-batch-btn")?.addEventListener("click", () => runExportAction(exportBatch, "Batch Export"));
      document.querySelector("#export-apng-btn")?.addEventListener("click", () => runExportAction(exportAPNG, "Animated PNG Export"));
      document.querySelector("#export-webp-btn")?.addEventListener("click", () => runExportAction(exportWebP, "WebP Export"));
    }

    return Object.freeze({
      exportAPNG,
      exportBatch,
      exportSheet,
      exportWebP,
      profileFromControls,
      setup
    });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugExportWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
