(() => {
  "use strict";
  const Resolver = globalThis.PixelBugTerrainPlacementResolver || (typeof require === "function" ? require("./terrain-placement-resolver.js") : null);
  const MAX_VOXELS = 50000;
  const DEFAULT_VALUE = 80;
  const clamp = (value, min, max, fallback = min) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const integer = (value, min, max, fallback = min) => Math.round(clamp(value, min, max, fallback));
  const mod = (value, divisor) => (value % divisor + divisor) % divisor;
  const isColor = color => /^#[0-9a-f]{6}$/i.test(String(color || ""));

  function normalize(input = {}, tiles = []) {
    const value = input && typeof input === "object" ? input : {};
    const heights = Object.create(null);
    for (const tile of tiles.slice(0, 80)) {
      const data = value.heights?.[tile.id];
      if (!data || !Array.isArray(data.values) || data.w !== tile.w || data.h !== tile.h || data.values.length !== tile.w * tile.h) continue;
      heights[tile.id] = { w: tile.w, h: tile.h, values: data.values.map(v => integer(v, 0, 255, DEFAULT_VALUE)) };
    }
    return {
      heights,
      exactHeights: Object.fromEntries(tiles.slice(0,80).flatMap(tile => { const data=value.exactHeights?.[tile.id]; return Array.isArray(data) && data.length===tile.w*tile.h ? [[tile.id,data.map(v=>integer(v,0,64,0))]] : []; })),
      placementExactHeights: Object.fromEntries(Object.entries(value.placementExactHeights || {}).filter(([k,v]) => /^repeat:-?\d+:-?\d+$/.test(k) && Array.isArray(v) && v.length <= 65536).slice(0,256).map(([k,v])=>[k,v.map(n=>integer(n,0,64,0))])),
      placementHeights: Object.fromEntries(Object.entries(value.placementHeights || {}).filter(([k,v]) => /^repeat:-?\d+:-?\d+$/.test(k) && Array.isArray(v) && v.length <= 65536).slice(0,256).map(([k,v])=>[k,v.map(n=>integer(n,0,255,DEFAULT_VALUE))])),
      paintLayers: Object.fromEntries(["biome", "material"].map(kind => [kind, Object.fromEntries(tiles.slice(0,80).flatMap(tile => { const data=value.paintLayers?.[kind]?.[tile.id]; return Array.isArray(data) && data.length===tile.w*tile.h ? [[tile.id,data.map(v=>integer(v,0,4,0))]] : []; }))])),
      placementPaintLayers: Object.fromEntries(["biome", "material"].map(kind => [kind, Object.fromEntries(Object.entries(value.placementPaintLayers?.[kind] || {})
        .filter(([k,v]) => /^repeat:-?\d+:-?\d+$/.test(k) && Array.isArray(v) && tiles.some(t=>t.w*t.h===v.length))
        .slice(0,256).map(([k,v])=>[k,v.map(n=>integer(n,0,4,0))]))])),
      source: value.source === "map" ? "map" : "repeat",
      exactHeight: integer(value.exactHeight, 1, 64, 9),
      brush: ["exact", "paint", "raise", "lower", "smooth", "erode"].includes(value.brush) ? value.brush : "raise",
      level: integer(value.level, 0, 100, 65),
      strength: integer(value.strength, 1, 100, 55),
      radius: integer(value.radius, 1, 16, 2),
      base: integer(value.base, 0, 63, 2),
      relief: integer(value.relief, 1, 63, 12),
      peak: value.peak === undefined || value.peak === null ? null : integer(value.peak, 1, 64, 14),
      colorMode: value.colorMode === "biome" ? "biome" : "tile",
      solid: value.solid !== false,
      transparent: value.transparent === true,
      style: ["natural", "terraced", "rugged"].includes(value.style) ? value.style : "natural",
      terraces: integer(value.terraces, 2, 16, 6),
      detail: integer(value.detail, 0, 100, 25),
      seed: integer(value.seed, 0, 99999, 42),
      biomePalette: ["classic", "lush", "arid", "alpine"].includes(value.biomePalette) ? value.biomePalette : "classic",
      strata: value.strata !== false
    };
  }

  function ensureHeights(terrain, tile) {
    if (!terrain || !tile) return null;
    if (!terrain.heights || typeof terrain.heights !== "object") terrain.heights = Object.create(null);
    const record = Object.hasOwn(terrain.heights, tile.id) ? terrain.heights[tile.id] : null;
    if (record && record.w === tile.w && record.h === tile.h && record.values?.length === tile.w * tile.h) return record.values;
    const values = Array(tile.w * tile.h).fill(DEFAULT_VALUE);
    Object.defineProperty(terrain.heights, tile.id, {value:{ w: tile.w, h: tile.h, values },writable:true,enumerable:true,configurable:true});
    return values;
  }

  function paint(values, w, h, x, y, settings = {}) {
    if (!values || values.length !== w * h) return false;
    const radius = integer(settings.radius, 1, 16, 2);
    const strength = clamp(settings.strength, 1, 100, 50) / 100;
    const base = integer(settings.base, 0, 63, 2);
    const peak = settings.peak == null ? base + integer(settings.relief,1,63,12) : integer(settings.peak,1,64,14);
    const fixedHeight = integer(settings.exactHeight,1,64,9);
    const exactWeight = peak === base ? 255 : clamp(Math.round(255 * (fixedHeight - base) / (peak - base)),0,255);
    const target = settings.brush === "exact" ? exactWeight : clamp(settings.level, 0, 100, 65) * 2.55;
    const brush = ["exact", "paint", "raise", "lower", "smooth", "erode"].includes(settings.brush) ? settings.brush : "raise";
    const before = values.slice();
    const updated = new Map();
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const distance = Math.hypot(dx, dy);
      if (distance > radius + .01) continue;
      const px = mod(Math.round(x) + dx, w), py = mod(Math.round(y) + dy, h);
      const index = py * w + px;
      const falloff = Math.max(.06, 1 - distance / (radius + .65));
      const amount = brush === "exact" ? 1 : strength * falloff;
      let goal = target;
      if (brush === "raise") goal = Math.min(255, before[index] + 48);
      if (brush === "lower") goal = Math.max(0, before[index] - 48);
      if (brush === "erode") {
        let total = 0, count = 0;
        for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) {
          if (!ix && !iy) continue;
          total += before[mod(py + iy, h) * w + mod(px + ix, w)]; count++;
        }
        // Peak erosion
        goal = Math.min(before[index], total / count);
      }
      if (brush === "smooth") {
        let sum = 0;
        for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) sum += before[mod(py + iy, h) * w + mod(px + ix, w)];
        goal = sum / 9;
      }
      // Wrapped falloff
      const previous = updated.get(index);
      if (previous && previous.amount >= amount) continue;
      updated.set(index, { amount, next: integer(before[index] + (goal - before[index]) * amount, 0, 255) });
    }
    let changed = false;
    for (const [index, item] of updated) {
      if (values[index] !== item.next) { values[index] = item.next; changed = true; }
    }
    return changed;
  }

  function biomeColor(weight) {
    if (weight < 35) return "#3f7e86";
    if (weight < 75) return "#c2b77c";
    if (weight < 130) return "#6eaa68";
    if (weight < 180) return "#51835b";
    if (weight < 224) return "#878e85";
    return "#e6e6de";
  }

  function paletteColor(weight, palette = "classic") {
    const colors = {
      classic: ["#3f7e86", "#c2b77c", "#6eaa68", "#51835b", "#878e85", "#e6e6de"],
      lush: ["#347e9a", "#a5b57b", "#7dbb62", "#347e55", "#667c6b", "#dce6d8"],
      arid: ["#537d94", "#e1bc77", "#c5a16a", "#9e845e", "#897768", "#e8d9bc"],
      alpine: ["#39758c", "#8aaf8b", "#5c9867", "#47745f", "#777e87", "#f0f3f2"]
    };
    const index = weight < 35 ? 0 : weight < 75 ? 1 : weight < 130 ? 2 : weight < 180 ? 3 : weight < 224 ? 4 : 5;
    return (colors[palette] || colors.classic)[index];
  }
  function layerValue(terrain,kind,tile,placementKey,index){
    const override=placementKey && terrain.placementPaintLayers?.[kind]?.[placementKey];
    if(Array.isArray(override) && override.length===tile.w*tile.h)return override[index] || 0;
    return terrain.paintLayers?.[kind]?.[tile.id]?.[index] || 0;
  }
  function columns({ width, height, tiles = [], activeTileId, terrain, repeat, planRepeat, map }) {
    const w = integer(width, 1, 512, 32), h = integer(height, 1, 512, 32);
    const resolver = Resolver.create({ width:w, height:h, tiles, activeTileId, terrain, repeat, planRepeat, map });
    const result = Array(w*h).fill(null);
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      const hit = resolver.hit(x,y);
      if (!hit) continue;
      const {tile,px,py,placementKey} = hit;
      const i = py * tile.w + px;
      const weights = ensureHeights(terrain,tile);
      const override = placementKey && terrain.placementHeights?.[placementKey];
      const exact = placementKey && terrain.placementExactHeights?.[placementKey];
      const exactHeight = exact?.length===tile.w*tile.h ? exact[i] : terrain.exactHeights?.[tile.id]?.[i];
      const tileColor = tile.pixels?.[py]?.[px];
      const weight = override?.length===tile.w*tile.h ? override[i] : weights[i];
      result[y*w+x] = {
        biome: layerValue(terrain,"biome",tile,placementKey,i),
        material: layerValue(terrain,"material",tile,placementKey,i),
        weight, exactHeight: exactHeight || 0,
        color:terrain.colorMode === "tile" && isColor(tileColor) ? tileColor.toLowerCase() : biomeColor(weight)
      };
    }
    return result;
  }

  // Seamless variation
  function periodicNoise(x, y, w, h, seed) {
    const phase = seed * 0.017453292519943295;
    const u = 2 * Math.PI * x / w, v = 2 * Math.PI * y / h;
    return (Math.sin(u * 3 + phase) * Math.cos(v * 2 - phase) * .55 +
      Math.sin(u * 5 - v * 4 + phase * 2) * .3 +
      Math.cos(u * 7 + v * 6 - phase) * .15);
  }
  function shapedWeight(weight, x, y, w, h, terrain) {
    let value = weight;
    const detail = integer(terrain.detail, 0, 100, 25) / 100;
    if (terrain.style === "rugged") value += periodicNoise(x, y, w, h, terrain.seed || 42) * detail * 90;
    else if (terrain.style === "natural") value += periodicNoise(x, y, w, h, terrain.seed || 42) * detail * 30;
    value = clamp(value, 0, 255);
    if (terrain.style === "terraced") {
      const steps = integer(terrain.terraces, 2, 16, 6);
      value = Math.round(value / 255 * (steps - 1)) / (steps - 1) * 255;
    }
    return value;
  }
  function heightFor(weight, terrain, depth) {
    const base = integer(terrain.base, 0, 63, 2);
    const peak = terrain.peak == null ? base + integer(terrain.relief, 1, 63, 12) : integer(terrain.peak, 1, 64, 14);
    return Math.max(1, Math.min(depth, Math.round(base + (weight / 255) * (peak - base))));
  }
  function columnHeight(column, x, y, w, h, terrain, depth) {
    return column.exactHeight ? Math.max(1,Math.min(depth,column.exactHeight)) : heightFor(shapedWeight(column.weight,x,y,w,h,terrain),terrain,depth);
  }
  function surfaceColor(column, weight, slope, terrain) {
    const materialColors=[null,"#778079","#bba36e","#9c7559","#d8dce0"];
    if (column.material && materialColors[column.material]) return materialColors[column.material];
    if (column.biome) return paletteColor(weight,["classic","lush","arid","alpine"][column.biome-1] || "classic");
    if (terrain.colorMode === "tile") return column.color;
    if (slope >= 38 && weight > 65) return "#777c79";
    if (slope >= 22 && weight > 85) return "#92958a";
    return paletteColor(weight, terrain.biomePalette);
  }
  function columnSlope(heights, x, y, w, h) {
    const heightZ=heights[y*w+x];
    const neighbor=(nx,ny)=>heights[((ny+h)%h)*w+((nx+w)%w)] || heightZ;
    return Math.max(Math.abs(heightZ-neighbor(x-1,y)),Math.abs(heightZ-neighbor(x+1,y)),
      Math.abs(heightZ-neighbor(x,y-1)),Math.abs(heightZ-neighbor(x,y+1))) * 12;
  }
  function voxelColor(column, weight, slope, terrain, x, y, z, top, w, h) {
    const below=top-1-z;
    if(below && terrain.strata !== false){
      const layer=(Math.floor(z/3)+Math.floor(periodicNoise(x,y,w,h,terrain.seed || 42)*2))%4;
      return below<=2 ? "#85755d" : ["#65594d","#74665a","#55565a","#8b7964"][(layer+4)%4];
    }
    if(below)return below<3 ? "#796c50" : "#65574b";
    return surfaceColor(column,weight,slope,terrain);
  }
  function voxelPlan(columnData, width, height, depth, terrain, limit = MAX_VOXELS, emit = true) {
    const w = integer(width, 1, 512, 32), h = integer(height, 1, 512, 32), d = integer(depth, 1, 64, 32);
    let voxelCount = 0, columnsCount = 0;
    const cubes = [];
    const heights = columnData.map((column, i) => column ? columnHeight(column, i % w, Math.floor(i / w), w, h, terrain, d) : 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const index = y * w + x, column = columnData[index];
      if (!column) continue;
      const heightZ = heights[index];
      const count = terrain.solid === false ? 1 : heightZ;
      voxelCount += count; columnsCount++;
      if (voxelCount > limit) return { overflow: true, voxelCount, columnsCount, cubes: [] };
      if (!emit) continue;
      const slope = columnSlope(heights,x,y,w,h);
      const weight = shapedWeight(column.weight, x, y, w, h, terrain);
      for (let z = terrain.solid === false ? heightZ - 1 : 0; z < heightZ; z++) {
        cubes.push({ x, y, z, color:voxelColor(column,weight,slope,terrain,x,y,z,heightZ,w,h) });
      }
    }
    return { overflow: false, voxelCount, columnsCount, cubes };
  }

  const api = Object.freeze({ MAX_VOXELS, DEFAULT_VALUE, normalize, ensureHeights, paint, biomeColor, columns, voxelPlan, heightFor, columnHeight, shapedWeight, paletteColor, surfaceColor, columnSlope, voxelColor, layerValue });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainHeightmap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
