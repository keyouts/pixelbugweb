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
  // Brush definitions
  const brushes = ["exact", "paint", "raise", "lower", "smooth", "erode", "flatten", "terrace", "noise", "sharpen"];
  const shapes = ["circle", "square", "diamond"];
  const falloffs = ["soft", "linear", "hard"];
  const overlayPalettes = Object.freeze({
    natural: ["#3f7e86", "#c2b77c", "#6eaa68", "#51835b", "#878e85", "#e6e6de"],
    heat: ["#1645ac", "#03b8e7", "#7fd966", "#ffdc39", "#f96928", "#eb174b"],
    neon: ["#12e9f0", "#12c6ff", "#9b73ff", "#fc4fc2", "#ff7d2a", "#f4ef3e"],
    violet: ["#382071", "#7950cc", "#c57ae9", "#fa9fba", "#ffbc8e", "#fff2b6"],
    grayscale: ["#090909", "#3b3b3b", "#777777", "#b1b1b1", "#dfdfdf", "#ffffff"],
    contrast: ["#0e1a64", "#1252ee", "#13d9e3", "#fcf429", "#f65c09", "#f50551"]
  });
  const overlayColorCache = Object.create(null);
  function overlayColor(weight, palette = "natural") {
    const name = Object.hasOwn(overlayPalettes,palette) ? palette : "natural";
    if (!overlayColorCache[name]) {
      const stops = overlayPalettes[name];
      overlayColorCache[name] = Array.from({length:256},(_,weight) => {
        const position = weight / 255 * (stops.length - 1);
        const index = Math.min(stops.length - 2, Math.floor(position));
        const blend = position - index;
        const a = stops[index],b = stops[index+1];
        const channel = offset => Math.round(parseInt(a.slice(offset,offset+2),16)*(1-blend)+parseInt(b.slice(offset,offset+2),16)*blend).toString(16).padStart(2,"0");
        return `#${channel(1)}${channel(3)}${channel(5)}`;
      });
    }
    return overlayColorCache[name][integer(weight,0,255,DEFAULT_VALUE)];
  }

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
      brush: brushes.includes(value.brush) ? value.brush : "raise",
      sensitivity: Math.round(clamp(value.sensitivity, 0.1, 100, 18) * 10) / 10,
      falloffGradient: Math.round(clamp(value.falloffGradient, 0, 100, 100) * 10) / 10,
      shape: shapes.includes(value.shape) ? value.shape : "circle",
      falloff: falloffs.includes(value.falloff) ? value.falloff : "soft",
      overlayPalette: Object.hasOwn(overlayPalettes, value.overlayPalette) ? value.overlayPalette : "natural",
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
      biomePalette: ["classic", "lush", "arid", "alpine", "coastal"].includes(value.biomePalette) ? value.biomePalette : "classic",
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
    const strength = clamp(settings.strength, 1, 100, 55) / 100;
    const sensitivity = clamp(settings.sensitivity, 0.1, 100, 18) / 100;
    const falloffGradient = clamp(settings.falloffGradient, 0, 100, 100) / 100;
    const shape = shapes.includes(settings.shape) ? settings.shape : "circle";
    const edge = falloffs.includes(settings.falloff) ? settings.falloff : "soft";
    const brush = brushes.includes(settings.brush) ? settings.brush : "raise";
    const base = integer(settings.base, 0, 63, 2);
    const peak = settings.peak == null ? base + integer(settings.relief,1,63,12) : integer(settings.peak,1,64,14);
    const fixedHeight = integer(settings.exactHeight,1,64,9);
    const exactWeight = peak === base ? 255 : clamp(Math.round(255 * (fixedHeight - base) / (peak - base)),0,255);
    const target = brush === "exact" ? exactWeight : clamp(settings.level, 0, 100, 65) * 2.55;
    const context = settings.stroke instanceof Map ? settings.stroke : null;
    let pass = context?.get(values);
    if (context && !pass) { pass={initial:values.slice(),coverage:new Map(),flatten:null}; context.set(values,pass); }
    const before = pass ? pass.initial : values.slice();
    if (pass && pass.flatten === null) pass.flatten = before[mod(Math.round(y),h)*w+mod(Math.round(x),w)];
    const flatten = pass ? pass.flatten : before[mod(Math.round(y),h)*w+mod(Math.round(x),w)];
    const speed = sensitivity <= .18
      ? 1 + 29 * Math.pow(sensitivity / .18, 2.6)
      : 30 + 120 * Math.pow((sensitivity - .18) / .82, .9);
    const updated = new Map();
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const distance = shape === "square" ? Math.max(Math.abs(dx), Math.abs(dy)) : shape === "diamond" ? Math.abs(dx)+Math.abs(dy) : Math.hypot(dx,dy);
      if (distance > radius + .01) continue;
      const px = mod(Math.round(x)+dx,w),py=mod(Math.round(y)+dy,h),index=py*w+px;
      const profile = edge === "hard" ? 1 : edge === "linear" ? Math.max(.03,1-distance/(radius+.01)) : Math.pow(Math.max(.03,1-distance/(radius+.65)),2);
      // Gradient interpolation
      const falloff = 1 - falloffGradient * (1 - profile);
      const amount = brush === "exact" ? 1 : strength*falloff;
      if (amount <= (pass?.coverage.get(index) || 0) + 1e-8) continue;
      let goal = target;
      if (brush === "raise") goal = Math.min(255,before[index]+speed);
      if (brush === "lower") goal = Math.max(0,before[index]-speed);
      if (brush === "flatten") goal = flatten;
      if (brush === "terrace") {
        const count=integer(settings.terraces,2,16,6);
        goal=Math.round(before[index]/255*(count-1))/(count-1)*255;
      }
      if (brush === "noise") {
        const hash=Math.sin((px+1)*127.1+(py+1)*311.7+integer(settings.seed,0,99999,42)*.37)*43758.5453;
        goal=clamp(before[index]+((hash-Math.floor(hash))*2-1)*speed*2,0,255);
      }
      if (brush === "erode" || brush === "smooth" || brush === "sharpen") {
        let total=0,count=0;
        for(let iy=-1;iy<=1;iy++)for(let ix=-1;ix<=1;ix++){
          if(brush==="erode" && !ix && !iy) continue;
          total+=before[mod(py+iy,h)*w+mod(px+ix,w)];count++;
        }
        const average=total/count;
        if(brush==="erode")goal=Math.min(before[index],average);
        else if(brush==="smooth")goal=average;
        else goal=clamp(before[index]+(before[index]-average)*1.6,0,255);
      }
      const effective = brush === "exact" ? 1 : (brush === "raise" || brush === "lower" || brush === "noise") ? amount : amount*(.3+.7*sensitivity);
      let next=integer(before[index]+(goal-before[index])*effective,0,255);
      if (dx===0 && dy===0 && next===before[index] && Math.abs(goal-before[index])>.001 && (brush==="raise"||brush==="lower"))
        next=integer(before[index]+Math.sign(goal-before[index]),0,255);
      const previous=updated.get(index);
      if(previous && previous.amount>=amount)continue;
      updated.set(index,{amount,next});
    }
    let changed=false;
    for(const [index,item] of updated){
      if(pass)pass.coverage.set(index,item.amount);
      if(values[index]!==item.next){values[index]=item.next;changed=true;}
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
      alpine: ["#39758c", "#8aaf8b", "#5c9867", "#47745f", "#777e87", "#f0f3f2"],
      coastal: ["#137fbb", "#e7d3a4", "#9dbd7d", "#3a9686", "#7195a0", "#e3f2ed"]
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
    if (column.biome) return paletteColor(weight,["lush","arid","alpine","coastal"][column.biome-1] || terrain.biomePalette);
    if (terrain.colorMode === "tile") return column.color;
    // Color fidelity
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

  const api = Object.freeze({ MAX_VOXELS, DEFAULT_VALUE, normalize, ensureHeights, paint, overlayColor, overlayPalettes, biomeColor, columns, voxelPlan, heightFor, columnHeight, shapedWeight, paletteColor, surfaceColor, columnSlope, voxelColor, layerValue });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainHeightmap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
