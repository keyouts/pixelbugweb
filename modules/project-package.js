(() => {
  const FORMAT = "pixel-bug-package";
  const VERSION = 2;
  const PIXEL_ENCODING = "rle1";
  const CHECKSUM_ALGORITHM = "fnv1a32";
  const MAX_PIXEL_CELLS = 24 * 1024 * 1024;
  const MAX_VALUES = 4096;
  const AUDIO_DATA_URL = /^data:audio\/[a-z0-9.+-]+;base64,/i;
  const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  function plainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function safeParse(text) {
    return JSON.parse(String(text || ""), (key, value) => {
      if (DANGEROUS_KEYS.has(key)) throw new Error("Project contains an unsafe property");
      return value;
    });
  }

  function checksumText(text) {
    const source = String(text || "");
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function packageChecksum(value) {
    return checksumText(JSON.stringify({ encoding: value.encoding, audio: value.audio, project: value.project }));
  }

  function valueKey(value) {
    if (value === null) return "null";
    if (typeof value === "string") return `s:${value}`;
    if (typeof value === "number") return `n:${value}`;
    if (typeof value === "boolean") return `b:${value}`;
    return `j:${JSON.stringify(value)}`;
  }

  function packGrid(grid) {
    const height = Array.isArray(grid) ? grid.length : 0;
    const width = height ? Math.max(0, ...grid.map(row => Array.isArray(row) ? row.length : 0)) : 0;
    if (!width || !height || width * height > MAX_PIXEL_CELLS) return cloneValue(grid);
    const values = [];
    const indexes = new Map();
    const runs = [];
    let runIndex = -1;
    let runLength = 0;
    for (let y = 0; y < height; y++) {
      const row = Array.isArray(grid[y]) ? grid[y] : [];
      for (let x = 0; x < width; x++) {
        const value = row[x] ?? null;
        const key = valueKey(value);
        let index = indexes.get(key);
        if (index == null) {
          index = values.length;
          if (index >= MAX_VALUES) return cloneValue(grid);
          indexes.set(key, index);
          values.push(value);
        }
        if (index === runIndex) runLength++;
        else {
          if (runLength) runs.push(runLength, runIndex);
          runIndex = index;
          runLength = 1;
        }
      }
    }
    if (runLength) runs.push(runLength, runIndex);
    return { $pixels: PIXEL_ENCODING, width, height, values, runs };
  }

  function unpackGrid(record, context) {
    const width = Number(record?.width);
    const height = Number(record?.height);
    const values = Array.isArray(record?.values) ? record.values : [];
    const runs = Array.isArray(record?.runs) ? record.runs : [];
    const cells = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || cells > MAX_PIXEL_CELLS) throw new Error("Packed pixel dimensions are not supported");
    if (!values.length || values.length > MAX_VALUES || runs.length % 2 !== 0) throw new Error("Packed pixel data is not valid");
    context.pixelCells += cells;
    if (context.pixelCells > MAX_PIXEL_CELLS) throw new Error("Packed pixel data is too large");
    const flat = new Array(cells);
    let offset = 0;
    for (let index = 0; index < runs.length; index += 2) {
      const count = Number(runs[index]);
      const valueIndex = Number(runs[index + 1]);
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(valueIndex) || valueIndex < 0 || valueIndex >= values.length || offset + count > cells) throw new Error("Packed pixel run is not valid");
      flat.fill(values[valueIndex], offset, offset + count);
      offset += count;
    }
    if (offset !== cells) throw new Error("Packed pixel data is incomplete");
    return Array.from({ length: height }, (_unused, y) => flat.slice(y * width, (y + 1) * width));
  }

  function packValue(value, key, context) {
    if ((key === "pixels" || key === "sourcePixels") && Array.isArray(value)) return packGrid(value);
    if (key === "dataUrl" && typeof value === "string" && AUDIO_DATA_URL.test(value)) {
      let index = context.audioIndexes.get(value);
      if (index == null) {
        index = context.audio.length;
        context.audioIndexes.set(value, index);
        context.audio.push(value);
      }
      return { $audio: index };
    }
    if (Array.isArray(value)) return value.map(item => packValue(item, "", context));
    if (!plainRecord(value)) return value;
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) result[childKey] = packValue(childValue, childKey, context);
    return result;
  }

  function unpackValue(value, key, context) {
    if (plainRecord(value) && value.$pixels === PIXEL_ENCODING) return unpackGrid(value, context);
    if (plainRecord(value) && Object.keys(value).length === 1 && Number.isInteger(value.$audio)) {
      const dataUrl = context.audio[value.$audio];
      if (typeof dataUrl !== "string" || !AUDIO_DATA_URL.test(dataUrl)) throw new Error("Packed audio reference is not valid");
      return dataUrl;
    }
    if (Array.isArray(value)) return value.map(item => unpackValue(item, "", context));
    if (!plainRecord(value)) return value;
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(childKey)) throw new Error("Project contains an unsafe property");
      result[childKey] = unpackValue(childValue, childKey, context);
    }
    return result;
  }

  function salvageGrid(record, context, warnings) {
    try {
      return unpackGrid(record, context);
    } catch (_error) {
      const width = Number(record?.width);
      const height = Number(record?.height);
      const cells = width * height;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || cells > MAX_PIXEL_CELLS || context.pixelCells + cells > MAX_PIXEL_CELLS) throw new Error("Damaged pixel data cannot be recovered safely");
      context.pixelCells += cells;
      warnings.push("A damaged pixel grid was replaced with a blank layer.");
      return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
    }
  }

  function salvageValue(value, key, context, warnings) {
    if (plainRecord(value) && value.$pixels === PIXEL_ENCODING) return salvageGrid(value, context, warnings);
    if (plainRecord(value) && Object.keys(value).length === 1 && Number.isInteger(value.$audio)) {
      const dataUrl = context.audio[value.$audio];
      if (typeof dataUrl === "string" && AUDIO_DATA_URL.test(dataUrl)) return dataUrl;
      warnings.push("A damaged audio reference was removed.");
      return "";
    }
    if (Array.isArray(value)) return value.map(item => salvageValue(item, "", context, warnings));
    if (!plainRecord(value)) return value;
    const result = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (DANGEROUS_KEYS.has(childKey)) continue;
      result[childKey] = salvageValue(childValue, childKey, context, warnings);
    }
    return result;
  }

  function pack(project) {
    const context = { audio: [], audioIndexes: new Map() };
    const packed = packValue(project, "", context);
    const result = { format: FORMAT, packageVersion: VERSION, encoding: PIXEL_ENCODING, audio: context.audio, project: packed };
    result.checksum = { algorithm: CHECKSUM_ALGORITHM, value: packageChecksum(result) };
    return result;
  }

  function verifyChecksum(value) {
    if (Number(value.packageVersion) < 2) return true;
    if (!plainRecord(value.checksum) || value.checksum.algorithm !== CHECKSUM_ALGORITHM || !/^[a-f0-9]{8}$/i.test(String(value.checksum.value || ""))) throw new Error("Project package checksum is missing");
    if (packageChecksum(value) !== String(value.checksum.value).toLowerCase()) throw new Error("Project package integrity check failed");
    return true;
  }

  function unpack(value) {
    if (!plainRecord(value) || value.format !== FORMAT) return value;
    const version = Number(value.packageVersion);
    if (!Number.isInteger(version) || version < 1 || version > VERSION || value.encoding !== PIXEL_ENCODING || !plainRecord(value.project) || !Array.isArray(value.audio)) throw new Error("Project package is not supported");
    verifyChecksum(value);
    return unpackValue(value.project, "", { audio: value.audio, pixelCells: 0 });
  }

  function recover(text) {
    const parsed = safeParse(text);
    if (!plainRecord(parsed) || parsed.format !== FORMAT) return { project: parsed, readOnly: false, warnings: [] };
    if (parsed.encoding !== PIXEL_ENCODING || !plainRecord(parsed.project) || !Array.isArray(parsed.audio)) throw new Error("Project package cannot be recovered safely");
    const warnings = [];
    let readOnly = false;
    const version = Number(parsed.packageVersion);
    if (!Number.isInteger(version) || version < 1) throw new Error("Project package version is not valid");
    if (version > VERSION) {
      readOnly = true;
      warnings.push("This project was created by a newer Pixel Bug package version and opened read-only.");
    }
    if (version >= 2) {
      try { verifyChecksum(parsed); }
      catch (_error) {
        readOnly = true;
        warnings.push("The project integrity check failed. Recoverable content opened read-only.");
      }
    }
    let project;
    try {
      project = unpackValue(parsed.project, "", { audio: parsed.audio, pixelCells: 0 });
    } catch (_error) {
      readOnly = true;
      project = salvageValue(parsed.project, "", { audio: parsed.audio, pixelCells: 0 }, warnings);
      if (!warnings.length) warnings.push("Damaged project sections were recovered where possible.");
    }
    return { project, readOnly, warnings: [...new Set(warnings)] };
  }

  function parse(text) {
    return unpack(safeParse(text));
  }

  function stringify(project, space = 0) {
    return JSON.stringify(pack(project), null, space);
  }

  const api = Object.freeze({ CHECKSUM_ALGORITHM, FORMAT, VERSION, checksumText, pack, packGrid, parse, packageChecksum, recover, stringify, unpack, unpackGrid, verifyChecksum });
  if (typeof globalThis !== "undefined") globalThis.PixelBugProjectPackage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
