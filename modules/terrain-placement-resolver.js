(() => {
  "use strict";
  // Shared geometry
  const mod = (n, d) => ((n % d) + d) % d;
  const bounded = (n, fallback, lo, hi) => Number.isFinite(Number(n)) ? Math.max(lo, Math.min(hi, Math.round(Number(n)))) : fallback;
  function transform(cell, x, y, cellWidth, cellHeight) {
    let u = (x + .5) / cellWidth, v = (y + .5) / cellHeight;
    if (cell.flipH) u = 1 - u;
    if (cell.flipV) v = 1 - v;
    switch (mod(Number(cell.rotation) || 0, 360)) {
      case 90: return { u: v, v: 1 - u };
      case 180: return { u: 1 - u, v: 1 - v };
      case 270: return { u: 1 - v, v: u };
      default: return { u, v };
    }
  }
  function create({ width, height, tiles = [], activeTileId, terrain = {}, repeat, planRepeat, map }) {
    const w = bounded(width, 1, 1, 4096), h = bounded(height, 1, 1, 4096);
    const tileById = new Map(tiles.map(t => [t.id, t]));
    const useMap = terrain.source === "map";
    const cellW = bounded(map?.cellWidth, 16, 1, 128), cellH = bounded(map?.cellHeight, 16, 1, 128);
    const mapW = bounded(map?.width, 16, 1, 128), mapH = bounded(map?.height, 16, 1, 128);
    const layers = (map?.layers || []).filter(l => l.visible !== false);
    const tile = tileById.get(activeTileId);
    const plan = !useMap && tile && planRepeat ? planRepeat({ ...repeat, canvasWidth:w, canvasHeight:h, tileWidth:tile.w, tileHeight:tile.h }) : null;
    const stampGrid = !useMap && plan && !plan.overflow ? Array(w*h).fill(null) : null;
    if(stampGrid){
      for(const p of plan.placements){
        const x0=Math.max(0,p.x), x1=Math.min(w,p.x+tile.w);
        const y0=Math.max(0,p.y), y1=Math.min(h,p.y+tile.h);
        for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)stampGrid[y*w+x]=p;
      }
    }
    function hit(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) return null;
      if (useMap) {
        const mx = mod(x, mapW * cellW), my = mod(y, mapH * cellH);
        const gx = Math.floor(mx / cellW), gy = Math.floor(my / cellH);
        for (let i = layers.length - 1; i >= 0; i--) {
          const cell = layers[i].cells?.[gy]?.[gx];
          const source = cell && tileById.get(cell.tileId);
          if (!source) continue;
          const uv = transform(cell, mx % cellW, my % cellH, cellW, cellH);
          const px = Math.min(source.w - 1, Math.max(0, Math.floor(uv.u * source.w)));
          const py = Math.min(source.h - 1, Math.max(0, Math.floor(uv.v * source.h)));
          // Transparent fallthrough
          if (terrain.transparent && !source.pixels?.[py]?.[px]) continue;
          return { tile:source, px, py, placementKey:null, x, y };
        }
        return null;
      }
      if (!tile || !stampGrid) return null;
      const p = stampGrid[y*w+x];
      if(!p)return null;
      const px=x-p.x, py=y-p.y;
      if(terrain.transparent && !tile.pixels?.[py]?.[px])return null;
      return {tile,px,py,placementKey:`repeat:${p.x}:${p.y}`,x,y};
    }
    return Object.freeze({ hit, plan, width:w, height:h });
  }
  const api = Object.freeze({ create, transform });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainPlacementResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
