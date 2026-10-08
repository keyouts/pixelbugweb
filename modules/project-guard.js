(() => {
  const FORMAT = "pixel-bug-project";
  const SCHEMA_VERSION = 2;
  const MAX_TEXT_CHARS = 256 * 1024 * 1024;
  const MAX_DEPTH = 64;
  const MAX_VALUES = 4500000;
  const MAX_STRING_CHARS = 8 * 1024 * 1024;
  const MAX_AUDIO_STRING_CHARS = 65 * 1024 * 1024;
  const AUDIO_DATA_URL = /^data:audio\/[a-z0-9.+-]+;base64,/i;
  const MAX_PIXEL_CELLS = 24 * 1024 * 1024;
  const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const ARRAY_LIMITS = Object.freeze({
    frames: 240,
    layers: 96,
    layerGroups: 48,
    palettePresets: 80,
    colors: 4096,
    tiles: 4096,
    nodes: 4096,
    props: 4096,
    lines: 4096,
    characters: 1024,
    parts: 8192,
    bones: 8192,
    joints: 8192,
    animationFrames: 240,
    poseLibrary: 32,
    cameraViews: 12,
    viewCanvases: 8,
    audioLibrary: 48,
    stamps: 24,
    cubes: 3200000,
    strokes: 500000,
    points: 2000000
  });

  function plainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
  }

  function limitForKey(key) {
    return ARRAY_LIMITS[key] || 1000000;
  }

  function inspect(value, options = {}) {
    const maxDepth = Math.min(Number(options.maxDepth) || MAX_DEPTH, MAX_DEPTH);
    const maxValues = Math.min(Number(options.maxValues) || MAX_VALUES, MAX_VALUES);
    const maxStringChars = Math.min(Number(options.maxStringChars) || MAX_STRING_CHARS, MAX_STRING_CHARS);
    const maxAudioStringChars = Math.min(Number(options.maxAudioStringChars) || MAX_AUDIO_STRING_CHARS, MAX_AUDIO_STRING_CHARS);
    const stack = [{ value, depth: 0, key: "" }];
    const seen = new WeakSet();
    let values = 0;
    let stringChars = 0;
    let audioStringChars = 0;
    let pixelCells = 0;

    while (stack.length) {
      const item = stack.pop();
      values++;
      if (values > maxValues) throw new Error("Project contains too many values");
      if (item.depth > maxDepth) throw new Error("Project nesting is too deep");
      const current = item.value;
      if (typeof current === "string") {
        if (item.key === "dataUrl" && AUDIO_DATA_URL.test(current)) {
          audioStringChars += current.length;
          if (audioStringChars > maxAudioStringChars) throw new Error("Project audio is too large");
        } else {
          stringChars += current.length;
          if (stringChars > maxStringChars) throw new Error("Project text is too large");
        }
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (seen.has(current)) throw new Error("Project contains repeated object references");
      seen.add(current);
      if (Array.isArray(current)) {
        if (current.length > limitForKey(item.key)) throw new Error(`Project ${item.key || "array"} is too large`);
        if (item.key === "pixels" || item.key === "sourcePixels") {
          pixelCells += current.reduce((sum, row) => sum + (Array.isArray(row) ? row.length : 0), 0);
          if (pixelCells > MAX_PIXEL_CELLS) throw new Error("Project pixel data is too large");
        }
        for (let index = current.length - 1; index >= 0; index--) stack.push({ value: current[index], depth: item.depth + 1, key: item.key });
        continue;
      }
      if (!plainRecord(current)) throw new Error("Project contains an unsupported object");
      const keys = Object.keys(current);
      for (let index = keys.length - 1; index >= 0; index--) {
        const key = keys[index];
        if (DANGEROUS_KEYS.has(key)) throw new Error("Project contains an unsafe property");
        stack.push({ value: current[key], depth: item.depth + 1, key });
      }
    }
    return true;
  }

  function migrate(project) {
    const width = positiveInteger(project.width, positiveInteger(project.size, 32));
    const height = positiveInteger(project.height, positiveInteger(project.size, width));
    project.width = width;
    project.height = height;
    project.size = Math.max(width, height);
    project.format = FORMAT;
    project.schemaVersion = SCHEMA_VERSION;
    return project;
  }

  function prepare(project) {
    if (!plainRecord(project)) throw new Error("Project must be an object");
    if (project.format != null && project.format !== FORMAT) throw new Error("Project format is not supported");
    const version = project.schemaVersion == null ? 1 : Number(project.schemaVersion);
    if (!Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION) throw new Error("Project version is not supported");
    const width = positiveInteger(project.width, positiveInteger(project.size, 32));
    const height = positiveInteger(project.height, positiveInteger(project.size, width));
    if (width < 1 || width > 512 || height < 1 || height > 512) throw new Error("Project dimensions are not supported");
    if (!Array.isArray(project.frames) || project.frames.length < 1 || project.frames.length > 240) throw new Error("Project frames are not valid");
    for (const frame of project.frames) {
      if (!plainRecord(frame) || !Array.isArray(frame.layers) || frame.layers.length < 1 || frame.layers.length > 96) throw new Error("Project layers are not valid");
    }
    inspect(project);
    return migrate(project);
  }

  function parse(text) {
    const source = String(text || "");
    if (!source || source.length > MAX_TEXT_CHARS) throw new Error("Project file is too large");
    const packageApi = globalThis.PixelBugProjectPackage || (typeof require === "function" ? require("./project-package") : null);
    const project = packageApi ? packageApi.parse(source) : JSON.parse(source, (key, value) => {
      if (DANGEROUS_KEYS.has(key)) throw new Error("Project contains an unsafe property");
      return value;
    });
    return prepare(project);
  }

  function stamp(project) {
    if (!plainRecord(project)) throw new Error("Project must be an object");
    project.format = FORMAT;
    project.schemaVersion = SCHEMA_VERSION;
    return project;
  }

  const api = Object.freeze({ FORMAT, SCHEMA_VERSION, MAX_AUDIO_STRING_CHARS, inspect, parse, prepare, stamp });
  if (typeof globalThis !== "undefined") globalThis.PixelBugProjectGuard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
