"use strict";

// Pose raster
(function attachVoxelBaseCapture(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelBaseCapture = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function rasterize(image, sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const width = Math.max(1, Math.floor(Number(targetWidth) || 1));
    const height = Math.max(1, Math.floor(Number(targetHeight) || 1));
    const sw = Math.max(1, Math.floor(Number(sourceWidth) || 1));
    const sh = Math.max(1, Math.floor(Number(sourceHeight) || 1));
    if (sw * sh > 16777216 || width * height > 4194304 || !image || image.length < sw * sh * 4) throw new Error("Pose image dimensions are unsupported.");
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      if (image[(y * sw + x) * 4 + 3] < 24) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < x0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const margin = Math.min(3, Math.max(1, Math.floor(Math.min(width, height) * .06)));
    const scale = Math.min((width - margin * 2) / bw, (height - margin * 2) / bh);
    if (!(scale > 0)) return null;
    const offsetX = (width - bw * scale) / 2;
    const offsetY = (height - bh * scale) / 2;
    const accum = new Float64Array(width * height * 5);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const source = (y * sw + x) * 4;
      const a = image[source + 3];
      if (a < 16) continue;
      const tx = Math.max(0, Math.min(width - 1, Math.floor((x - x0 + .5) * scale + offsetX)));
      const ty = Math.max(0, Math.min(height - 1, Math.floor((y - y0 + .5) * scale + offsetY)));
      const dest = (ty * width + tx) * 5;
      accum[dest] += image[source] * a;
      accum[dest + 1] += image[source + 1] * a;
      accum[dest + 2] += image[source + 2] * a;
      accum[dest + 3] += a;
      accum[dest + 4]++;
    }
    const pixels = Array.from({ length: height }, () => Array(width).fill(null));
    let drawn = 0;
    const hex = value => Math.round(value).toString(16).padStart(2, "0");
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 5;
      const alpha = accum[offset + 3];
      if (alpha <= 0 || alpha / Math.max(1, accum[offset + 4]) < 24) continue;
      pixels[y][x] = `#${hex(accum[offset] / alpha)}${hex(accum[offset + 1] / alpha)}${hex(accum[offset + 2] / alpha)}`;
      drawn++;
    }
    return drawn ? pixels : null;
  }
  // Flat sampling
  function rasterizeFlat(image, sourceWidth, sourceHeight, targetWidth, targetHeight, palette = []) {
    const sw = Math.max(1, Math.floor(Number(sourceWidth) || 1));
    const sh = Math.max(1, Math.floor(Number(sourceHeight) || 1));
    const width = Math.max(1, Math.floor(Number(targetWidth) || 1));
    const height = Math.max(1, Math.floor(Number(targetHeight) || 1));
    if (!image || image.length < sw * sh * 4 || sw * sh > 16777216 || width * height > 4194304) throw new Error("Pose image dimensions are unsupported.");
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      if (image[(y * sw + x) * 4 + 3] < 64) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < x0) return null;
    const margin = Math.min(3, Math.max(1, Math.floor(Math.min(width, height) * .06)));
    const scale = Math.min((width - margin * 2) / (x1 - x0 + 1), (height - margin * 2) / (y1 - y0 + 1));
    if (!(scale > 0)) return null;
    const offsetX = (width - (x1 - x0 + 1) * scale) / 2;
    const offsetY = (height - (y1 - y0 + 1) * scale) / 2;
    const frequencies = Array(width * height).fill(null);
    const opaqueFrequencies = Array(width * height).fill(null);
    const alphaTotals = new Float64Array(width * height);
    const opaqueTotals = new Float64Array(width * height);
    const shadeCache = new Map();
    const colors = [...new Set(palette.filter(value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value)).map(value => value.toLowerCase()))].map(color => ({ color, rgb: [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)) }));
    const hex = value => value.toString(16).padStart(2, "0");
    const nearest = (red, green, blue) => {
      const key = `${hex(red)}${hex(green)}${hex(blue)}`;
      if (shadeCache.has(key)) return shadeCache.get(key);
      let selected = `#${key}`;
      if (colors.length && colors.length <= 2048) {
        let best = Infinity;
        for (const candidate of colors) {
          const dist = (red - candidate.rgb[0]) ** 2 + (green - candidate.rgb[1]) ** 2 + (blue - candidate.rgb[2]) ** 2;
          if (dist < best) { best = dist; selected = candidate.color; }
          if (best === 0) break;
        }
      }
      shadeCache.set(key, selected);
      return selected;
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const source = (y * sw + x) * 4;
      const a = image[source + 3];
      if (a < 64) continue;
      const tx = Math.max(0, Math.min(width - 1, Math.floor((x - x0 + .5) * scale + offsetX)));
      const ty = Math.max(0, Math.min(height - 1, Math.floor((y - y0 + .5) * scale + offsetY)));
      const index = ty * width + tx;
      if (!frequencies[index]) frequencies[index] = new Map();
      const color = nearest(image[source], image[source + 1], image[source + 2]);
      const weight = a / 255;
      frequencies[index].set(color, (frequencies[index].get(color) || 0) + weight);
      alphaTotals[index] += weight;
      if (a >= 224) {
        if (!opaqueFrequencies[index]) opaqueFrequencies[index] = new Map();
        opaqueFrequencies[index].set(color, (opaqueFrequencies[index].get(color) || 0) + 1);
        opaqueTotals[index] += 1;
      }
    }
    const pixels = Array.from({ length: height }, () => Array(width).fill(null));
    const fringe = Array.from({ length: height }, () => Array(width).fill(false));
    let drawn = 0;
    const brightness = color => { const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)); return rgb[0] * .213 + rgb[1] * .715 + rgb[2] * .072; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const counts = frequencies[index];
      if (!counts) continue;
      const opaqueCounts = opaqueFrequencies[index];
      const ranked = [...(opaqueCounts?.size ? opaqueCounts : counts)].sort((a, b) => b[1] - a[1]);
      let chosen = ranked[0][0];
      const total = [...counts].reduce((sum, entry) => sum + entry[1], 0);
      if (!opaqueCounts?.size) {
        for (const [color, weight] of ranked.slice(1)) {
          if (weight < 2 || weight / total < .14 || brightness(chosen) - brightness(color) < 65) continue;
          chosen = color;
          break;
        }
      }
      pixels[y][x] = chosen;
      fringe[y][x] = alphaTotals[index] < .95 || opaqueTotals[index] < 1;
      drawn++;
    }
    const cleaned = pixels.map(row => row.slice());
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = pixels[y][x];
      if (!color || !fringe[y][x]) continue;
      const neighbors = new Map();
      let sameCount = 0;
      [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx, dy]) => {
        const other = pixels[y + dy]?.[x + dx];
        if (!other) return;
        if (other === color) {
          sameCount += dx && dy ? 1 : 2;
          return;
        }
        neighbors.set(other, (neighbors.get(other) || 0) + (dx && dy ? 1 : 2));
      });
      const replacement = [...neighbors].sort((a, b) => b[1] - a[1])[0];
      if (replacement && replacement[1] >= 3 && replacement[1] > sameCount) cleaned[y][x] = replacement[0];
      else if (sameCount === 0 && !neighbors.size) cleaned[y][x] = null;
    }
    return drawn ? cleaned : null;
  }
  // Pixel finishing
  function blockPixels(pixels, style = "chunky") {
    if (!pixels || style === "detail" || style === "flat") return pixels;
    const height = pixels.length;
    const width = pixels[0]?.length || 0;
    if (!width || !height) return pixels;
    const smallest = Math.min(width, height);
    const step = style === "chunky"
      ? (smallest >= 128 ? 5 : smallest >= 64 ? 4 : smallest >= 32 ? 3 : 2)
      : (smallest >= 128 ? 4 : smallest >= 80 ? 3 : smallest >= 32 ? 2 : 1);
    if (step === 1) return pixels;
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (pixels[y][x] == null) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < x0) return pixels;
    const blocks = [];
    const paletteCounts = new Map();
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      const right = Math.min(x1 + 1, x + step);
      const bottom = Math.min(y1 + 1, y + step);
      let n = 0, red = 0, green = 0, blue = 0;
      const colors = new Map();
      for (let py = y; py < bottom; py++) for (let px = x; px < right; px++) {
        const color = pixels[py][px];
        if (!color || !/^#[0-9a-f]{6}$/i.test(color)) continue;
        n++;
        colors.set(color, (colors.get(color) || 0) + 1);
        red += parseInt(color.slice(1, 3), 16);
        green += parseInt(color.slice(3, 5), 16);
        blue += parseInt(color.slice(5, 7), 16);
      }
      if (n / ((right - x) * (bottom - y)) < (style === "chunky" ? .4 : .34)) continue;
      const hex = value => Math.round(value).toString(16).padStart(2, "0");
      const dominant = [...colors].sort((a, b) => b[1] - a[1])[0];
      const average = `#${hex(red / n)}${hex(green / n)}${hex(blue / n)}`;
      const color = dominant && dominant[1] >= Math.ceil(n * .6) ? dominant[0].toLowerCase() : average;
      blocks.push({ x, y, right, bottom, color });
      paletteCounts.set(color, (paletteCounts.get(color) || 0) + 1);
    }
    const paletteLimit = style === "chunky" ? 12 : 24;
    const palette = [];
    const asRgb = color => [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    const distance = (a, b) => (a[0] - b[0]) ** 2 * .8 + (a[1] - b[1]) ** 2 * 1.2 + (a[2] - b[2]) ** 2 * .65;
    for (const [color] of [...paletteCounts].sort((a, b) => b[1] - a[1])) {
      const rgb = asRgb(color);
      if (palette.some(entry => distance(entry.rgb, rgb) < 450)) continue;
      if (palette.length >= paletteLimit) break;
      palette.push({ color, rgb });
    }
    const cleaned = Array.from({ length: height }, () => Array(width).fill(null));
    for (const block of blocks) {
      const rgb = asRgb(block.color);
      const selected = palette.length ? palette.reduce((best, entry) => distance(entry.rgb, rgb) < distance(best.rgb, rgb) ? entry : best) : { color: block.color };
      for (let y = block.y; y < block.bottom; y++) for (let x = block.x; x < block.right; x++) cleaned[y][x] = selected.color;
    }
    return cleaned;
  }
  // Palette grouping
  function mergeSimilarColors(pixels, style = "clean") {
    if (!pixels?.length || !pixels[0]?.length) return pixels;
    const options = style === "soft" ? { distance: 340, channel: 16, lightness: 16 }
      : style === "bold" ? { distance: 1500, channel: 32, lightness: 29 }
      : { distance: 800, channel: 24, lightness: 22 };
    const frequencies = new Map();
    for (const row of pixels) for (const color of row) {
      if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) continue;
      const key = color.toLowerCase();
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
    }
    if (!frequencies.size) return pixels;
    const asRgb = color => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    const brightness = rgb => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    const distance = (a, b) => (a[0] - b[0]) ** 2 * .85 + (a[1] - b[1]) ** 2 * 1.2 + (a[2] - b[2]) ** 2 * .7;
    const bins = new Map();
    const groups = [];
    const assignments = new Map();
    const cellSize = 16;
    const radius = Math.ceil(options.channel / cellSize);
    const bucketKey = (r, g, b) => `${r}:${g}:${b}`;
    const entries = [...frequencies].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [color, weight] of entries) {
      const rgb = asRgb(color);
      const coords = rgb.map(value => Math.floor(value / cellSize));
      let best = null, bestDistance = Infinity;
      for (let r = coords[0] - radius; r <= coords[0] + radius; r++) {
        for (let g = coords[1] - radius; g <= coords[1] + radius; g++) {
          for (let b = coords[2] - radius; b <= coords[2] + radius; b++) {
            for (const group of bins.get(bucketKey(r, g, b)) || []) {
              if (rgb.some((value, index) => Math.abs(value - group.seed[index]) > options.channel)) continue;
              if (Math.abs(brightness(rgb) - group.brightness) > options.lightness) continue;
              const delta = distance(rgb, group.seed);
              if (delta < bestDistance && delta <= options.distance) {
                best = group;
                bestDistance = delta;
              }
            }
          }
        }
      }
      if (!best) {
        best = { seed: rgb, brightness: brightness(rgb), sum: [0, 0, 0], weight: 0, hex: color };
        groups.push(best);
        const key = bucketKey(...coords);
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(best);
      }
      best.weight += weight;
      for (let channel = 0; channel < 3; channel++) best.sum[channel] += rgb[channel] * weight;
      assignments.set(color, best);
    }
    const hex = value => Math.round(value).toString(16).padStart(2, "0");
    for (const group of groups) {
      group.hex = `#${group.sum.map(total => hex(total / group.weight)).join("")}`;
    }
    return pixels.map(row => row.map(color => color == null ? null : (assignments.get(String(color).toLowerCase())?.hex || color)));
  }
  // Flat sampling
  function rasterizeFlat(image, sourceWidth, sourceHeight, targetWidth, targetHeight, palette = []) {
    const sw = Math.max(1, Math.floor(Number(sourceWidth) || 1));
    const sh = Math.max(1, Math.floor(Number(sourceHeight) || 1));
    const width = Math.max(1, Math.floor(Number(targetWidth) || 1));
    const height = Math.max(1, Math.floor(Number(targetHeight) || 1));
    if (!image || image.length < sw * sh * 4 || sw * sh > 16777216 || width * height > 4194304) throw new Error("Pose image dimensions are unsupported.");
    let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      if (image[(y * sw + x) * 4 + 3] < 64) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 < x0) return null;
    const margin = Math.min(3, Math.max(1, Math.floor(Math.min(width, height) * .06)));
    const scale = Math.min((width - margin * 2) / (x1 - x0 + 1), (height - margin * 2) / (y1 - y0 + 1));
    if (!(scale > 0)) return null;
    const offsetX = (width - (x1 - x0 + 1) * scale) / 2;
    const offsetY = (height - (y1 - y0 + 1) * scale) / 2;
    const frequencies = Array(width * height).fill(null);
    const opaqueFrequencies = Array(width * height).fill(null);
    const alphaTotals = new Float64Array(width * height);
    const opaqueTotals = new Float64Array(width * height);
    const shadeCache = new Map();
    const colors = [...new Set(palette.filter(value => typeof value === "string" && /^#[\da-f]{6}$/i.test(value)).map(value => value.toLowerCase()))].map(color => ({ color, rgb: [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)) }));
    const hex = value => value.toString(16).padStart(2, "0");
    const nearest = (red, green, blue) => {
      const key = `${hex(red)}${hex(green)}${hex(blue)}`;
      if (shadeCache.has(key)) return shadeCache.get(key);
      let selected = `#${key}`;
      if (colors.length && colors.length <= 2048) {
        let best = Infinity;
        for (const candidate of colors) {
          const dist = (red - candidate.rgb[0]) ** 2 + (green - candidate.rgb[1]) ** 2 + (blue - candidate.rgb[2]) ** 2;
          if (dist < best) { best = dist; selected = candidate.color; }
          if (best === 0) break;
        }
      }
      shadeCache.set(key, selected);
      return selected;
    };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const source = (y * sw + x) * 4;
      const a = image[source + 3];
      if (a < 64) continue;
      const tx = Math.max(0, Math.min(width - 1, Math.floor((x - x0 + .5) * scale + offsetX)));
      const ty = Math.max(0, Math.min(height - 1, Math.floor((y - y0 + .5) * scale + offsetY)));
      const index = ty * width + tx;
      if (!frequencies[index]) frequencies[index] = new Map();
      const color = nearest(image[source], image[source + 1], image[source + 2]);
      const weight = a / 255;
      frequencies[index].set(color, (frequencies[index].get(color) || 0) + weight);
      alphaTotals[index] += weight;
      if (a >= 224) {
        if (!opaqueFrequencies[index]) opaqueFrequencies[index] = new Map();
        opaqueFrequencies[index].set(color, (opaqueFrequencies[index].get(color) || 0) + 1);
        opaqueTotals[index] += 1;
      }
    }
    const pixels = Array.from({ length: height }, () => Array(width).fill(null));
    const fringe = Array.from({ length: height }, () => Array(width).fill(false));
    let drawn = 0;
    const brightness = color => { const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16)); return rgb[0] * .213 + rgb[1] * .715 + rgb[2] * .072; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const counts = frequencies[index];
      if (!counts) continue;
      const opaqueCounts = opaqueFrequencies[index];
      const ranked = [...(opaqueCounts?.size ? opaqueCounts : counts)].sort((a, b) => b[1] - a[1]);
      let chosen = ranked[0][0];
      const total = [...counts].reduce((sum, entry) => sum + entry[1], 0);
      if (!opaqueCounts?.size) {
        for (const [color, weight] of ranked.slice(1)) {
          if (weight < 2 || weight / total < .14 || brightness(chosen) - brightness(color) < 65) continue;
          chosen = color;
          break;
        }
      }
      pixels[y][x] = chosen;
      fringe[y][x] = alphaTotals[index] < .95 || opaqueTotals[index] < 1;
      drawn++;
    }
    const cleaned = pixels.map(row => row.slice());
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const color = pixels[y][x];
      if (!color || !fringe[y][x]) continue;
      const neighbors = new Map();
      [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([dx, dy]) => {
        const other = pixels[y + dy]?.[x + dx];
        if (!other || other === color) return;
        neighbors.set(other, (neighbors.get(other) || 0) + (dx && dy ? 1 : 2));
      });
      const replacement = [...neighbors].sort((a, b) => b[1] - a[1])[0];
      if (replacement && replacement[1] >= 3) cleaned[y][x] = replacement[0];
    }
    return drawn ? cleaned : null;
  }
  // Pixel finishing
  function cleanPixels(pixels, style = "clean") {
    if (!pixels || style === "detail" || style === "flat") return pixels;
    if (style === "chunky") return blockPixels(pixels, "chunky");
    return mergeSimilarColors(pixels, ["soft", "bold"].includes(style) ? style : "clean");
  }
  function fromCanvas(canvas, width, height, style = "clean") {
    if (!canvas || !canvas.width || !canvas.height) return null;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return style === "flat" ? rasterizeFlat(image.data, canvas.width, canvas.height, width, height, canvas.capturePalette) : cleanPixels(rasterize(image.data, canvas.width, canvas.height, width, height), style);
  }
  function frameRecord(pixels, name, duration, makeLayer) {
    const width = pixels?.[0]?.length || 0;
    const height = pixels?.length || 0;
    if (!width || !height || pixels.some(row => !Array.isArray(row) || row.length !== width)) throw new Error("The captured pose is not valid.");
    const art = makeLayer(width, `Voxel Pose: ${String(name || "Pose").trim().slice(0, 48)}`, height);
    art.pixels = pixels.map(row => row.slice());
    art.sourcePixels = pixels.map(row => row.slice());
    art.sourceWidth = width;
    art.sourceHeight = height;
    art.sourceSize = Math.max(width, height);
    return { tag: String(name || "Voxel Pose").trim().slice(0, 48), duration: Math.max(40, Math.min(2000, Number(duration) || 120)), layers: [art] };
  }
  function capture(config) {
    const { state, cubeCount, limit, name: rawName, action, finish = "clean", playing, stop, resume, preview, width, height, makeLayer, duration, beforeEdit } = config;
    if (!cubeCount) return { ok: false, message: "Create a voxel character before capturing a Base frame." };
    if (state.frames.length >= limit) return { ok: false, message: `The Base project has reached its ${limit}-frame limit.` };
    const name = String(rawName || "Voxel Pose").trim().slice(0, 48) || "Voxel Pose";
    let pixels;
    try {
      if (playing) stop();
      pixels = fromCanvas(preview(finish), width, height, finish);
    } catch (error) {
      return { ok: false, message: `Cannot capture 3D pose: ${error?.message || "preview failed"}.` };
    } finally {
      if (playing) resume();
    }
    if (!pixels) return { ok: false, message: "Nothing visible was captured. Position the 3D camera toward the character and try again." };
    const record = frameRecord(pixels, name, duration, makeLayer);
    beforeEdit();
    state.frames.push(record);
    const index = state.frames.length - 1;
    state.activeFrame = index;
    state.activeLayer = 0;
    if (["idle", "walk", "jump"].includes(action)) {
      state.playMode[`${action}Frame`] = index;
      state.playMode.voxelActorAssetId = "";
    }
    return { ok: true, index, message: `Captured “${name}” to new Base Frame ${index + 1} on its own layer.${action === "none" ? "" : ` Assigned as the Play Mode ${action} pose (2D sprite player).`}` };
  }
  return { rasterize, rasterizeFlat, cleanPixels, fromCanvas, frameRecord, capture };
});
