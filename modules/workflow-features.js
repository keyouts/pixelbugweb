(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(Number(value) || 0, max));
  const plain = value => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const cleanColor = value => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : null;
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Export profiles
  const DEFAULT_EXPORT_PROFILE = Object.freeze({
    id: "profile-game-atlas",
    name: "Game Atlas",
    png: true,
    sheet: true,
    gif: false,
    apng: false,
    webp: false,
    project: false,
    scale: 1,
    columns: 240,
    padding: 0,
    margin: 0,
    trim: true,
    json: true,
    atlasFormat: "pixelbug",
    nameTemplate: "frame-{index}",
    baseName: "pixel-bug-export"
  });

  function normalizeExportProfile(input = {}, index = 0) {
    const profile = plain(input) ? input : {};
    const formats = ["png", "sheet", "gif", "apng", "webp", "project"];
    const normalized = {
      id: String(profile.id || `profile-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64),
      name: String(profile.name || `Profile ${index + 1}`).trim().slice(0, 48) || `Profile ${index + 1}`,
      scale: clamp(profile.scale || 1, 1, 16),
      columns: clamp(profile.columns || 240, 1, 240),
      padding: clamp(profile.padding || 0, 0, 64),
      margin: clamp(profile.margin || 0, 0, 64),
      trim: profile.trim === true,
      json: profile.json !== false,
      atlasFormat: profile.atlasFormat === "aseprite" ? "aseprite" : "pixelbug",
      nameTemplate: String(profile.nameTemplate || "frame-{index}").slice(0, 48),
      baseName: safeFilename(profile.baseName || "pixel-bug-export")
    };
    formats.forEach(key => { normalized[key] = profile[key] === true; });
    if (!formats.some(key => normalized[key])) normalized.png = true;
    return normalized;
  }

  function defaultExportProfiles() {
    return [
      normalizeExportProfile(DEFAULT_EXPORT_PROFILE),
      normalizeExportProfile({ id: "profile-preview", name: "Animation Preview", gif: true, apng: true, scale: 2, columns: 8, baseName: "pixel-bug-preview" }, 1),
      normalizeExportProfile({ id: "profile-archive", name: "Project Archive", png: true, sheet: true, gif: true, project: true, json: true, trim: false, baseName: "pixel-bug-archive" }, 2)
    ];
  }

  function safeFilename(value) {
    return String(value || "pixel-bug-export").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "pixel-bug-export";
  }

  // Pixel transforms
  function rotateGrid(grid, turns = 0) {
    let next = Array.isArray(grid) ? grid.map(row => Array.isArray(row) ? row.slice() : []) : [];
    const count = ((Number(turns) || 0) % 4 + 4) % 4;
    for (let turn = 0; turn < count; turn++) {
      const height = next.length;
      const width = next[0]?.length || 0;
      next = Array.from({ length: width }, (_, y) => Array.from({ length: height }, (_, x) => next[height - 1 - x]?.[y] ?? null));
    }
    return next;
  }

  function resizeGrid(grid, width, height, empty = null) {
    const sourceHeight = grid?.length || 0;
    const sourceWidth = grid?.[0]?.length || 0;
    const targetWidth = clamp(width, 1, 512);
    const targetHeight = clamp(height, 1, 512);
    if (!sourceWidth || !sourceHeight) return Array.from({ length: targetHeight }, () => Array.from({ length: targetWidth }, () => empty));
    return Array.from({ length: targetHeight }, (_, y) => Array.from({ length: targetWidth }, (_, x) => {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * sourceWidth / targetWidth));
      const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * sourceHeight / targetHeight));
      return grid[sourceY]?.[sourceX] ?? empty;
    }));
  }

  function transformSelection(data = {}, options = {}) {
    const turns = ({ 90: 1, 180: 2, 270: 3 })[Number(options.rotation)] || 0;
    let pixels = rotateGrid(data.pixels || [], turns);
    let mask = rotateGrid(data.mask || pixels.map(row => row.map(value => Boolean(value))), turns);
    const width = clamp(options.width || pixels[0]?.length || 1, 1, 512);
    const height = clamp(options.height || pixels.length || 1, 1, 512);
    pixels = resizeGrid(pixels, width, height, null);
    mask = resizeGrid(mask, width, height, false).map(row => row.map(Boolean));
    if (options.flipH) {
      pixels = pixels.map(row => row.slice().reverse());
      mask = mask.map(row => row.slice().reverse());
    }
    if (options.flipV) {
      pixels = pixels.slice().reverse();
      mask = mask.slice().reverse();
    }
    return { w: width, h: height, pixels, mask };
  }

  function anchoredPosition(box = {}, width, height, anchor = "top-left") {
    const sourceWidth = Math.max(1, Number(box.w) || 1);
    const sourceHeight = Math.max(1, Number(box.h) || 1);
    const sourceX = Number(box.x) || 0;
    const sourceY = Number(box.y) || 0;
    const horizontal = anchor.endsWith("right") ? 1 : anchor.includes("center") || anchor === "top-center" || anchor === "bottom-center" ? 0.5 : 0;
    const vertical = anchor.startsWith("bottom") ? 1 : anchor.startsWith("middle") || anchor === "center" ? 0.5 : 0;
    return {
      x: Math.round(sourceX + sourceWidth * horizontal - width * horizontal),
      y: Math.round(sourceY + sourceHeight * vertical - height * vertical)
    };
  }

  // Palette formats
  function parsePaletteText(text) {
    const colors = [];
    String(text || "").split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") && !/^#[0-9a-f]{6}$/i.test(trimmed)) return;
      const hexMatches = trimmed.match(/#[0-9a-f]{6}/gi) || [];
      hexMatches.forEach(match => colors.push(match.toLowerCase()));
      const rgb = trimmed.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s+.*)?$/);
      if (rgb) {
        const values = rgb.slice(1).map(value => clamp(value, 0, 255));
        colors.push(`#${values.map(value => Math.round(value).toString(16).padStart(2, "0")).join("")}`);
      }
    });
    return [...new Set(colors.filter(cleanColor))].slice(0, 256);
  }

  function paletteToGpl(name, colors) {
    const rows = ["GIMP Palette", `Name: ${String(name || "Pixel Bug Palette").slice(0, 64)}`, "Columns: 8", "#"];
    (colors || []).map(cleanColor).filter(Boolean).forEach(hex => {
      const red = parseInt(hex.slice(1, 3), 16);
      const green = parseInt(hex.slice(3, 5), 16);
      const blue = parseInt(hex.slice(5, 7), 16);
      rows.push(`${String(red).padStart(3)} ${String(green).padStart(3)} ${String(blue).padStart(3)}\t${hex}`);
    });
    return `${rows.join("\n")}\n`;
  }

  function paletteToText(colors) {
    return `${(colors || []).map(cleanColor).filter(Boolean).join("\n")}\n`;
  }

  // Tile maps
  function blankMapCells(width, height) {
    return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  }

  function normalizeMapLayer(input = {}, width = 16, height = 16, index = 0) {
    const cells = blankMapCells(width, height);
    const source = Array.isArray(input.cells) ? input.cells : [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const cell = source[y]?.[x];
      if (!plain(cell) || !cell.tileId) continue;
      cells[y][x] = {
        tileId: String(cell.tileId).slice(0, 80),
        flipH: cell.flipH === true,
        flipV: cell.flipV === true,
        rotation: [0, 90, 180, 270].includes(Number(cell.rotation)) ? Number(cell.rotation) : 0,
        collision: cell.collision === true
      };
    }
    return {
      id: String(input.id || `map-layer-${index + 1}`).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64),
      name: String(input.name || `Layer ${index + 1}`).slice(0, 40),
      visible: input.visible !== false,
      cells
    };
  }

  function normalizeTileMap(input = {}) {
    const width = clamp(input.width || 16, 1, 128);
    const height = clamp(input.height || 16, 1, 128);
    const cellWidth = clamp(input.cellWidth || 16, 1, 128);
    const cellHeight = clamp(input.cellHeight || 16, 1, 128);
    const sourceLayers = Array.isArray(input.layers) && input.layers.length ? input.layers.slice(0, 24) : [{}];
    const layers = sourceLayers.map((layer, index) => normalizeMapLayer(layer, width, height, index));
    const activeLayerId = layers.some(layer => layer.id === input.activeLayerId) ? input.activeLayerId : layers[0].id;
    return { width, height, cellWidth, cellHeight, activeLayerId, layers };
  }

  function resizeTileMap(input = {}, width, height) {
    const source = normalizeTileMap(input);
    const nextWidth = clamp(width, 1, 128);
    const nextHeight = clamp(height, 1, 128);
    return {
      ...source,
      width: nextWidth,
      height: nextHeight,
      layers: source.layers.map((layer, index) => normalizeMapLayer(layer, nextWidth, nextHeight, index))
    };
  }

  function tileMapToTiled(mapInput, tiles = [], name = "Pixel Bug Map", options = {}) {
    const map = normalizeTileMap(mapInput);
    const tileIds = new Map((tiles || []).map((tile, index) => [String(tile.id), index + 1]));
    const tileProperties = (tiles || []).map((tile, index) => ({
      id: index,
      type: "pixelbug",
      properties: [
        { name: "pixelbugId", type: "string", value: String(tile.id || `tile-${index + 1}`) },
        { name: "pixelbugPixels", type: "string", value: JSON.stringify(tile.pixels || []) }
      ]
    }));
    const tileLayers = map.layers.map((layer, index) => ({
      id: index + 1,
      name: layer.name,
      type: "tilelayer",
      visible: layer.visible,
      width: map.width,
      height: map.height,
      data: layer.cells.flatMap(row => row.map(cell => cell ? tileIds.get(String(cell.tileId)) || 0 : 0)),
      properties: [{ name: "pixelbugCells", type: "string", value: JSON.stringify(layer.cells) }]
    }));
    let nextObjectId = 1;
    const collisionObjects = [];
    map.layers.forEach(layer => layer.cells.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell?.collision) return;
      collisionObjects.push({
        id: nextObjectId++,
        name: `${layer.name} ${x},${y}`,
        type: "collision",
        x: x * map.cellWidth,
        y: y * map.cellHeight,
        width: map.cellWidth,
        height: map.cellHeight,
        rotation: 0,
        visible: true,
        properties: [{ name: "pixelbugLayer", type: "string", value: layer.id }]
      });
    })));
    const layers = tileLayers.slice();
    if (collisionObjects.length) layers.push({ id: layers.length + 1, name: "Collision", type: "objectgroup", visible: true, draworder: "topdown", objects: collisionObjects });
    const tileCount = Math.max(0, (tiles || []).length);
    const columns = clamp(options.columns || Math.min(16, Math.max(1, tileCount)), 1, Math.max(1, tileCount));
    const rows = Math.max(1, Math.ceil(tileCount / columns));
    const tileset = {
      firstgid: 1,
      name: String(name || "Pixel Bug Tiles").slice(0, 64),
      tilewidth: map.cellWidth,
      tileheight: map.cellHeight,
      tilecount: tileCount,
      columns,
      image: options.image ? String(options.image).slice(0, 240) : undefined,
      imagewidth: columns * map.cellWidth,
      imageheight: rows * map.cellHeight,
      tiles: tileProperties
    };
    return {
      compressionlevel: -1,
      height: map.height,
      infinite: false,
      layers,
      nextlayerid: layers.length + 1,
      nextobjectid: nextObjectId,
      orientation: "orthogonal",
      renderorder: "right-down",
      tiledversion: "1.11",
      tileheight: map.cellHeight,
      tilesets: [tileset],
      tilewidth: map.cellWidth,
      type: "map",
      version: "1.10",
      width: map.width,
      properties: [{ name: "pixelbugMap", type: "string", value: JSON.stringify(map) }]
    };
  }

  function tiledProperty(properties, name) {
    return Array.isArray(properties) ? properties.find(property => property?.name === name)?.value : undefined;
  }

  function tilesFromTiled(input = {}) {
    const output = [];
    (Array.isArray(input.tilesets) ? input.tilesets : []).forEach(tileset => {
      (Array.isArray(tileset?.tiles) ? tileset.tiles : []).forEach((tile, index) => {
        const id = String(tiledProperty(tile?.properties, "pixelbugId") || `tile-${Number(tile?.id) + 1 || index + 1}`).slice(0, 80);
        const source = tiledProperty(tile?.properties, "pixelbugPixels");
        if (!source) return;
        try {
          const parsed = JSON.parse(source);
          if (!Array.isArray(parsed) || !parsed.length || !Array.isArray(parsed[0])) return;
          const height = clamp(parsed.length, 1, 128);
          const width = clamp(Math.max(...parsed.map(row => Array.isArray(row) ? row.length : 0)), 1, 128);
          const pixels = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => cleanColor(parsed[y]?.[x])));
          output.push({ id, name: id.replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()).slice(0, 40), w: width, h: height, pixels });
        } catch (_error) {}
      });
    });
    return output.slice(0, 80);
  }

  function tileMapFromTiled(input = {}) {
    const mapProperty = tiledProperty(input.properties, "pixelbugMap");
    if (mapProperty) {
      try { return normalizeTileMap(JSON.parse(mapProperty)); } catch (_error) {}
    }
    const width = clamp(input.width || 16, 1, 128);
    const height = clamp(input.height || 16, 1, 128);
    const gidMap = new Map();
    (Array.isArray(input.tilesets) ? input.tilesets : []).forEach(tileset => {
      const firstGid = Math.max(1, Number(tileset?.firstgid) || 1);
      (Array.isArray(tileset?.tiles) ? tileset.tiles : []).forEach(tile => {
        const localId = Math.max(0, Number(tile?.id) || 0);
        gidMap.set(firstGid + localId, String(tiledProperty(tile?.properties, "pixelbugId") || `tile-${firstGid + localId}`));
      });
    });
    const sourceLayers = (Array.isArray(input.layers) ? input.layers : []).filter(layer => layer?.type === "tilelayer").slice(0, 24);
    const layers = sourceLayers.map((layer, index) => {
      const cellProperty = tiledProperty(layer.properties, "pixelbugCells");
      if (cellProperty) {
        try { return normalizeMapLayer({ ...layer, cells: JSON.parse(cellProperty) }, width, height, index); } catch (_error) {}
      }
      const cells = blankMapCells(width, height);
      const data = Array.isArray(layer.data) ? layer.data : [];
      for (let position = 0; position < Math.min(data.length, width * height); position++) {
        const raw = Number(data[position]) >>> 0;
        const gid = raw & 0x1fffffff;
        if (!gid) continue;
        const x = position % width;
        const y = Math.floor(position / width);
        cells[y][x] = {
          tileId: gidMap.get(gid) || `tile-${gid}`,
          flipH: Boolean(raw & 0x80000000),
          flipV: Boolean(raw & 0x40000000),
          rotation: 0,
          collision: false
        };
      }
      return normalizeMapLayer({ ...layer, cells }, width, height, index);
    });
    const normalized = normalizeTileMap({ width, height, cellWidth: input.tilewidth, cellHeight: input.tileheight, layers: layers.length ? layers : [{}] });
    const layerById = new Map(normalized.layers.map(layer => [layer.id, layer]));
    (Array.isArray(input.layers) ? input.layers : []).filter(layer => layer?.type === "objectgroup").forEach(group => {
      (Array.isArray(group.objects) ? group.objects : []).filter(object => object?.type === "collision" || /collision/i.test(group.name || "")).forEach(object => {
        const layerId = String(tiledProperty(object.properties, "pixelbugLayer") || normalized.activeLayerId);
        const targetLayer = layerById.get(layerId) || normalized.layers[0];
        const startX = clamp(Math.floor((Number(object.x) || 0) / normalized.cellWidth), 0, normalized.width - 1);
        const startY = clamp(Math.floor((Number(object.y) || 0) / normalized.cellHeight), 0, normalized.height - 1);
        const endX = clamp(Math.ceil(((Number(object.x) || 0) + (Number(object.width) || normalized.cellWidth)) / normalized.cellWidth), startX + 1, normalized.width);
        const endY = clamp(Math.ceil(((Number(object.y) || 0) + (Number(object.height) || normalized.cellHeight)) / normalized.cellHeight), startY + 1, normalized.height);
        for (let y = startY; y < endY; y++) for (let x = startX; x < endX; x++) if (targetLayer.cells[y]?.[x]) targetLayer.cells[y][x].collision = true;
      });
    });
    return normalized;
  }

  // Frame ranges
  function normalizeFrameIndexes(indexes, length) {
    return [...new Set((indexes || []).map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < length))].sort((a, b) => a - b);
  }

  function contiguousRange(indexes, anchor, target, length) {
    const start = clamp(Math.min(anchor, target), 0, Math.max(0, length - 1));
    const end = clamp(Math.max(anchor, target), 0, Math.max(0, length - 1));
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  // Atlas formats
  function asepriteAtlas(frames, meta = {}) {
    return {
      frames: Object.fromEntries(Object.entries(frames || {}).map(([name, value]) => [name, {
        frame: value.frame,
        rotated: false,
        trimmed: Boolean(value.trimmed),
        spriteSourceSize: value.spriteSourceSize,
        sourceSize: value.sourceSize,
        duration: value.duration
      }])),
      meta: {
        app: "Pixel Bug",
        version: String(meta.version || "1.5.5"),
        image: String(meta.image || "spritesheet.png"),
        format: "RGBA8888",
        size: meta.size || { w: 1, h: 1 },
        scale: String(meta.scale || 1),
        frameTags: meta.clip ? [{ name: meta.clip.name || "Main", from: 0, to: Math.max(0, Object.keys(frames || {}).length - 1), direction: meta.clip.loop === "pingpong" ? "pingpong" : meta.clip.loop === "once" ? "forward" : "forward" }] : []
      }
    };
  }

  function atlasFrameRecords(input = {}) {
    const source = Array.isArray(input.frames)
      ? input.frames.map((entry, index) => [entry.filename || `frame-${index + 1}`, entry])
      : Object.entries(input.frames || {});
    return source.map(([name, entry], index) => ({
      name: String(name || `frame-${index + 1}`),
      frame: {
        x: clamp(entry?.frame?.x, 0, 100000),
        y: clamp(entry?.frame?.y, 0, 100000),
        w: clamp(entry?.frame?.w, 1, 4096),
        h: clamp(entry?.frame?.h, 1, 4096)
      },
      duration: clamp(entry?.duration || 120, 20, 10000),
      rotated: entry?.rotated === true,
      sourceSize: {
        w: clamp(entry?.sourceSize?.w || entry?.frame?.w || 1, 1, 512),
        h: clamp(entry?.sourceSize?.h || entry?.frame?.h || 1, 1, 512)
      },
      spriteSourceSize: {
        x: clamp(entry?.spriteSourceSize?.x || 0, 0, 511),
        y: clamp(entry?.spriteSourceSize?.y || 0, 0, 511),
        w: clamp(entry?.spriteSourceSize?.w || entry?.frame?.w || 1, 1, 512),
        h: clamp(entry?.spriteSourceSize?.h || entry?.frame?.h || 1, 1, 512)
      },
      trimmed: entry?.trimmed === true
    })).slice(0, 240);
  }

  const api = Object.freeze({
    DEFAULT_EXPORT_PROFILE,
    anchoredPosition,
    asepriteAtlas,
    atlasFrameRecords,
    contiguousRange,
    defaultExportProfiles,
    normalizeExportProfile,
    normalizeFrameIndexes,
    normalizeTileMap,
    paletteToGpl,
    paletteToText,
    parsePaletteText,
    resizeGrid,
    resizeTileMap,
    rotateGrid,
    safeFilename,
    tileMapFromTiled,
    tileMapToTiled,
    tilesFromTiled,
    transformSelection,
    uid
  });

  if (typeof globalThis !== "undefined") globalThis.PixelBugWorkflowFeatures = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
