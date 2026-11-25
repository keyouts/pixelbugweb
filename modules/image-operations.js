(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(Number(value) || 0, max));

  function normalizeHex(value, fallback = "") {
    const text = String(value || "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
    return fallback;
  }

  function parseHex(value) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    const number = parseInt(hex.slice(1), 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }

  function toHex(r, g, b) {
    return `#${[r, g, b].map(value => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function colorMatches(value, target, tolerance = 0) {
    const left = parseHex(value);
    const right = parseHex(target);
    if (!left || !right) return false;
    const limit = clamp(Math.round(tolerance), 0, 255);
    return Math.max(Math.abs(left.r - right.r), Math.abs(left.g - right.g), Math.abs(left.b - right.b)) <= limit;
  }

  function similarMask(pixels, target, width, height, tolerance = 0, createMask) {
    const mask = createMask(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (colorMatches(pixels?.[y]?.[x], target, tolerance)) mask.addPoint(x, y);
    return mask;
  }

  function floodSimilarMask(pixels, startX, startY, width, height, tolerance = 0, createMask) {
    const x = Math.round(Number(startX));
    const y = Math.round(Number(startY));
    const mask = createMask(width, height);
    if (x < 0 || y < 0 || x >= width || y >= height) return mask;
    const target = pixels?.[y]?.[x] || null;
    if (!target) return mask;
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
      if (!colorMatches(pixels?.[cy]?.[cx], target, tolerance)) continue;
      mask.addPoint(cx, cy);
      if (cx > 0 && !visited[index - 1]) { visited[index - 1] = 1; queue[end++] = cx - 1; queue[end++] = cy; }
      if (cx + 1 < width && !visited[index + 1]) { visited[index + 1] = 1; queue[end++] = cx + 1; queue[end++] = cy; }
      if (cy > 0 && !visited[index - width]) { visited[index - width] = 1; queue[end++] = cx; queue[end++] = cy - 1; }
      if (cy + 1 < height && !visited[index + width]) { visited[index + width] = 1; queue[end++] = cx; queue[end++] = cy + 1; }
    }
    return mask;
  }

  function applyMatching(pixels, source, replacement, tolerance = 0, mask = null, maskHas = null) {
    let changed = 0;
    for (let y = 0; y < pixels.length; y++) for (let x = 0; x < (pixels[y]?.length || 0); x++) {
      if (mask && maskHas && !maskHas(mask, x, y)) continue;
      if (!colorMatches(pixels[y][x], source, tolerance)) continue;
      const next = replacement || null;
      if (pixels[y][x] === next) continue;
      pixels[y][x] = next;
      changed++;
    }
    return changed;
  }

  function removeColor(pixels, source, tolerance = 0, mask = null, maskHas = null) {
    return applyMatching(pixels, source, null, tolerance, mask, maskHas);
  }

  function replaceColor(pixels, source, target, tolerance = 0, mask = null, maskHas = null) {
    const replacement = normalizeHex(target);
    if (!replacement) return 0;
    return applyMatching(pixels, source, replacement, tolerance, mask, maskHas);
  }

  function invertMask(mask, width, height, createMask, maskHas) {
    const result = createMask(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (!maskHas(mask, x, y)) result.addPoint(x, y);
    return result;
  }

  function borderMask(mask, width, height, mode, createMask, morphMask, maskHas) {
    const result = createMask(width, height);
    const normalized = ["inside", "outside", "center"].includes(mode) ? mode : "inside";
    const inner = morphMask(mask, width, height, -1);
    const outer = morphMask(mask, width, height, 1);
    if (normalized === "inside" || normalized === "center") {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (maskHas(mask, x, y) && !maskHas(inner, x, y)) result.addPoint(x, y);
    }
    if (normalized === "outside" || normalized === "center") {
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (maskHas(outer, x, y) && !maskHas(mask, x, y)) result.addPoint(x, y);
    }
    return result;
  }

  function fillMask(pixels, mask, value, forEachMaskPoint) {
    const color = normalizeHex(value);
    if (!color) return 0;
    let changed = 0;
    forEachMaskPoint(mask, (x, y) => {
      if (!pixels?.[y] || pixels[y][x] === color) return;
      pixels[y][x] = color;
      changed++;
    });
    return changed;
  }

  function luminance(rgb) {
    return clamp(rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722, 0, 255);
  }

  function transformPixels(pixels, transform, mask = null, maskHas = null) {
    let changed = 0;
    const output = pixels.map(row => row.slice());
    for (let y = 0; y < pixels.length; y++) for (let x = 0; x < (pixels[y]?.length || 0); x++) {
      const value = pixels[y][x];
      if (!value || (mask && maskHas && !maskHas(mask, x, y))) continue;
      const next = transform(value, x, y);
      if (next === value) continue;
      output[y][x] = next;
      changed++;
    }
    return { pixels: output, changed };
  }

  function adjustColor(value, brightness = 0, contrast = 0, gamma = 1) {
    const rgb = parseHex(value);
    if (!rgb) return value;
    const bright = clamp(brightness, -100, 100) * 2.55;
    const contrastValue = clamp(contrast, -100, 100) * 2.55;
    const factor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
    const gammaValue = clamp(gamma, 0.1, 5);
    const channel = input => {
      const contrasted = factor * (input - 128) + 128 + bright;
      return 255 * Math.pow(clamp(contrasted, 0, 255) / 255, 1 / gammaValue);
    };
    return toHex(channel(rgb.r), channel(rgb.g), channel(rgb.b));
  }

  function thresholdColor(value, threshold, lowColor, highColor, lowTransparent = false, highTransparent = false) {
    const rgb = parseHex(value);
    if (!rgb) return value;
    const high = luminance(rgb) >= clamp(threshold, 0, 255);
    if (high) return highTransparent ? null : normalizeHex(highColor, "#ffffff");
    return lowTransparent ? null : normalizeHex(lowColor, "#000000");
  }

  function posterizeColor(value, levels = 4) {
    const rgb = parseHex(value);
    if (!rgb) return value;
    const count = clamp(Math.round(levels), 2, 32);
    const step = 255 / (count - 1);
    const channel = input => Math.round(input / step) * step;
    return toHex(channel(rgb.r), channel(rgb.g), channel(rgb.b));
  }

  function gradientColor(value, darkColor, lightColor) {
    const rgb = parseHex(value);
    const dark = parseHex(darkColor);
    const light = parseHex(lightColor);
    if (!rgb || !dark || !light) return value;
    const ratio = luminance(rgb) / 255;
    return toHex(dark.r + (light.r - dark.r) * ratio, dark.g + (light.g - dark.g) * ratio, dark.b + (light.b - dark.b) * ratio);
  }

  function paletteColor(value, palette) {
    const rgb = parseHex(value);
    const colors = (Array.isArray(palette) ? palette : []).map(value => normalizeHex(value)).filter(Boolean).map(hex => ({ hex, rgb: parseHex(hex) }));
    if (!rgb || !colors.length) return value;
    colors.sort((a, b) => luminance(a.rgb) - luminance(b.rgb));
    const index = Math.round((luminance(rgb) / 255) * (colors.length - 1));
    return colors[index].hex;
  }

  function grayscaleColor(value) {
    const rgb = parseHex(value);
    if (!rgb) return value;
    const gray = luminance(rgb);
    return toHex(gray, gray, gray);
  }

  function invertColor(value) {
    const rgb = parseHex(value);
    return rgb ? toHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b) : value;
  }

  function offsetGrid(pixels, width, height, dx = 0, dy = 0, wrap = true) {
    const output = Array.from({ length: height }, () => Array(width).fill(null));
    const shiftX = Math.round(Number(dx) || 0);
    const shiftY = Math.round(Number(dy) || 0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const value = pixels?.[y]?.[x] || null;
      if (!value) continue;
      let nx = x + shiftX;
      let ny = y + shiftY;
      if (wrap) {
        nx = ((nx % width) + width) % width;
        ny = ((ny % height) + height) % height;
      }
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) output[ny][nx] = value;
    }
    return output;
  }

  function swapProjectColors(project, first, second) {
    const left = normalizeHex(first);
    const right = normalizeHex(second);
    if (!left || !right || left === right) return 0;
    const seen = new Set();
    let changed = 0;
    (Array.isArray(project?.frames) ? project.frames : []).forEach(frame => (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
      const pixels = Array.isArray(layer?.pixels) ? layer.pixels : [];
      if (seen.has(pixels)) return;
      seen.add(pixels);
      pixels.forEach(row => (Array.isArray(row) ? row : []).forEach((value, index) => {
        const normalized = normalizeHex(value);
        if (normalized === left) { row[index] = right; changed++; }
        else if (normalized === right) { row[index] = left; changed++; }
      }));
    }));
    return changed;
  }

  const api = {
    adjustColor,
    borderMask,
    colorMatches,
    fillMask,
    floodSimilarMask,
    gradientColor,
    grayscaleColor,
    invertColor,
    invertMask,
    offsetGrid,
    paletteColor,
    posterizeColor,
    removeColor,
    replaceColor,
    similarMask,
    swapProjectColors,
    thresholdColor,
    transformPixels
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PixelBugImageOperations = api;
})();
