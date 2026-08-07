(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(Number(value) || 0, max));
  const keyFor = (x, y) => `${x},${y}`;

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
    const mask = new Set();
    if (safePoints.length < 3) return mask;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let inside = false;
        for (let i = 0, j = safePoints.length - 1; i < safePoints.length; j = i++) {
          const a = safePoints[i];
          const b = safePoints[j];
          const intersects = (a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / ((b.y - a.y) || 1e-9) + a.x;
          if (intersects) inside = !inside;
        }
        if (inside) mask.add(keyFor(x, y));
      }
    }
    return mask;
  }

  function floodMask(pixels, startX, startY, width, height) {
    const x = Math.round(startX);
    const y = Math.round(startY);
    if (x < 0 || y < 0 || x >= width || y >= height) return new Set();
    const target = pixels?.[y]?.[x] || null;
    const mask = new Set();
    const queue = [[x, y]];
    let cursor = 0;
    while (cursor < queue.length) {
      const [cx, cy] = queue[cursor++];
      const key = keyFor(cx, cy);
      if (mask.has(key)) continue;
      if ((pixels?.[cy]?.[cx] || null) !== target) continue;
      mask.add(key);
      if (cx > 0) queue.push([cx - 1, cy]);
      if (cx + 1 < width) queue.push([cx + 1, cy]);
      if (cy > 0) queue.push([cx, cy - 1]);
      if (cy + 1 < height) queue.push([cx, cy + 1]);
    }
    return mask;
  }

  function colorMask(pixels, color, width, height) {
    const target = color || null;
    const mask = new Set();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((pixels?.[y]?.[x] || null) === target) mask.add(keyFor(x, y));
    return mask;
  }

  function boxMask(box) {
    const mask = new Set();
    if (!box) return mask;
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) mask.add(keyFor(x, y));
    return mask;
  }

  function combineMasks(base, next, mode = "replace") {
    const result = mode === "replace" ? new Set() : new Set(base || []);
    if (mode === "subtract") {
      (next || []).forEach(key => result.delete(key));
      return result;
    }
    (next || []).forEach(key => result.add(key));
    return result;
  }

  function maskBounds(mask, width, height) {
    if (!(mask instanceof Set) || !mask.size) return null;
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
    let current = new Set(mask || []);
    const steps = clamp(Math.abs(Math.round(amount)), 1, 32);
    const grow = amount >= 0;
    for (let step = 0; step < steps; step++) {
      const next = new Set();
      if (grow) {
        current.forEach(key => {
          const [x, y] = key.split(",").map(Number);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) next.add(keyFor(nx, ny));
          }
        });
      } else {
        current.forEach(key => {
          const [x, y] = key.split(",").map(Number);
          let keep = true;
          for (let dy = -1; dy <= 1 && keep; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !current.has(keyFor(nx, ny))) {
              keep = false;
              break;
            }
          }
          if (keep) next.add(key);
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

  function resizeGridCanvas(pixels, width, height, nextWidth, nextHeight, anchor = "center") {
    const output = Array.from({ length: nextHeight }, () => Array.from({ length: nextWidth }, () => null));
    let offsetX = 0;
    let offsetY = 0;
    if (anchor === "center") {
      offsetX = Math.floor((nextWidth - width) / 2);
      offsetY = Math.floor((nextHeight - height) / 2);
    } else if (anchor === "bottom-right") {
      offsetX = nextWidth - width;
      offsetY = nextHeight - height;
    }
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
    colorMask,
    colorRamp,
    combineMasks,
    cropGrid,
    extractPalette,
    flipGrid,
    floodMask,
    gridBounds,
    maskBounds,
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
