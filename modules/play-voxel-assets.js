"use strict";

// Voxel rendering
// Shared assets
(function attachPlayVoxelAssets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelAssets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function playVoxelAssetsFactory() {
  function createRuntime() {
    const imageCache = new WeakMap();
    const normalizedAssets = new WeakSet();
    const LIMIT = 24000;
    const MAX_VARIANTS = 18;
    function clamp(value, fallback, min, max) {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(min, Math.min(Math.floor(n), max)) : fallback;
    }
    function normalizeAsset(raw = {}, index = 0) {
      if (raw && typeof raw === "object" && normalizedAssets.has(raw)) return raw;
      const width = clamp(raw.width, 32, 1, 512);
      const height = clamp(raw.height, 32, 1, 512);
      const depth = clamp(raw.depth, 32, 1, 512);
      const seen = new Set();
      const cubes = [];
      for (const cube of Array.isArray(raw.cubes) ? raw.cubes.slice(0, LIMIT) : []) {
        if (!cube || !/^#[0-9a-f]{6}$/i.test(String(cube.color || ""))) continue;
        const x = Number(cube.x), y = Number(cube.y), z = Number(cube.z);
        if (![x, y, z].every(Number.isInteger) || x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) continue;
        const key = `${x},${y},${z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cubes.push({ x, y, z, color: String(cube.color).toLowerCase() });
      }
      const poses = (Array.isArray(raw.poses) ? raw.poses : []).slice(0, 24).map((pose, poseIndex) => {
        const frameSeen = new Set();
        const frameCubes = [];
        for (const cube of Array.isArray(pose?.cubes) ? pose.cubes.slice(0, LIMIT) : []) {
          if (!cube || !/^#[0-9a-f]{6}$/i.test(String(cube.color || ""))) continue;
          const x = Number(cube.x), y = Number(cube.y), z = Number(cube.z);
          if (![x, y, z].every(Number.isInteger) || x < 0 || x >= width || y < 0 || y >= height || z < 0 || z >= depth) continue;
          const key = `${x},${y},${z}`;
          if (frameSeen.has(key)) continue;
          frameSeen.add(key);
          frameCubes.push({ x, y, z, color: String(cube.color).toLowerCase() });
        }
        return { id: String(pose?.id || `pose-${poseIndex + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48), name: String(pose?.name || `Pose ${poseIndex + 1}`).slice(0, 48), cubes: frameCubes };
      }).filter(pose => pose.cubes.length);
      const normalized = {
        id: String(raw.id || `voxel-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || `voxel-${index + 1}`,
        name: String(raw.name || `Voxel ${index + 1}`).slice(0, 48),
        width, height, depth, cubes, poses, detailStep: clamp(raw.detailStep, 1, 1, 512)
      };
      normalizedAssets.add(normalized);
      return normalized;
    }
    function quarterTurn(value) { return ((Math.round(Number(value) || 0) % 4) + 4) % 4; }
    function rotatedCubes(asset, yaw, poseId = "") {
      const turn = quarterTurn(yaw);
      const source = (asset.poses || []).find(pose => pose.id === poseId)?.cubes || asset.cubes;
      const w = Number(asset.width) || 1, d = Number(asset.depth) || 1;
      const out = (source || []).map(cube => {
        const { x, y, z } = cube;
        if (turn === 1) return { ...cube, x: d - z - 1, z: x };
        if (turn === 2) return { ...cube, x: w - x - 1, z: d - z - 1 };
        if (turn === 3) return { ...cube, x: z, z: w - x - 1 };
        return cube;
      });
      return out.sort((a, b) => (a.x + a.z + a.y) - (b.x + b.z + b.y) || a.y - b.y || a.z - b.z || a.x - b.x);
    }
    function shade(hex, factor) {
      const n = parseInt(String(hex).slice(1), 16);
      const parts = [n >> 16 & 255, n >> 8 & 255, n & 255];
      return `rgb(${parts.map(v => Math.max(0, Math.min(255, Math.round(v * factor)))).join(",")})`;
    }
    function createCanvas(asset, yaw = 0, doc = typeof document !== "undefined" ? document : null, poseId = "", detail = "object") {
      if (!doc || typeof doc.createElement !== "function") return null;
      const cubes = rotatedCubes(asset, yaw, poseId);
      const canvas = doc.createElement("canvas");
      if (!cubes.length) { canvas.width = canvas.height = 1; return canvas; }
      // Image bounds
      let minCellX = Infinity, minCellY = Infinity, minCellZ = Infinity;
      let maxCellX = -Infinity, maxCellY = -Infinity, maxCellZ = -Infinity;
      const occupied = new Set();
      for (const cube of cubes) {
        minCellX = Math.min(minCellX, cube.x); maxCellX = Math.max(maxCellX, cube.x + 1);
        minCellY = Math.min(minCellY, cube.y); maxCellY = Math.max(maxCellY, cube.y + 1);
        minCellZ = Math.min(minCellZ, cube.z); maxCellZ = Math.max(maxCellZ, cube.z + 1);
        occupied.add(`${cube.x},${cube.y},${cube.z}`);
      }
      const iso = (x, y, z) => ({ x: (x - z) * 2, y: x + z - y * 2 });
      const corners = [];
      for (const x of [minCellX, maxCellX]) for (const y of [minCellY, maxCellY]) for (const z of [minCellZ, maxCellZ]) corners.push(iso(x, y, z));
      const minX = Math.min(...corners.map(corner => corner.x));
      const maxX = Math.max(...corners.map(corner => corner.x));
      const minY = Math.min(...corners.map(corner => corner.y));
      const maxY = Math.max(...corners.map(corner => corner.y));
      const width = Math.max(1, Math.ceil(maxX - minX + 2));
      const height = Math.max(1, Math.ceil(maxY - minY + 2));
      // Render quality
      const limit = detail === "background" ? 384 : 128;
      const factor = Math.min(1, limit / Math.max(width, height));
      canvas.width = Math.max(1, Math.ceil(width * factor));
      canvas.height = Math.max(1, Math.ceil(height * factor));
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) return canvas;
      ctx.scale(factor, factor);
      ctx.translate(1 - minX, 1 - minY);
      const colors = new Map();
      const color = (hex, brightness) => {
        const key = `${hex}:${brightness}`;
        if (!colors.has(key)) colors.set(key, shade(hex, brightness));
        return colors.get(key);
      };
      const visible = (x, y, z) => !occupied.has(`${x},${y},${z}`);
      function face(cube, vertices, brightness) {
        ctx.fillStyle = color(cube.color, brightness);
        ctx.beginPath();
        vertices.forEach(([x, y, z], index) => {
          const point = iso(x, y, z);
          if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fill();
      }
      for (const cube of cubes) {
        const { x, y, z } = cube;
        if (visible(x, y + 1, z)) face(cube, [[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]], 1.12);
        if (visible(x+1, y, z)) face(cube, [[x+1,y,z],[x+1,y,z+1],[x+1,y+1,z+1],[x+1,y+1,z]], 0.8);
        if (visible(x, y, z+1)) face(cube, [[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]], 0.65);
      }
      return canvas;
    }
    function getCanvas(asset, yaw = 0, doc, poseId = "", detail = "object") {
      if (!asset || !Array.isArray(asset.cubes)) return null;
      const turn = quarterTurn(yaw);
      let variants = imageCache.get(asset);
      if (!variants) { variants = new Map(); imageCache.set(asset, variants); }
      const key = `${turn}:${poseId}:${detail}`;
      if (variants.has(key)) {
        const cached = variants.get(key);
        variants.delete(key);
        variants.set(key, cached);
        return cached;
      }
      const result = createCanvas(asset, turn, doc, poseId, detail);
      variants.set(key, result);
      if (variants.size > MAX_VARIANTS) variants.delete(variants.keys().next().value);
      return result;
    }
    function drawBackdrop(ctx, img, width, height, mode = "cover", camera = 0) {
      if (!ctx || !img || !img.width || !img.height) return false;
      const fit = ["cover", "contain", "stretch", "tile"].includes(mode) ? mode : "cover";
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (fit === "stretch") ctx.drawImage(img, 0, 0, width, height);
      else {
        const ratio = fit === "tile" ? Math.max(width / (img.width * 12), Math.max(1, Math.min(3, width / img.width))) : fit === "contain" ? Math.min(width / img.width, height / img.height) : Math.max(width / img.width, height / img.height);
        const w = Math.max(1, Math.round(img.width * ratio)), h = Math.max(1, Math.round(img.height * ratio));
        const y = fit === "tile" ? Math.round(height - h) : Math.round((height - h) / 2);
        const offset = ((camera * (fit === "tile" ? .12 : .08) % w) + w) % w;
        const start = (fit === "tile" ? 0 : (width - w) / 2) - offset;
        for (let x = start - w, draws = 0; x < width && draws < 128; x += w, draws++) ctx.drawImage(img, Math.round(x), y, w, h);
      }
      ctx.restore();
      return true;
    }
    function findAsset(assets, prop) {
      if (!prop?.voxelAssetId) return null;
      return (assets || []).find(item => item.id === prop.voxelAssetId) || null;
    }
    function metrics(assets, prop, doc) {
      const asset = findAsset(assets, prop);
      if (!asset) return null;
      const canvas = getCanvas(asset, prop.voxelYaw, doc, prop.voxelPoseId || "");
      if (!canvas) return null;
      const scale = Math.max(0.5, Math.min(Number(prop.scale) || 3, 16));
      return { canvas, w: Math.max(1, Math.round(canvas.width * scale)), h: Math.max(1, Math.round(canvas.height * scale)) };
    }
    return { normalizeAsset, quarterTurn, createCanvas, getCanvas, drawBackdrop, findAsset, metrics, MAX_CUBES: LIMIT };
  }
  const api = createRuntime();
  api.standaloneSource = `(${createRuntime.toString()})()`;
  return api;
});
