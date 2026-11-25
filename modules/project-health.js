(() => {
  function byteLength(value) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(String(value || "")).length;
    if (typeof Buffer !== "undefined") return Buffer.byteLength(String(value || ""), "utf8");
    return String(value || "").length;
  }

  function audioBytes(dataUrl) {
    const text = String(dataUrl || "");
    const marker = text.indexOf(",");
    if (marker < 0) return 0;
    const length = text.length - marker - 1;
    return Math.max(0, Math.floor(length * 0.75) - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0));
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function inspect(project, options = {}) {
    const frames = Array.isArray(project?.frames) ? project.frames : [];
    const width = Math.max(1, Number(project?.width || project?.size) || 1);
    const height = Math.max(1, Number(project?.height || project?.size) || width);
    let layers = 0;
    let visibleLayers = 0;
    let pixelCells = 0;
    frames.forEach(frame => {
      const records = Array.isArray(frame?.layers) ? frame.layers : [];
      layers += records.length;
      visibleLayers += records.filter(layer => layer?.visible !== false).length;
      records.forEach(layer => {
        if (Array.isArray(layer?.pixels)) pixelCells += layer.pixels.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
        if (Array.isArray(layer?.sourcePixels)) pixelCells += layer.sourcePixels.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
      });
    });
    const audioLibrary = Array.isArray(project?.playMode?.audioLibrary) ? project.playMode.audioLibrary : [];
    const embeddedAudioBytes = audioLibrary.reduce((sum, asset) => sum + audioBytes(asset?.dataUrl), 0);
    const undoBytes = (Array.isArray(options.undoStack) ? options.undoStack : []).reduce((sum, entry) => sum + byteLength(JSON.stringify(entry)), 0);
    const redoBytes = (Array.isArray(options.redoStack) ? options.redoStack : []).reduce((sum, entry) => sum + byteLength(JSON.stringify(entry)), 0);
    let projectBytes = 0;
    try { projectBytes = byteLength(options.stringify ? options.stringify(project) : JSON.stringify(project)); } catch (_error) {}
    const warnings = [];
    if (frames.length >= 180) warnings.push("Frame count is approaching the project limit.");
    if (layers >= 1500) warnings.push("The combined layer count may slow full-project operations.");
    if (pixelCells >= 16 * 1024 * 1024) warnings.push("Pixel storage is approaching the guarded project budget.");
    if (embeddedAudioBytes >= 48 * 1024 * 1024) warnings.push("Embedded audio is approaching the guarded audio budget.");
    if (undoBytes + redoBytes >= 64 * 1024 * 1024) warnings.push("Undo history is using substantial memory.");
    if (projectBytes >= 72 * 1024 * 1024) warnings.push("The saved project is approaching the automatic recovery limit.");
    return {
      width,
      height,
      frames: frames.length,
      layers,
      visibleLayers,
      pixelCells,
      audioAssets: audioLibrary.length,
      embeddedAudioBytes,
      undoBytes,
      redoBytes,
      projectBytes,
      warnings
    };
  }

  const api = Object.freeze({ audioBytes, byteLength, formatBytes, inspect });
  if (typeof globalThis !== "undefined") globalThis.PixelBugProjectHealth = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
