(() => {
  "use strict";

  function drawOverlay(options = {}) {
    const { context, box, mask, cell, strokeStyle, fillStyle, EditorFeatures } = options;
    if (!context || !box || !EditorFeatures || !Number.isFinite(cell)) return;
    context.save();
    context.strokeStyle = strokeStyle;
    context.lineWidth = Math.max(1, Math.min(2, cell));
    context.setLineDash(cell >= 4 ? [6, 4] : []);
    context.fillStyle = fillStyle;
    if (mask instanceof Set && mask.size) {
      EditorFeatures.maskRuns(mask).forEach(run => context.fillRect(run.x * cell, run.y * cell, run.w * cell, cell));
      context.beginPath();
      EditorFeatures.forEachMaskPoint(mask, (x, y) => {
        if (!EditorFeatures.maskHas(mask, x - 1, y)) { context.moveTo(x * cell, y * cell); context.lineTo(x * cell, (y + 1) * cell); }
        if (!EditorFeatures.maskHas(mask, x + 1, y)) { context.moveTo((x + 1) * cell, y * cell); context.lineTo((x + 1) * cell, (y + 1) * cell); }
        if (!EditorFeatures.maskHas(mask, x, y - 1)) { context.moveTo(x * cell, y * cell); context.lineTo((x + 1) * cell, y * cell); }
        if (!EditorFeatures.maskHas(mask, x, y + 1)) { context.moveTo(x * cell, (y + 1) * cell); context.lineTo((x + 1) * cell, (y + 1) * cell); }
      });
      context.stroke();
    } else {
      const x = box.x * cell;
      const y = box.y * cell;
      const width = box.w * cell;
      const height = box.h * cell;
      context.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.max(1, Math.round(width) - 2), Math.max(1, Math.round(height) - 2));
      context.fillRect(x, y, width, height);
    }
    context.restore();
  }

  function shiftMask(mask, dx, dy, width, height, EditorFeatures) {
    const shifted = EditorFeatures.createMask(width, height);
    EditorFeatures.forEachMaskPoint(mask, (x, y) => shifted.addPoint(x + dx, y + dy));
    return shifted;
  }

  // Transform handles
  function handleCenters(box) {
    if (!box) return [];
    const left = box.x;
    const top = box.y;
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    const middleX = left + box.w / 2;
    const middleY = top + box.h / 2;
    return [
      ["nw", left, top], ["n", middleX, top], ["ne", right, top],
      ["e", right, middleY], ["se", right, bottom], ["s", middleX, bottom],
      ["sw", left, bottom], ["w", left, middleY]
    ];
  }

  function hitHandle(box, point, radius = 0.4) {
    if (!box || !point) return "";
    const limit = Math.max(0.1, Number(radius) || 0.4);
    let best = "";
    let bestDistance = Infinity;
    handleCenters(box).forEach(([id, x, y]) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= limit && distance < bestDistance) { best = id; bestDistance = distance; }
    });
    return best;
  }

  function drawHandles(options = {}) {
    const { context, box, cell, strokeStyle, fillStyle } = options;
    if (!context || !box || !Number.isFinite(cell)) return;
    const size = Math.max(6, Math.min(12, cell * 0.7));
    context.save();
    context.lineWidth = 1.5;
    context.strokeStyle = strokeStyle;
    context.fillStyle = fillStyle;
    handleCenters(box).forEach(([_id, x, y]) => {
      const px = x * cell - size / 2;
      const py = y * cell - size / 2;
      context.fillRect(px, py, size, size);
      context.strokeRect(px, py, size, size);
    });
    context.restore();
  }

  function resizeBoxFromHandle(box, handle, point, options = {}) {
    if (!box || !handle || !point) return box ? { ...box } : null;
    const maxWidth = Math.max(1, Number(options.width) || Infinity);
    const maxHeight = Math.max(1, Number(options.height) || Infinity);
    const preserveAspect = options.preserveAspect === true;
    const fromCenter = options.fromCenter === true;
    const ratio = Math.max(0.0001, box.w / box.h);
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    let left = box.x;
    let right = box.x + box.w;
    let top = box.y;
    let bottom = box.y + box.h;
    const targetX = Math.round(point.x);
    const targetY = Math.round(point.y);
    if (handle.includes("w")) left = targetX;
    if (handle.includes("e")) right = targetX;
    if (handle.includes("n")) top = targetY;
    if (handle.includes("s")) bottom = targetY;
    if (fromCenter) {
      if (handle.includes("w") || handle.includes("e")) { const half = Math.max(0.5, Math.abs((handle.includes("w") ? left : right) - centerX)); left = Math.round(centerX - half); right = Math.round(centerX + half); }
      if (handle.includes("n") || handle.includes("s")) { const half = Math.max(0.5, Math.abs((handle.includes("n") ? top : bottom) - centerY)); top = Math.round(centerY - half); bottom = Math.round(centerY + half); }
    }
    if (right <= left) { if (handle.includes("w")) left = right - 1; else right = left + 1; }
    if (bottom <= top) { if (handle.includes("n")) top = bottom - 1; else bottom = top + 1; }
    let nextWidth = Math.max(1, right - left);
    let nextHeight = Math.max(1, bottom - top);
    if (preserveAspect) {
      if (handle === "n" || handle === "s") nextWidth = Math.max(1, Math.round(nextHeight * ratio));
      else if (handle === "e" || handle === "w") nextHeight = Math.max(1, Math.round(nextWidth / ratio));
      else if (Math.abs(nextWidth / box.w - 1) >= Math.abs(nextHeight / box.h - 1)) nextHeight = Math.max(1, Math.round(nextWidth / ratio));
      else nextWidth = Math.max(1, Math.round(nextHeight * ratio));
      if (fromCenter) { left = Math.round(centerX - nextWidth / 2); top = Math.round(centerY - nextHeight / 2); }
      else {
        if (handle.includes("w")) left = right - nextWidth;
        else if (handle.includes("e")) right = left + nextWidth;
        else left = Math.round(centerX - nextWidth / 2);
        if (handle.includes("n")) top = bottom - nextHeight;
        else if (handle.includes("s")) bottom = top + nextHeight;
        else top = Math.round(centerY - nextHeight / 2);
      }
      right = left + nextWidth;
      bottom = top + nextHeight;
    }
    if (left < 0) { right -= left; left = 0; }
    if (top < 0) { bottom -= top; top = 0; }
    if (right > maxWidth) { left -= right - maxWidth; right = maxWidth; }
    if (bottom > maxHeight) { top -= bottom - maxHeight; bottom = maxHeight; }
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.max(left + 1, Math.min(maxWidth, right));
    bottom = Math.max(top + 1, Math.min(maxHeight, bottom));
    return { x: left, y: top, w: right - left, h: bottom - top };
  }

  // Grid regions
  function extractGridRegion(pixels, box) {
    const width = Math.max(0, Math.round(Number(box?.w) || 0));
    const height = Math.max(0, Math.round(Number(box?.h) || 0));
    const output = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
    const mask = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const value = pixels?.[(box?.y || 0) + y]?.[(box?.x || 0) + x] || null;
      output[y][x] = value;
      mask[y][x] = Boolean(value);
    }
    return { w: width, h: height, pixels: output, mask };
  }

  function clearGridRegion(pixels, box, data, setPixel) {
    if (typeof setPixel !== "function") return 0;
    let changed = 0;
    for (let y = 0; y < data.h; y++) for (let x = 0; x < data.w; x++) {
      if (!data.mask?.[y]?.[x]) continue;
      const targetX = (box?.x || 0) + x;
      const targetY = (box?.y || 0) + y;
      if (!pixels?.[targetY]?.[targetX]) continue;
      if (setPixel(targetX, targetY, null, pixels) !== false) changed++;
    }
    return changed;
  }

  function clearPixels(mask, pixels, EditorFeatures, setPixel) {
    let changed = 0;
    EditorFeatures.forEachMaskPoint(mask, (x, y) => {
      if (!pixels?.[y]?.[x]) return;
      setPixel(x, y, null, pixels);
      changed++;
    });
    return changed;
  }

  const api = { clearGridRegion, clearPixels, drawHandles, drawOverlay, extractGridRegion, handleCenters, hitHandle, resizeBoxFromHandle, shiftMask };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PixelBugSelectionWorkflow = api;
})();
