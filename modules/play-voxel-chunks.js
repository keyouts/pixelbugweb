"use strict";
(function attachPlayVoxelChunks(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelChunks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxelChunks() {
  const CHUNK_SIZE = 12;
  const commandOrder = (a, b) => a.depth - b.depth || a.y - b.y;
  function index(commands, world, project) {
    const chunks = new Map();
    for (const command of commands) {
      const x = command.kind === "block" ? command.block.x : command.x;
      const z = command.kind === "block" ? command.block.z : command.z;
      const id = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
      let chunk = chunks.get(id);
      if (!chunk) {
        const sx = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE, sz = Math.floor(z / CHUNK_SIZE) * CHUNK_SIZE;
        chunk = { id, x:sx, z:sz, commands:[], bounds:null };
        chunks.set(id, chunk);
      }
      chunk.commands.push(command);
    }
    for (const chunk of chunks.values()) {
      const x2 = Math.min(chunk.x + CHUNK_SIZE, world.width);
      const z2 = Math.min(chunk.z + CHUNK_SIZE, world.depth);
      const corners = [];
      for (const x of [chunk.x, x2]) for (const z of [chunk.z, z2])
        for (const y of [0, world.height + 1]) corners.push(project(world, x, y, z));
      chunk.bounds = { minX:Math.min(...corners.map(p => p.x)), maxX:Math.max(...corners.map(p => p.x)),
        minY:Math.min(...corners.map(p => p.y)), maxY:Math.max(...corners.map(p => p.y)) };
      chunk.commands.sort(commandOrder);
    }
    return { chunks:Array.from(chunks.values()), size:CHUNK_SIZE, total:commands.length };
  }
  function visible(indexed, offset, width, height, margin = 0) {
    const commands = [];
    const extra = Math.max(0, margin);
    const bucket = 96;
    const tileX = Math.floor(offset.x / bucket), tileY = Math.floor(offset.y / bucket);
    const cacheKey = `${tileX}:${tileY}:${width}:${height}:${extra}`;
    if (indexed.lastView?.key === cacheKey) return indexed.lastView.result;
    const broadOffset = {x:tileX * bucket, y:tileY * bucket};
    const broadMargin = extra + bucket;
    let visited = 0;
    for (const chunk of indexed.chunks) {
      const b = chunk.bounds;
      if (b.maxX + broadOffset.x < -broadMargin || b.minX + broadOffset.x > width + broadMargin ||
          b.maxY + broadOffset.y < -broadMargin || b.minY + broadOffset.y > height + broadMargin) continue;
      visited++;
      commands.push(...chunk.commands);
    }
    commands.sort(commandOrder);
    const result = { commands, visibleChunks:visited, totalChunks:indexed.chunks.length };
    indexed.lastView = { key:cacheKey, result };
    return result;
  }
  // Region streaming
  function indexRegions(world, project, rotate, occupied, options = {}) {
    const regions = [];
    const blocksByRegion = new Map();
    for (const block of world.blocks || []) {
      const id = `${Math.floor(block.x / CHUNK_SIZE)},${Math.floor(block.z / CHUNK_SIZE)}`;
      if (!blocksByRegion.has(id)) blocksByRegion.set(id, []);
      blocksByRegion.get(id).push(block);
    }
    for (let x = 0; x < world.width; x += CHUNK_SIZE) {
      for (let z = 0; z < world.depth; z += CHUNK_SIZE) {
        const id = `${x / CHUNK_SIZE},${z / CHUNK_SIZE}`;
        const x2 = Math.min(world.width, x + CHUNK_SIZE), z2 = Math.min(world.depth, z + CHUNK_SIZE);
        const corners = [];
        for (const px of [x, x2]) for (const pz of [z, z2])
          for (const py of [0, world.height + 1]) corners.push(project(world, px, py, pz));
        regions.push({id, x, z, x2, z2, sourceBlocks:blocksByRegion.get(id) || [], commands:null,
          bounds:{minX:Math.min(...corners.map(q=>q.x)),maxX:Math.max(...corners.map(q=>q.x)),
            minY:Math.min(...corners.map(q=>q.y)),maxY:Math.max(...corners.map(q=>q.y))}});
      }
    }
    const screenBucket = 256, screenIndex = new Map();
    for (const region of regions) {
      region.ordinal = regions.indexOf(region);
      const b = region.bounds;
      for (let tx=Math.floor(b.minX/screenBucket); tx<=Math.floor(b.maxX/screenBucket); tx++)
        for (let ty=Math.floor(b.minY/screenBucket); ty<=Math.floor(b.maxY/screenBucket); ty++) {
          const id=`${tx},${ty}`;
          if (!screenIndex.has(id)) screenIndex.set(id, []);
          screenIndex.get(id).push(region);
        }
    }
    return { regions, screenBucket, screenIndex, lastVisible:null, occupied, rotate, world, resident:new Map(),
      maxResident:Math.max(1, Math.min(128, Math.floor(Number(options.maxResident) || 56))),
      stats:{loads:0, evictions:0, hits:0, prefetchLoads:0, reusedViews:0, sorts:0,
        candidateRegions:0, visibleRegions:0, residentRegions:0, totalRegions:regions.length} };
  }
  function materializeRegion(indexed, region) {
    const {world, occupied, rotate} = indexed;
    if (region.commands) {
      indexed.resident.delete(region.id);
      indexed.resident.set(region.id, region);
      indexed.stats.hits++;
      return region.commands;
    }
    const key = (x,y,z) => `${x},${y},${z}`;
    const commands = [];
    for (let x = region.x; x < region.x2; x++) for (let z = region.z; z < region.z2; z++) {
      if (occupied.has(key(x,0,z))) continue;
      const r = rotate(world, x+.5, z+.5);
      commands.push({depth:r.x+r.z-.1,y:-1,kind:'ground',x,z});
    }
    for (const block of region.sourceBlocks) {
      const {x,y,z} = block;
      if (occupied.has(key(x,y+1,z)) && occupied.has(key(x-1,y,z)) &&
          occupied.has(key(x+1,y,z)) && occupied.has(key(x,y,z-1)) &&
          occupied.has(key(x,y,z+1))) continue;
      const r = rotate(world, x+.5, z+.5);
      commands.push({depth:r.x+r.z+.02,y,kind:'block',block});
    }
    commands.sort(commandOrder);
    region.commands = commands;
    indexed.resident.set(region.id, region);
    indexed.stats.loads++;
    while (indexed.resident.size > indexed.maxResident) {
      const evicted = indexed.resident.values().next().value;
      indexed.resident.delete(evicted.id);
      evicted.commands = null;
      indexed.stats.evictions++;
    }
    indexed.stats.residentRegions = indexed.resident.size;
    return commands;
  }
  function candidates(indexed, offset, width, height, margin=0) {
    const size=indexed.screenBucket || 256;
    const x1=Math.floor((-offset.x-margin)/size),x2=Math.floor((width-offset.x+margin)/size);
    const y1=Math.floor((-offset.y-margin)/size),y2=Math.floor((height-offset.y+margin)/size);
    const found=new Map();
    for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)
      for(const region of indexed.screenIndex.get(`${x},${y}`)||[]) found.set(region.id,region);
    return [...found.values()].sort((a,b)=>a.ordinal-b.ordinal);
  }
  function inViewport(region,offset,width,height,extra) {
    const b=region.bounds;
    return !(b.maxX+offset.x < -extra || b.minX+offset.x > width+extra ||
      b.maxY+offset.y < -extra || b.minY+offset.y > height+extra);
  }
  function visibleRegions(indexed, offset, width, height, margin=0) {
    const extra=Math.max(0,Number(margin)||0);
    const near=candidates(indexed,offset,width,height,extra+256);
    const selected=near.filter(region=>inViewport(region,offset,width,height,extra));
    const selectedIds=selected.map(region=>region.id).join('|');
    const cached=indexed.lastVisible;
    let commands;
    if(cached && cached.id===selectedIds && selected.every(region=>region.commands)) {
      commands=cached.commands;
      for(const region of selected){ indexed.resident.delete(region.id);indexed.resident.set(region.id,region); }
      indexed.stats.reusedViews++;
    } else {
      commands=[];
      for(const region of selected)commands.push(...materializeRegion(indexed,region));
      commands.sort(commandOrder);
      indexed.stats.sorts++;
      indexed.lastVisible={id:selectedIds,commands};
    }
    if(!cached || cached.id!==selectedIds) {
      let warmed=0;
      for(const region of near) {
        if(warmed>=2 || indexed.resident.size>=indexed.maxResident)break;
        if(region.commands || selected.includes(region) || !inViewport(region,offset,width,height,extra+256))continue;
        materializeRegion(indexed,region);warmed++;indexed.stats.prefetchLoads++;
      }
    }
    indexed.stats.candidateRegions=near.length;
    indexed.stats.visibleRegions=selected.length;
    indexed.stats.residentRegions=indexed.resident.size;
    return {commands,visibleChunks:selected.length,totalChunks:indexed.regions.length,stats:{...indexed.stats}};
  }
  return { CHUNK_SIZE, commandOrder, index, visible, indexRegions, visibleRegions };
});
