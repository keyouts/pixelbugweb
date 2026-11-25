(() => {
  "use strict";

  const BAYER_8 = Object.freeze([
    Object.freeze([0, 48, 12, 60, 3, 51, 15, 63]),
    Object.freeze([32, 16, 44, 28, 35, 19, 47, 31]),
    Object.freeze([8, 56, 4, 52, 11, 59, 7, 55]),
    Object.freeze([40, 24, 36, 20, 43, 27, 39, 23]),
    Object.freeze([2, 50, 14, 62, 1, 49, 13, 61]),
    Object.freeze([34, 18, 46, 30, 33, 17, 45, 29]),
    Object.freeze([10, 58, 6, 54, 9, 57, 5, 53]),
    Object.freeze([42, 26, 38, 22, 41, 25, 37, 21])
  ]);

  function linePoints(start, end) {
    let x = Math.round(Number(start?.x) || 0);
    let y = Math.round(Number(start?.y) || 0);
    const x1 = Math.round(Number(end?.x) || 0);
    const y1 = Math.round(Number(end?.y) || 0);
    const points = [];
    const dx = Math.abs(x1 - x);
    const sx = x < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y);
    const sy = y < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      points.push({ x, y });
      if (x === x1 && y === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x += sx; }
      if (twice <= dx) { error += dx; y += sy; }
    }
    return points;
  }

  function clampRatio(value) {
    return Math.max(0, Math.min(Number(value) || 0, 1));
  }

  function clampScale(value) {
    return Math.max(1, Math.min(Math.round(Number(value) || 1), 4));
  }

  function hashNoise(x, y, seed) {
    let value = (Math.imul((x | 0) ^ 0x45d9f3b, 0x119de1f3) + Math.imul((y | 0) ^ 0x27d4eb2d, 0x165667b1) + (seed | 0)) | 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967296;
  }

  function patternAt(kind, x, y, settings = {}) {
    const densityValue = Number(settings.density);
    const density = clampRatio(densityValue > 1 ? densityValue / 100 : densityValue);
    const scale = clampScale(settings.scale);
    const cellX = Math.floor(Number(x) / scale);
    const cellY = Math.floor(Number(y) / scale);
    switch (String(kind || "")) {
      case "dither": {
        const matrixX = ((cellX % 8) + 8) % 8;
        const matrixY = ((cellY % 8) + 8) % 8;
        return BAYER_8[matrixY][matrixX] < Math.round(density * 64);
      }
      case "noise": return hashNoise(cellX, cellY, 17) < density;
      case "cluster": return hashNoise(Math.floor(cellX / 2), Math.floor(cellY / 2), 29) < density;
      case "checker": return (cellX + cellY) % 2 === 0;
      case "hatch": {
        if (density <= 0) return false;
        const spacing = Math.max(1, 8 - Math.round(density * 7));
        return (cellX + cellY) % spacing === 0;
      }
      default: return true;
    }
  }

  function brushPattern(kind, settings = {}) {
    const scale = clampScale(settings.scale);
    const size = 8 * scale;
    return Array.from({ length: size }, (_row, y) => Array.from({ length: size }, (_cell, x) => patternAt(kind, x, y, settings) ? "#" : null));
  }

  function patternStampPoints(kind, centerX, centerY, settings = {}) {
    const scale = clampScale(settings.scale);
    const size = 8 * scale;
    const offset = Math.floor(size / 2);
    const startX = Math.round(Number(centerX) || 0) - offset;
    const startY = Math.round(Number(centerY) || 0) - offset;
    const points = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const targetX = startX + x;
        const targetY = startY + y;
        if (patternAt(kind, targetX, targetY, settings)) points.push({ x: targetX, y: targetY });
      }
    }
    return points;
  }

  function bayerPattern(coverage, scale = 1) {
    return brushPattern("dither", { density: coverage, scale });
  }

  function parseHex(value) {
    const match = String(value || "").match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    const number = Number.parseInt(match[1], 16);
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
  }

  function luminance(color) {
    const rgb = parseHex(color);
    if (!rgb) return null;
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  }

  function colorDistance(a, b) {
    const aa = parseHex(a);
    const bb = parseHex(b);
    if (!aa || !bb) return Number.POSITIVE_INFINITY;
    return (aa.r - bb.r) ** 2 + (aa.g - bb.g) ** 2 + (aa.b - bb.b) ** 2;
  }

  function paletteStep(current, palette, direction = 1) {
    if (!parseHex(current)) return current;
    const colors = Array.from(new Set((Array.isArray(palette) ? palette : []).filter(color => parseHex(color)).map(color => String(color).toLowerCase())));
    if (!colors.length) return current;
    const currentLuminance = luminance(current);
    const brighter = Number(direction) >= 0;
    const candidates = colors.filter(candidate => {
      const value = luminance(candidate);
      return brighter ? value > currentLuminance + 0.01 : value < currentLuminance - 0.01;
    });
    if (!candidates.length) return current;
    candidates.sort((a, b) => {
      const luminanceDelta = Math.abs(luminance(a) - currentLuminance) - Math.abs(luminance(b) - currentLuminance);
      return Math.abs(luminanceDelta) > 0.001 ? luminanceDelta : colorDistance(current, a) - colorDistance(current, b);
    });
    return candidates[0];
  }

  const api = Object.freeze({ bayerPattern, brushPattern, linePoints, paletteStep, patternAt, patternStampPoints });
  if (typeof globalThis !== "undefined") globalThis.PixelBugDrawingTools = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
