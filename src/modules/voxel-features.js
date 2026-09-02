(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelFeatures = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const key = cube => `${Math.round(Number(cube?.x) || 0)},${Math.round(Number(cube?.y) || 0)},${Math.round(Number(cube?.z) || 0)}`;
  const bounds = cubes => {
    if (!cubes || typeof cubes[Symbol.iterator] !== "function") return null;
    const box = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity };
    let found = false;
    for (const cube of cubes) {
      if (!cube) continue;
      found = true;
      box.minX = Math.min(box.minX, cube.x); box.minY = Math.min(box.minY, cube.y); box.minZ = Math.min(box.minZ, cube.z);
      box.maxX = Math.max(box.maxX, cube.x); box.maxY = Math.max(box.maxY, cube.y); box.maxZ = Math.max(box.maxZ, cube.z);
    }
    return found ? box : null;
  };
  const connected = (cubes, seed) => {
    if (!Array.isArray(cubes) || !seed) return [];
    const map = new Map(cubes.map(cube => [key(cube), cube]));
    const start = map.get(key(seed));
    if (!start) return [];
    const queue = [start];
    const seen = new Set();
    const output = [];
    const offsets = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    while (queue.length) {
      const cube = queue.shift();
      const cubeKey = key(cube);
      if (seen.has(cubeKey)) continue;
      seen.add(cubeKey);
      output.push({ ...cube });
      offsets.forEach(([dx, dy, dz]) => {
        const next = map.get(`${cube.x + dx},${cube.y + dy},${cube.z + dz}`);
        if (next && !seen.has(key(next))) queue.push(next);
      });
    }
    return output;
  };
  const byColor = (cubes, color) => {
    const target = String(color || "").toLowerCase();
    if (!target) return [];
    return (Array.isArray(cubes) ? cubes : []).filter(cube => String(cube?.color || "").toLowerCase() === target).map(cube => ({ ...cube }));
  };
  const shell = (coords, thickness = 1) => {
    const source = Array.isArray(coords) ? coords : [];
    const set = new Set(source.map(key));
    const wall = Math.max(1, Math.round(Number(thickness) || 1));
    return source.filter(cube => {
      for (let radius = 1; radius <= wall; radius++) {
        if (!set.has(`${cube.x + radius},${cube.y},${cube.z}`) || !set.has(`${cube.x - radius},${cube.y},${cube.z}`) || !set.has(`${cube.x},${cube.y + radius},${cube.z}`) || !set.has(`${cube.x},${cube.y - radius},${cube.z}`) || !set.has(`${cube.x},${cube.y},${cube.z + radius}`) || !set.has(`${cube.x},${cube.y},${cube.z - radius}`)) return true;
      }
      return false;
    });
  };
  const primitive = (shape, box, options = {}) => {
    if (!box) return [];
    const output = [];
    const minX = Math.round(box.minX); const maxX = Math.round(box.maxX);
    const minY = Math.round(box.minY); const maxY = Math.round(box.maxY);
    const minZ = Math.round(box.minZ); const maxZ = Math.round(box.maxZ);
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2; const cz = (minZ + maxZ) / 2;
    const rx = Math.max(0.5, (maxX - minX + 1) / 2);
    const ry = Math.max(0.5, (maxY - minY + 1) / 2);
    const rz = Math.max(0.5, (maxZ - minZ + 1) / 2);
    const axis = ["x", "y", "z"].includes(options.axis) ? options.axis : "y";
    for (let z = minZ; z <= maxZ; z++) for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      let include = shape === "box";
      if (shape === "sphere") include = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1.0001;
      if (shape === "cylinder") {
        if (axis === "x") include = ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1.0001;
        else if (axis === "z") include = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0001;
        else include = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 <= 1.0001;
      }
      if (include) output.push({ x, y, z });
    }
    return options.hollow === true ? shell(output, options.thickness) : output;
  };
  const mirror = (cubes, axis, origin) => {
    if (!["x", "y", "z"].includes(axis)) return [];
    const center = Number(origin?.[axis]) || 0;
    const seen = new Map();
    (Array.isArray(cubes) ? cubes : []).forEach(cube => {
      const next = { ...cube, [axis]: Math.round(center * 2 - cube[axis]) };
      seen.set(key(next), next);
    });
    return Array.from(seen.values());
  };
  const poseLerp = (left, right, amount) => {
    const t = Math.max(0, Math.min(Number(amount) || 0, 1));
    const partIds = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
    const output = {};
    const read = (pose, field, axis) => Number(pose?.[field]?.[axis] ?? (field === "scale" ? 1 : 0));
    partIds.forEach(partId => {
      output[partId] = {};
      ["translation", "rotation", "scale"].forEach(field => {
        output[partId][field] = {};
        ["x", "y", "z"].forEach(axis => {
          const a = read(left?.[partId], field, axis);
          const b = read(right?.[partId], field, axis);
          output[partId][field][axis] = a + (b - a) * t;
        });
      });
    });
    return output;
  };
  const cameraView = input => ({
    name: String(input?.name || "View").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "").trim().slice(0, 24) || "View",
    yaw: Math.max(-Math.PI * 8, Math.min(Number(input?.yaw) || 0, Math.PI * 8)),
    pitch: Math.max(-Math.PI / 2, Math.min(Number(input?.pitch) || 0, Math.PI / 2)),
    zoom: Math.max(0.35, Math.min(Number(input?.zoom) || 1, 5)),
    panX: Math.max(-4000, Math.min(Number(input?.panX) || 0, 4000)),
    panY: Math.max(-4000, Math.min(Number(input?.panY) || 0, 4000)),
    projection: input?.projection === "perspective" ? "perspective" : "orthographic"
  });

  const previewStep = (width, height, expansion = 1, budget = 48000) => {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const safeExpansion = Math.max(1, Number(expansion) || 1);
    const safeBudget = Math.max(1, Math.round(Number(budget) || 48000));
    return Math.max(1, Math.ceil(Math.sqrt((safeWidth * safeHeight * safeExpansion) / safeBudget)));
  };
  const previewImportInfo = (width, height, expansion = 1, budget = 48000, maxCubes = 3200000) => {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    const safeExpansion = Math.max(1, Number(expansion) || 1);
    const safeMax = Math.max(1, Math.round(Number(maxCubes) || 3200000));
    const step = previewStep(safeWidth, safeHeight, safeExpansion, budget);
    const gridWidth = Math.ceil(safeWidth / step);
    const gridHeight = Math.ceil(safeHeight / step);
    return { step, gridWidth, gridHeight, fullPotential: Math.min(safeMax, safeWidth * safeHeight * safeExpansion), previewPotential: Math.min(safeMax, gridWidth * gridHeight * safeExpansion) };
  };

  const sampleColor = (pixels, startX, startY, step = 1) => {
    if (!Array.isArray(pixels) || !pixels.length) return null;
    const block = Math.max(1, Math.round(Number(step) || 1));
    const counts = new Map();
    let best = null;
    let bestCount = 0;
    for (let y = Math.max(0, Math.round(startY)); y < Math.min(pixels.length, Math.round(startY) + block); y++) {
      const row = pixels[y];
      if (!Array.isArray(row)) continue;
      for (let x = Math.max(0, Math.round(startX)); x < Math.min(row.length, Math.round(startX) + block); x++) {
        const color = row[x];
        if (!color) continue;
        const count = (counts.get(color) || 0) + 1;
        counts.set(color, count);
        if (count > bestCount) {
          best = color;
          bestCount = count;
        }
      }
    }
    return best;
  };

  return { key, bounds, connected, byColor, shell, primitive, mirror, poseLerp, cameraView, previewStep, previewImportInfo, sampleColor };
});
