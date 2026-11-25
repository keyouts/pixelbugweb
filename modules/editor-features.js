(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(Number(value) || 0, max));
  const keyFor = (x, y) => `${x},${y}`;

  class PixelMask extends Set {
    constructor(width, height, source = null) {
      super();
      this.width = Math.max(1, Math.round(Number(width) || 1));
      this.height = Math.max(1, Math.round(Number(height) || 1));
      this.bits = new Uint8Array(this.width * this.height);
      this.count = 0;
      this.cachedBounds = null;
      this.boundsDirty = false;
      if (source) forEachMaskPoint(source, (x, y) => this.addPoint(x, y));
    }

    get size() { return this.count; }

    addPoint(x, y) {
      const column = Math.round(Number(x));
      const row = Math.round(Number(y));
      if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || column >= this.width || row >= this.height) return this;
      const index = row * this.width + column;
      if (this.bits[index]) return this;
      this.bits[index] = 1;
      this.count++;
      if (!this.cachedBounds) this.cachedBounds = { x: column, y: row, w: 1, h: 1 };
      else if (!this.boundsDirty) {
        const right = Math.max(this.cachedBounds.x + this.cachedBounds.w - 1, column);
        const bottom = Math.max(this.cachedBounds.y + this.cachedBounds.h - 1, row);
        this.cachedBounds.x = Math.min(this.cachedBounds.x, column);
        this.cachedBounds.y = Math.min(this.cachedBounds.y, row);
        this.cachedBounds.w = right - this.cachedBounds.x + 1;
        this.cachedBounds.h = bottom - this.cachedBounds.y + 1;
      }
      return this;
    }

    hasPoint(x, y) {
      const column = Number(x);
      const row = Number(y);
      return Number.isInteger(column) && Number.isInteger(row) && column >= 0 && row >= 0 && column < this.width && row < this.height && this.bits[row * this.width + column] === 1;
    }

    deletePoint(x, y) {
      const column = Number(x);
      const row = Number(y);
      if (!this.hasPoint(column, row)) return false;
      this.bits[row * this.width + column] = 0;
      this.count--;
      this.boundsDirty = true;
      if (!this.count) {
        this.cachedBounds = null;
        this.boundsDirty = false;
      }
      return true;
    }

    add(key) {
      const [x, y] = String(key).split(",").map(Number);
      return this.addPoint(x, y);
    }

    has(key) {
      const [x, y] = String(key).split(",").map(Number);
      return this.hasPoint(x, y);
    }

    delete(key) {
      const [x, y] = String(key).split(",").map(Number);
      return this.deletePoint(x, y);
    }

    clear() {
      this.bits.fill(0);
      this.count = 0;
      this.cachedBounds = null;
      this.boundsDirty = false;
    }

    forEachPoint(callback) {
      for (let index = 0; index < this.bits.length; index++) if (this.bits[index]) callback(index % this.width, Math.floor(index / this.width));
    }

    forEach(callback, thisArg) {
      this.forEachPoint((x, y) => {
        const key = keyFor(x, y);
        callback.call(thisArg, key, key, this);
      });
    }

    *values() {
      for (let index = 0; index < this.bits.length; index++) if (this.bits[index]) yield keyFor(index % this.width, Math.floor(index / this.width));
    }

    keys() { return this.values(); }

    *entries() {
      for (const key of this.values()) yield [key, key];
    }

    [Symbol.iterator]() { return this.values(); }

    bounds() {
      if (!this.count) return null;
      if (!this.boundsDirty && this.cachedBounds) return { ...this.cachedBounds };
      let minX = this.width;
      let minY = this.height;
      let maxX = -1;
      let maxY = -1;
      this.forEachPoint((x, y) => {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
      this.cachedBounds = maxX < minX ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
      this.boundsDirty = false;
      return this.cachedBounds ? { ...this.cachedBounds } : null;
    }
  }

  function forEachMaskPoint(mask, callback) {
    if (!mask || typeof callback !== "function") return;
    if (mask instanceof PixelMask) {
      mask.forEachPoint(callback);
      return;
    }
    mask.forEach?.(key => {
      const [x, y] = String(key).split(",").map(Number);
      if (Number.isInteger(x) && Number.isInteger(y)) callback(x, y);
    });
  }

  function maskHas(mask, x, y) {
    return mask instanceof PixelMask ? mask.hasPoint(x, y) : Boolean(mask?.has?.(keyFor(x, y)));
  }

  function maskDimensions(mask) {
    if (mask instanceof PixelMask) return { width: mask.width, height: mask.height };
    let width = 1;
    let height = 1;
    forEachMaskPoint(mask, (x, y) => {
      width = Math.max(width, x + 1);
      height = Math.max(height, y + 1);
    });
    return { width, height };
  }

  function maskRuns(mask) {
    const runs = [];
    if (mask instanceof PixelMask) {
      for (let y = 0; y < mask.height; y++) {
        let start = -1;
        for (let x = 0; x <= mask.width; x++) {
          const selected = x < mask.width && mask.bits[y * mask.width + x] === 1;
          if (selected && start < 0) start = x;
          else if (!selected && start >= 0) {
            runs.push({ x: start, y, w: x - start });
            start = -1;
          }
        }
      }
      return runs;
    }
    const rows = new Map();
    forEachMaskPoint(mask, (x, y) => {
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(x);
    });
    [...rows.keys()].sort((a, b) => a - b).forEach(y => {
      const columns = [...new Set(rows.get(y))].sort((a, b) => a - b);
      let start = columns[0];
      let previous = start;
      for (let index = 1; index <= columns.length; index++) {
        const column = columns[index];
        if (column === previous + 1) {
          previous = column;
          continue;
        }
        if (Number.isInteger(start)) runs.push({ x: start, y, w: previous - start + 1 });
        start = column;
        previous = column;
      }
    });
    return runs;
  }

  function createMask(width, height, source = null) {
    return new PixelMask(width, height, source);
  }

  function cloneMask(mask, width, height) {
    const dimensions = maskDimensions(mask);
    return createMask(width || dimensions.width, height || dimensions.height, mask);
  }

  function normalizeHex(value, fallback = "#000000") {
    const text = String(value || "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    return fallback;
  }

  function hexToRgb(value) {
    const hex = normalizeHex(value).slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function rgbToHsl(r, g, b) {
    const red = clamp(r, 0, 255) / 255;
    const green = clamp(g, 0, 255) / 255;
    const blue = clamp(b, 0, 255) / 255;
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const lightness = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l: lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue = 0;
    if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    return { h: hue / 6, s: saturation, l: lightness };
  }

  function hslToRgb(h, s, l) {
    const hue = ((Number(h) || 0) % 1 + 1) % 1;
    const saturation = clamp(s, 0, 1);
    const lightness = clamp(l, 0, 1);
    if (saturation === 0) {
      const value = Math.round(lightness * 255);
      return { r: value, g: value, b: value };
    }
    const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;
    const channel = offset => {
      let t = hue + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: Math.round(channel(1 / 3) * 255), g: Math.round(channel(0) * 255), b: Math.round(channel(-1 / 3) * 255) };
  }

  function adjustColor(value, hueShift = 0, saturationShift = 0, lightnessShift = 0) {
    const rgb = hexToRgb(value);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const next = hslToRgb(hsl.h + (Number(hueShift) || 0) / 360, hsl.s + (Number(saturationShift) || 0) / 100, hsl.l + (Number(lightnessShift) || 0) / 100);
    return rgbToHex(next.r, next.g, next.b);
  }

  function colorRamp(start, end, steps = 6) {
    const count = clamp(Math.round(steps), 2, 32);
    const first = hexToRgb(start);
    const last = hexToRgb(end);
    return Array.from({ length: count }, (_value, index) => {
      const ratio = index / (count - 1);
      return rgbToHex(first.r + (last.r - first.r) * ratio, first.g + (last.g - first.g) * ratio, first.b + (last.b - first.b) * ratio);
    });
  }

  function colorEntries(project) {
    const counts = new Map();
    const seen = new Set();
    const frames = Array.isArray(project?.frames) ? project.frames : [];
    frames.forEach(frame => (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
      const pixels = Array.isArray(layer?.pixels) ? layer.pixels : [];
      if (seen.has(pixels)) return;
      seen.add(pixels);
      pixels.forEach(row => (Array.isArray(row) ? row : []).forEach(value => {
        if (!value) return;
        const color = normalizeHex(value, "");
        if (!color) return;
        counts.set(color, (counts.get(color) || 0) + 1);
      }));
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function extractPalette(project, maximum = 64) {
    return colorEntries(project).slice(0, clamp(maximum, 2, 256)).map(entry => entry[0]);
  }

  function paletteUsage(project) {
    return Object.fromEntries(colorEntries(project));
  }

  function sortPalette(colors, mode = "hue") {
    return [...new Set((Array.isArray(colors) ? colors : []).map(value => normalizeHex(value)))].sort((left, right) => {
      const leftRgb = hexToRgb(left);
      const rightRgb = hexToRgb(right);
      const a = rgbToHsl(leftRgb.r, leftRgb.g, leftRgb.b);
      const b = rgbToHsl(rightRgb.r, rightRgb.g, rightRgb.b);
      if (mode === "value") return a.l - b.l || a.s - b.s || a.h - b.h;
      return a.h - b.h || a.s - b.s || a.l - b.l;
    });
  }

  function remapProjectColor(project, source, target) {
    const from = normalizeHex(source, "");
    const to = normalizeHex(target, "");
    if (!from || !to || from === to) return 0;
    let changed = 0;
    const seen = new Set();
    (Array.isArray(project?.frames) ? project.frames : []).forEach(frame => (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
      const pixels = Array.isArray(layer?.pixels) ? layer.pixels : [];
      if (seen.has(pixels)) return;
      seen.add(pixels);
      pixels.forEach(row => (Array.isArray(row) ? row : []).forEach((value, index) => {
        if (value && normalizeHex(value, "") === from) {
          row[index] = to;
          changed++;
        }
      }));
    }));
    return changed;
  }

  function polygonMask(points, width, height) {
    const safePoints = Array.isArray(points) ? points.filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y)) : [];
    const mask = createMask(width, height);
    if (safePoints.length < 3) return mask;
    let pathMinY = safePoints[0].y;
    let pathMaxY = safePoints[0].y;
    for (let index = 1; index < safePoints.length; index++) {
      pathMinY = Math.min(pathMinY, safePoints[index].y);
      pathMaxY = Math.max(pathMaxY, safePoints[index].y);
    }
    const minY = Math.max(0, Math.floor(pathMinY));
    const maxY = Math.min(height - 1, Math.ceil(pathMaxY));
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      const intersections = [];
      for (let i = 0, j = safePoints.length - 1; i < safePoints.length; j = i++) {
        const a = safePoints[i];
        const b = safePoints[j];
        if ((a.y > py) === (b.y > py)) continue;
        intersections.push(((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x);
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const start = Math.max(0, Math.ceil(intersections[index] - 0.5));
        const end = Math.min(width - 1, Math.ceil(intersections[index + 1] - 0.5) - 1);
        for (let x = start; x <= end; x++) mask.addPoint(x, y);
      }
    }
    return mask;
  }

  // Selection shapes
  function ellipseMask(box, width, height) {
    const mask = createMask(width, height);
    if (!box || box.w < 1 || box.h < 1) return mask;
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    const radiusX = box.w / 2;
    const radiusY = box.h / 2;
    for (let y = Math.max(0, box.y); y < Math.min(height, box.y + box.h); y++) for (let x = Math.max(0, box.x); x < Math.min(width, box.x + box.w); x++) {
      const dx = (x + 0.5 - centerX) / radiusX;
      const dy = (y + 0.5 - centerY) / radiusY;
      if (dx * dx + dy * dy <= 1) mask.addPoint(x, y);
    }
    return mask;
  }

  function floodMask(pixels, startX, startY, width, height) {
    const x = Math.round(startX);
    const y = Math.round(startY);
    if (x < 0 || y < 0 || x >= width || y >= height) return createMask(width, height);
    const target = pixels?.[y]?.[x] || null;
    const mask = createMask(width, height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height * 2);
    let cursor = 0;
    let end = 0;
    queue[end++] = x;
    queue[end++] = y;
    visited[y * width + x] = 1;
    while (cursor < end) {
      const cx = queue[cursor++];
      const cy = queue[cursor++];
      const index = cy * width + cx;
      if ((pixels?.[cy]?.[cx] || null) !== target) continue;
      mask.addPoint(cx, cy);
      if (cx > 0 && !visited[index - 1]) { visited[index - 1] = 1; queue[end++] = cx - 1; queue[end++] = cy; }
      if (cx + 1 < width && !visited[index + 1]) { visited[index + 1] = 1; queue[end++] = cx + 1; queue[end++] = cy; }
      if (cy > 0 && !visited[index - width]) { visited[index - width] = 1; queue[end++] = cx; queue[end++] = cy - 1; }
      if (cy + 1 < height && !visited[index + width]) { visited[index + width] = 1; queue[end++] = cx; queue[end++] = cy + 1; }
    }
    return mask;
  }

  function colorMask(pixels, color, width, height) {
    const target = typeof color === "string" ? color.toLowerCase() : null;
    const mask = createMask(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const value = pixels?.[y]?.[x] || null;
      const comparable = typeof value === "string" ? value.toLowerCase() : null;
      if (comparable === target) mask.addPoint(x, y);
    }
    return mask;
  }

  function boxMask(box, width = 0, height = 0) {
    const mask = createMask(width || Math.max(1, (box?.x || 0) + (box?.w || 0)), height || Math.max(1, (box?.y || 0) + (box?.h || 0)));
    if (!box) return mask;
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) mask.addPoint(x, y);
    return mask;
  }

  // Mask combinations
  function combineMasks(base, next, mode = "replace") {
    const baseDimensions = maskDimensions(base);
    const nextDimensions = maskDimensions(next);
    const width = Math.max(baseDimensions.width, nextDimensions.width);
    const height = Math.max(baseDimensions.height, nextDimensions.height);
    if (mode === "intersect") {
      const result = createMask(width, height);
      forEachMaskPoint(next, (x, y) => { if (maskHas(base, x, y)) result.addPoint(x, y); });
      return result;
    }
    const result = createMask(width, height, mode === "replace" ? null : base);
    if (mode === "subtract") {
      forEachMaskPoint(next, (x, y) => result.deletePoint(x, y));
      return result;
    }
    forEachMaskPoint(next, (x, y) => result.addPoint(x, y));
    return result;
  }

  function maskBounds(mask, width, height) {
    if (!(mask instanceof Set) || !mask.size) return null;
    if (mask instanceof PixelMask) return mask.bounds();
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    mask.forEach(key => {
      const [x, y] = key.split(",").map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) return;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    return maxX < minX ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function morphMask(mask, width, height, amount = 1) {
    let current = cloneMask(mask, width, height);
    const steps = clamp(Math.abs(Math.round(amount)), 1, 32);
    const grow = amount >= 0;
    for (let step = 0; step < steps; step++) {
      const next = createMask(width, height);
      if (grow) {
        forEachMaskPoint(current, (x, y) => {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) next.addPoint(nx, ny);
          }
        });
      } else {
        forEachMaskPoint(current, (x, y) => {
          let keep = true;
          for (let dy = -1; dy <= 1 && keep; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !maskHas(current, nx, ny)) {
              keep = false;
              break;
            }
          }
          if (keep) next.addPoint(x, y);
        });
      }
      current = next;
      if (!current.size) break;
    }
    return current;
  }

  function gridBounds(pixels) {
    const height = Array.isArray(pixels) ? pixels.length : 0;
    const width = height ? Math.max(...pixels.map(row => Array.isArray(row) ? row.length : 0), 0) : 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[y]?.[x]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return maxX < minX ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function projectBounds(project, width, height) {
    let result = null;
    (Array.isArray(project?.frames) ? project.frames : []).forEach(frame => (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
      const bounds = gridBounds(layer?.pixels);
      if (!bounds) return;
      if (!result) result = { ...bounds };
      else {
        const right = Math.max(result.x + result.w, bounds.x + bounds.w);
        const bottom = Math.max(result.y + result.h, bounds.y + bounds.h);
        result.x = Math.min(result.x, bounds.x);
        result.y = Math.min(result.y, bounds.y);
        result.w = right - result.x;
        result.h = bottom - result.y;
      }
    }));
    return result || { x: 0, y: 0, w: Math.max(1, width), h: Math.max(1, height) };
  }

  function cropGrid(pixels, box) {
    return Array.from({ length: box.h }, (_value, y) => Array.from({ length: box.w }, (_inner, x) => pixels?.[box.y + y]?.[box.x + x] || null));
  }

  // Canvas anchors
  function resizeGridCanvas(pixels, width, height, nextWidth, nextHeight, anchor = "center") {
    const output = Array.from({ length: nextHeight }, () => Array.from({ length: nextWidth }, () => null));
    const horizontal = anchor.endsWith("right") ? 1 : (anchor.includes("center") || anchor === "top-center" || anchor === "bottom-center") ? 0.5 : 0;
    const vertical = anchor.startsWith("bottom") ? 1 : (anchor.startsWith("middle") || anchor === "center") ? 0.5 : 0;
    const offsetX = Math.floor((nextWidth - width) * horizontal);
    const offsetY = Math.floor((nextHeight - height) * vertical);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const nx = x + offsetX;
      const ny = y + offsetY;
      if (nx >= 0 && ny >= 0 && nx < nextWidth && ny < nextHeight) output[ny][nx] = pixels?.[y]?.[x] || null;
    }
    return output;
  }

  function resampleNearest(pixels, width, height, nextWidth, nextHeight) {
    return Array.from({ length: nextHeight }, (_value, y) => Array.from({ length: nextWidth }, (_inner, x) => {
      const sourceX = Math.min(width - 1, Math.floor(x * width / nextWidth));
      const sourceY = Math.min(height - 1, Math.floor(y * height / nextHeight));
      return pixels?.[sourceY]?.[sourceX] || null;
    }));
  }

  function flipGrid(pixels, horizontal = true) {
    if (horizontal) return (Array.isArray(pixels) ? pixels : []).map(row => [...(Array.isArray(row) ? row : [])].reverse());
    return [...(Array.isArray(pixels) ? pixels : [])].reverse().map(row => [...(Array.isArray(row) ? row : [])]);
  }

  function rotateGrid(pixels, width, height) {
    return Array.from({ length: width }, (_value, y) => Array.from({ length: height }, (_inner, x) => pixels?.[height - 1 - x]?.[y] || null));
  }

  function safeFilename(value, fallback = "pixel-bug-sheet") {
    const text = String(value || "").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return text || fallback;
  }

  const api = {
    adjustColor,
    boxMask,
    cloneMask,
    colorMask,
    colorRamp,
    ellipseMask,
    combineMasks,
    createMask,
    cropGrid,
    extractPalette,
    flipGrid,
    floodMask,
    forEachMaskPoint,
    gridBounds,
    maskBounds,
    maskHas,
    maskRuns,
    morphMask,
    normalizeHex,
    paletteUsage,
    polygonMask,
    projectBounds,
    remapProjectColor,
    resampleNearest,
    resizeGridCanvas,
    rotateGrid,
    safeFilename,
    sortPalette
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PixelBugEditorFeatures = api;
})();
