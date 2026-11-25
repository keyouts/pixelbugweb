"use strict";

(function attachPlayVoxelWorld(root, factory) {
  const chunks = typeof module === "object" && module.exports ? require("./play-voxel-chunks.js") : root?.PixelBugPlayVoxelChunks;
  if (!chunks?.standaloneSource) throw new Error("Voxel chunk module unavailable.");
  const enemies = typeof module === "object" && module.exports ? require("./play-voxel-enemies.js") : root?.PixelBugPlayVoxelEnemies;
  if (!enemies?.standaloneSource) throw new Error("Voxel enemy navigation unavailable.");
  const volume = typeof module === "object" && module.exports ? require("./play-voxel-volume-draw.js") : root?.PixelBugVoxelVolumeDraw;
  if (!volume?.standaloneSource) throw new Error("Voxel volume renderer unavailable.");
  const api = Object.freeze({ ...factory(chunks, enemies, volume), standaloneSource: `(${factory.toString()})(${chunks.standaloneSource},${enemies.standaloneSource},${volume.standaloneSource})` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxelWorld(CHUNKS, ENEMIES, VOLUME) {
  const MAX_BLOCKS = 16384;
  const MAX_WORLD_SIZE = 96;
  const COLOR = /^#[0-9a-f]{6}$/i;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(Number.isFinite(Number(v)) ? Number(v) : lo, hi));
  const integer = (v, lo, hi) => Math.floor(clamp(v, lo, hi));
  const key = (x, y, z) => `${x},${y},${z}`;
  const worldCaches = new WeakMap();
  function invalidateWorldCache(world) { if (world && typeof world === "object") worldCaches.delete(world); }
  function worldCache(world) {
    let cache = worldCaches.get(world);
    const blocks = world.blocks || [];
    if (!cache || cache.blocks !== blocks || cache.length !== blocks.length ||
        cache.width !== world.width || cache.depth !== world.depth || cache.height !== world.height) {
      cache = { blocks, length: blocks.length, width: world.width, depth: world.depth,
        height: world.height, occupied: new Set(blocks.map(b => key(b.x, b.y, b.z))),
        angle: NaN, staticCommands: null, chunkIndex: null, regionStream: null };
      worldCaches.set(world, cache);
    }
    return cache;
  }
  function commandOrder(a, b) { return a.depth - b.depth || a.y - b.y; }
  function regionStream(world, cache) {
    const currentAngle = angle(world);
    if (!cache.regionStream || cache.angle !== currentAngle) {
      cache.angle = currentAngle;
      cache.regionStream = CHUNKS.indexRegions(world, project, rotate, cache.occupied);
    }
    return cache.regionStream;
  }
  function visibleStaticCommands(world, cache, offset, width, height) {
    return CHUNKS.visibleRegions(regionStream(world, cache), offset, width, height, world.cellSize * 2).commands;
  }
  function regionStats(world) {
    const index = regionStream(world, worldCache(world));
    return {...index.stats, totalBlocks:world.blocks.length, maxResident:index.maxResident};
  }
  function mergeDrawCommands(staticCommands, dynamicCommands) {
    if (!dynamicCommands.length) return staticCommands;
    dynamicCommands.sort(commandOrder);
    const result = [];
    let a = 0, b = 0;
    while (a < staticCommands.length && b < dynamicCommands.length) {
      if (commandOrder(staticCommands[a], dynamicCommands[b]) <= 0) result.push(staticCommands[a++]);
      else result.push(dynamicCommands[b++]);
    }
    while (a < staticCommands.length) result.push(staticCommands[a++]);
    while (b < dynamicCommands.length) result.push(dynamicCommands[b++]);
    return result;
  }
  function empty() {
    return { width: 16, depth: 16, height: 12, cellSize: 38, yaw: 0, cameraAngle: 0, cameraTilt: 0.5, turntable: false, markers: [],
      start: { x: 7.5, y: 0, z: 7.5 }, blocks: [] };
  }
  function normalize(raw) {
    const data = raw && typeof raw === "object" ? raw : empty();
    const world = { width: integer(data.width ?? 16, 4, MAX_WORLD_SIZE), depth: integer(data.depth ?? 16, 4, MAX_WORLD_SIZE),
      height: integer(data.height ?? 12, 2, 24), cellSize: integer(data.cellSize ?? 38, 16, 64),
      yaw: integer(data.yaw ?? 0, 0, 3), cameraAngle: 0, cameraTilt: clamp(data.cameraTilt ?? 0.5, 0.22, 1.05), turntable: data.turntable === true, markers: [], start: { x: 0, y: 0, z: 0 }, blocks: [] };
    const rawAngle = Number(data.cameraAngle);
    world.cameraAngle = Number.isFinite(rawAngle) ? ((rawAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2) : world.yaw * Math.PI/2;
    const markersSeen = new Set();
    for (const marker of Array.isArray(data.markers) ? data.markers.slice(0,128) : []) {
      if (!marker || !["trigger", "npc"].includes(marker.kind)) continue;
      const x = Number(marker.x), y = Number(marker.y), z = Number(marker.z);
      if (![x,y,z].every(Number.isInteger) || !inBounds(world,x,y,z)) continue;
      const id = String(marker.id || "").replace(/[^a-z0-9_-]/gi, "").slice(0,48);
      if (!id || markersSeen.has(id)) continue;
      markersSeen.add(id);
      world.markers.push({ id, kind:marker.kind, x,y,z, name:String(marker.name || id).slice(0,48),
        triggerId:String(marker.triggerId || id).replace(/[^a-z0-9_-]/gi,"").slice(0,48),
        characterId:String(marker.characterId || "").slice(0,48),
        componentKind:["collectible","enemy","checkpoint","door","goal"].includes(marker.componentKind) ? marker.componentKind : "",
        componentItem:String(marker.componentItem || "").replace(/[^a-z0-9_-]/gi,"-").slice(0,40),
        componentBehavior:["patrol","chase","guard","wander","sentry"].includes(marker.componentBehavior) ? marker.componentBehavior : "sentry",
        componentPatrolRange:clamp(marker.componentPatrolRange ?? 0, 0, 24),
        componentPatrolSpeed:clamp(marker.componentPatrolSpeed ?? 0, 0, 8),
        componentAggroRange:clamp(marker.componentAggroRange ?? 5, 1, 24) });
    }
    const seen = new Set();
    for (const block of Array.isArray(data.blocks) ? data.blocks.slice(0, MAX_BLOCKS * 3) : []) {
      if (!block || !COLOR.test(String(block.color || ""))) continue;
      const x = Number(block.x), y = Number(block.y), z = Number(block.z);
      if (![x,y,z].every(Number.isInteger) || x < 0 || x >= world.width || y < 0 || y >= world.height || z < 0 || z >= world.depth) continue;
      const id = key(x,y,z);
      if (seen.has(id)) continue;
      seen.add(id);
      world.blocks.push({ x, y, z, color: block.color.toLowerCase() });
      if (world.blocks.length === MAX_BLOCKS) break;
    }
    const start = data.start || {};
    world.start.x = clamp(start.x ?? world.width/2, 0.3, world.width-0.3);
    world.start.y = clamp(start.y ?? 0, 0, world.height);
    world.start.z = clamp(start.z ?? world.depth/2, 0.3, world.depth-0.3);
    return world;
  }
  function demo() {
    const world = empty();
    const blocks = [];
    const add = (x,y,z,color) => blocks.push({x,y,z,color});
    for (let x=1;x<15;x++) for (let z=1;z<15;z++) {
      if ((x===1 || x===14 || z===1 || z===14) && (x+z)%3!==0) add(x,0,z,"#7ba48c");
    }
    for(let x=3;x<=5;x++) for(let z=3;z<=5;z++) add(x,0,z,"#b2a5d8");
    for(let x=4;x<=5;x++) for(let z=4;z<=5;z++) add(x,1,z,"#8d80bd");
    for(let x=10;x<=12;x++) for(let z=3;z<=5;z++) add(x,0,z,"#d99a76");
    for(let y=1;y<=3;y++) for(const [x,z] of [[10,3],[12,3],[10,5],[12,5]]) add(x,y,z,"#d1b58c");
    for(let x=9;x<=13;x++) for(let z=2;z<=6;z++) add(x,4,z,"#a96467");
    for(let x=3;x<12;x++) add(x,0,11,"#9ec0d4");
    add(7,0,5,"#d4bc79"); add(8,0,5,"#d4bc79"); add(8,1,5,"#d4bc79");
    world.blocks = blocks;
    return world;
  }
  function inBounds(world,x,y,z) { return x>=0 && x<world.width && z>=0 && z<world.depth && y>=0 && y<world.height; }
  function blockMap(world) { return new Map((world.blocks || []).map(block => [key(block.x,block.y,block.z),block])); }
  function setBlock(world,x,y,z,color) {
    x=Math.floor(x); y=Math.floor(y); z=Math.floor(z);
    if(!inBounds(world,x,y,z)) return false;
    const index=world.blocks.findIndex(b=>b.x===x&&b.y===y&&b.z===z);
    if(color == null) { if(index<0)return false; world.blocks.splice(index,1); invalidateWorldCache(world); return true; }
    if(!COLOR.test(color)) return false;
    if(index>=0) { if(world.blocks[index].color===color.toLowerCase())return false; world.blocks[index].color=color.toLowerCase(); invalidateWorldCache(world); return true; }
    if(world.blocks.length>=MAX_BLOCKS)return false;
    world.blocks.push({x,y,z,color:color.toLowerCase()}); invalidateWorldCache(world); return true;
  }
  function stampAsset(world,asset,x,z,poseId="") {
    if(!asset||!Array.isArray(asset.cubes))return 0;
    const source=asset.poses?.find(p=>p.id===poseId)?.cubes || asset.cubes;
    if(!source.length)return 0;
    const sizeX=Math.max(1,Number(asset.width)||1), sizeY=Math.max(1,Number(asset.height)||1), sizeZ=Math.max(1,Number(asset.depth)||1);
    const scale=Math.min(1, 8/Math.max(sizeX,sizeZ), 7/sizeY);
    const used=new Set(); let changed=0;
    for(const cube of source.slice(0,24000)) {
      const bx=Math.floor(x+Math.floor(cube.x*scale)), by=Math.floor(cube.y*scale), bz=Math.floor(z+Math.floor(cube.z*scale));
      const id=key(bx,by,bz);
      if(used.has(id))continue;
      used.add(id);
      if(setBlock(world,bx,by,bz,cube.color))changed++;
    }
    return changed;
  }
  // Camera projection
  function angle(world) {
    return Number.isFinite(world.cameraAngle) ? world.cameraAngle : (world.yaw||0)*Math.PI/2;
  }
  function rotate(world,x,z) {
    const a=angle(world), c=Math.cos(a), s=Math.sin(a);
    const dx=x-world.width/2, dz=z-world.depth/2;
    return {x:dx*c-dz*s,z:dx*s+dz*c};
  }
  function unrotate(world,x,z) {
    const a=angle(world), c=Math.cos(a), s=Math.sin(a);
    return {x:x*c+z*s+world.width/2,z:-x*s+z*c+world.depth/2};
  }
  function project(world,x,y,z) {
    const r=rotate(world,x,z), t=world.cellSize, tilt=world.cameraTilt??.5;
    return {x:(r.x-r.z)*t/2,y:(r.x+r.z)*t*tilt/2-y*t/2};
  }
  function view(world,canvasWidth,canvasHeight,anchor=null) {
    const target=anchor ? project(world,anchor.x,anchor.y,anchor.z) : {x:0,y:0};
    return {x:canvasWidth/2-target.x,y:canvasHeight*.57-target.y};
  }
  function screen(world,x,y,z,offset) { const p=project(world,x,y,z); return {x:p.x+offset.x,y:p.y+offset.y}; }
  function pick(world,sx,sy,canvasWidth,canvasHeight,layer=0,anchor=null) {
    const off=view(world,canvasWidth,canvasHeight,anchor);
    const t=world.cellSize, tilt=world.cameraTilt??.5;
    const a=(sx-off.x)/(t/2), b=(sy-off.y+layer*t/2)/(t*tilt/2);
    const rotated=unrotate(world,(a+b)/2,(b-a)/2);
    const x=Math.floor(rotated.x),z=Math.floor(rotated.z);
    return x>=0&&x<world.width&&z>=0&&z<world.depth?{x,y:layer,z}:null;
  }
  function orbit(world,dx,dy=0) {
    world.cameraAngle=((angle(world)+dx)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    world.cameraTilt=clamp((world.cameraTilt??.5)+dy,.22,1.05);
    world.yaw=Math.round(world.cameraAngle*2/Math.PI)%4;
    return world;
  }
  function markerAt(world,cell) {
    return (world.markers||[]).find(m=>m.x===cell.x&&m.y===cell.y&&m.z===cell.z)||null;
  }
  function markerPosition(world, marker, tick=0, actor=null) {
    return ENEMIES.position(world, marker, tick, actor, worldCache(world).occupied);
  }
  function markerNear(world,actor,kind,reach=1.65,tick=0) {
    let best=null,bestDistance=Infinity;
    for (const marker of world.markers||[]) {
      if (kind&&marker.kind!==kind)continue;
      const location=markerPosition(world,marker,tick,actor);
      const distance=Math.hypot(actor.x-location.x,actor.z-location.z);
      if (distance<reach&&Math.abs(actor.y-location.y)<2&&distance<bestDistance) {best=marker;bestDistance=distance;}
    }
    return best;
  }
  function shade(hex,factor) {
    const n=parseInt(hex.slice(1),16);
    return `rgb(${[n>>16&255,n>>8&255,n&255].map(v=>Math.min(255,Math.max(0,Math.round(v*factor)))).join(",")})`;
  }
  function polygon(ctx,pts,color,stroke) {
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);
    ctx.closePath();ctx.fillStyle=color;ctx.fill();
    if(stroke) { ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke(); }
  }
  function drawCube(ctx,world,block,offset,occupied) {
    const {x,y,z}=block;
    const point=(dx,dy,dz)=>screen(world,x+dx,y+dy,z+dz,offset);
    const corners={a:point(0,1,0),b:point(1,1,0),c:point(1,1,1),d:point(0,1,1),
      e:point(0,0,0),f:point(1,0,0),g:point(1,0,1),h:point(0,0,1)};
    const a=angle(world);
    const dx=Math.cos(a)+Math.sin(a), dz=Math.cos(a)-Math.sin(a);
    if (Math.abs(dx)>1e-6) {
      const near=dx>0?1:-1;
      if(!occupied.has(key(x+near,y,z)))polygon(ctx,near>0?[corners.b,corners.c,corners.g,corners.f]:[corners.d,corners.a,corners.e,corners.h],shade(block.color,.76),"rgba(0,0,0,.18)");
    }
    if (Math.abs(dz)>1e-6) {
      const near=dz>0?1:-1;
      if(!occupied.has(key(x,y,z+near)))polygon(ctx,near>0?[corners.d,corners.c,corners.g,corners.h]:[corners.a,corners.b,corners.f,corners.e],shade(block.color,.62),"rgba(0,0,0,.18)");
    }
    if(!occupied.has(key(x,y+1,z)))polygon(ctx,[corners.a,corners.b,corners.c,corners.d],shade(block.color,1.14),"rgba(0,0,0,.18)");
  }
  function draw(ctx,world,actor,sprite,opts={}) {
    const w=ctx.canvas.width,h=ctx.canvas.height;
    const anchor=opts.follow?actor:null,offset=view(world,w,h,anchor);
    ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle=opts.background||"#b8d4d6";ctx.fillRect(0,0,w,h);
    const cache = worldCache(world);
    const occupied = cache.occupied;
    const dynamicCommands = [];
    for (const marker of world.markers || []) {
      const location=opts.follow ? markerPosition(world,marker,opts.tick||0,actor) : {x:marker.x+.5,y:marker.y,z:marker.z+.5};
      const r = rotate(world, location.x, location.z);
      dynamicCommands.push({ depth: r.x + r.z + .1, y: location.y, kind: "marker", marker, location });
    }
    if (actor) {
      const r = rotate(world, actor.x, actor.z);
      dynamicCommands.push({ depth: r.x + r.z + .12, y: actor.y, kind: "actor" });
    }
    if (sprite?.voxelVolume && actor) dynamicCommands.push(...VOLUME.commands(world,actor,sprite,rotate));
    const commands = mergeDrawCommands(visibleStaticCommands(world, cache, offset, w, h), dynamicCommands);
    const t=world.cellSize,half=t/2;
    for(const command of commands) {
      if(command.kind==="ground" || command.kind==="block") {
        const b=command.kind==="block" ? command.block : command;
        const point=screen(world,b.x+.5,b.y||0,b.z+.5,offset);
        if (point.x < -t*2 || point.x > w+t*2 || point.y < -t*2 || point.y > h+t*2) continue;
      }
      if(command.kind==="ground") {
        const x=command.x,z=command.z;
        polygon(ctx,[screen(world,x,0,z,offset),screen(world,x+1,0,z,offset),screen(world,x+1,0,z+1,offset),screen(world,x,0,z+1,offset)],
          (x+z)%2?"#d6dfcf":"#cad9c8","rgba(50,75,62,.2)");
      } else if(command.kind==="block")drawCube(ctx,world,command.block,offset,occupied);
      else if(command.kind==="voxel-actor") VOLUME.draw(ctx,world,command.cube,offset,screen,polygon,shade,angle);
      else if(command.kind==="marker") {
        const marker=command.marker,loc=command.location,p=screen(world,loc.x,loc.y+1,loc.z,offset);
        const colors={collectible:"#ffd459",enemy:"#dc5865",checkpoint:"#68c9df",door:"#b38bda",goal:"#71dd99"};
        const color=colors[marker.componentKind] || (marker.kind==="npc"?"#7656ac":"#d79728");
        const pulse=1 + Math.sin((Number(opts.tick)||0) / 13) * .13;
        const radius=Math.max(4,t*.16)*pulse;
        ctx.fillStyle=color;
        ctx.beginPath();
        if(marker.componentKind==="enemy")ctx.rect(p.x-radius,p.y-11-radius,radius*2,radius*2);
        else if(marker.componentKind==="door")ctx.roundRect(p.x-radius,p.y-11-radius,radius*2,radius*2,2);
        else if(marker.componentKind==="goal"){
          ctx.moveTo(p.x,p.y-11-radius*1.4);ctx.lineTo(p.x+radius*1.1,p.y-11);ctx.lineTo(p.x,p.y-11+radius*1.4);ctx.lineTo(p.x-radius*1.1,p.y-11);ctx.closePath();
        }else ctx.arc(p.x,p.y-11,radius,0,Math.PI*2);
        ctx.fill();ctx.strokeStyle="#f8f7ed";ctx.lineWidth=2;ctx.stroke();
        ctx.font="700 11px system-ui";ctx.textAlign="center";ctx.fillStyle="#18252b";
        ctx.fillText(marker.name||marker.id,p.x,p.y-22);ctx.textAlign="start";
      } else if(actor && command.kind==="actor") {
        const p=screen(world,actor.x,actor.y,actor.z,offset);
        ctx.fillStyle="rgba(20,39,30,.23)";ctx.beginPath();ctx.ellipse(p.x,p.y,Math.max(5,t*.26),Math.max(3,t*.11),0,0,Math.PI*2);ctx.fill();
        if (!sprite?.voxelVolume && sprite?.canvas && sprite.sw > 0 && sprite.sh > 0) {
          const desiredHeight=Math.max(22,Math.min(130,sprite.h||t*2));
          const desiredWidth=Math.max(10,desiredHeight*(sprite.sw/sprite.sh));
          ctx.save();
          if((sprite.flip == null ? actor.facing < 0 : sprite.flip)) {ctx.translate(p.x+desiredWidth/2,p.y-desiredHeight);ctx.scale(-1,1);ctx.drawImage(sprite.canvas,sprite.sx||0,sprite.sy||0,sprite.sw,sprite.sh,0,0,desiredWidth,desiredHeight);}
          else ctx.drawImage(sprite.canvas,sprite.sx||0,sprite.sy||0,sprite.sw,sprite.sh,p.x-desiredWidth/2,p.y-desiredHeight,desiredWidth,desiredHeight);
          ctx.restore();
        }else if (!sprite?.voxelVolume){ctx.fillStyle="#27263f";ctx.fillRect(p.x-9,p.y-35,18,35);ctx.fillStyle="#f6dfab";ctx.fillRect(p.x-7,p.y-45,14,15);}
      }
    }
    if(opts.hover&&!opts.follow) {
      const {x,y,z}=opts.hover;
      if(inBounds(world,x,y,z)) {
        ctx.save();ctx.globalAlpha=.7;
        polygon(ctx,[screen(world,x,y,z,offset),screen(world,x+1,y,z,offset),screen(world,x+1,y,z+1,offset),screen(world,x,y,z+1,offset)],"rgba(255,211,65,.36)","#ecb520");ctx.restore();
      }
    }
    ctx.restore();return offset;
  }
  function collides(world,blocks,x,y,z) {
    const radius=.25, top=y+1.52, bottom=y+.07;
    if(x-radius<0||x+radius>world.width||z-radius<0||z+radius>world.depth)return true;
    for(let bx=Math.floor(x-radius);bx<=Math.floor(x+radius);bx++)
      for(let bz=Math.floor(z-radius);bz<=Math.floor(z+radius);bz++)
        for(let by=Math.max(0,Math.floor(bottom));by<=Math.min(world.height-1,Math.floor(top-.0001));by++)
          if(blocks.has(key(bx,by,bz)) && x+radius>bx && x-radius<bx+1 && z+radius>bz && z-radius<bz+1 && top>by && bottom<by+1)return true;
    return false;
  }
  const ACTOR_RADIUS = 0.25;
  const ACTOR_HEIGHT = 1.52;
  const SURFACE_EPSILON = 0.000001;
  function supportHeight(world, blocks, x, z, feet, tolerance = SURFACE_EPSILON) {
    let result = 0;
    for (let bx = Math.max(0, Math.floor(x - ACTOR_RADIUS)); bx <= Math.min(world.width - 1, Math.floor(x + ACTOR_RADIUS)); bx++) {
      for (let bz = Math.max(0, Math.floor(z - ACTOR_RADIUS)); bz <= Math.min(world.depth - 1, Math.floor(z + ACTOR_RADIUS)); bz++) {
        if (x + ACTOR_RADIUS <= bx || x - ACTOR_RADIUS >= bx + 1 || z + ACTOR_RADIUS <= bz || z - ACTOR_RADIUS >= bz + 1) continue;
        for (let by = Math.min(world.height - 1, Math.floor(feet + tolerance) - 1); by >= 0; by--) {
          const top = by + 1;
          if (top <= feet + tolerance && blocks.has(key(bx, by, bz))) { result = Math.max(result, top); break; }
        }
      }
    }
    return result;
  }
  function spawnIssues(world) {
    const start = initialActor(world);
    const blocks = worldCache(world).occupied;
    const issues = [];
    if (collides(world, blocks, start.x, start.y, start.z)) issues.push("Player start intersects a solid voxel block.");
    if (start.y > SURFACE_EPSILON && supportHeight(world, blocks, start.x, start.z, start.y) < start.y - SURFACE_EPSILON)
      issues.push("Player start is above empty space and will fall until supported.");
    return issues;
  }
  function initialActor(world) {
    return { x:world.start.x, y:world.start.y, z:world.start.z, vy:0, facing:1, direction:"down", grounded:false, moving:false, jumpHeld:false };
  }
  function step(world, actor, input = {}, dt = 1/60) {
    const blocks = worldCache(world).occupied;
    const duration = clamp(dt, 0, 0.05);
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dz = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const n = Math.hypot(dx, dz) || 1;
    const speed = 3.5 * duration;
    const jumpPressed = Boolean(input.jump) && !actor.jumpHeld;
    actor.jumpHeld = Boolean(input.jump);
    actor.moving = dx !== 0 || dz !== 0;
    if (dx) actor.facing = dx < 0 ? -1 : 1;
    if (Math.abs(dx) >= Math.abs(dz) && dx) actor.direction = dx < 0 ? "left" : "right";
    else if (dz) actor.direction = dz < 0 ? "up" : "down";
    const nx = clamp(actor.x + (dx / n) * speed, ACTOR_RADIUS, world.width - ACTOR_RADIUS);
    if (!collides(world, blocks, nx, actor.y, actor.z)) actor.x = nx;
    const nz = clamp(actor.z + (dz / n) * speed, ACTOR_RADIUS, world.depth - ACTOR_RADIUS);
    if (!collides(world, blocks, actor.x, actor.y, nz)) actor.z = nz;

    // Exact support
    const support = supportHeight(world, blocks, actor.x, actor.z, actor.y);
    const onSurface = Math.abs(actor.y - support) <= SURFACE_EPSILON && actor.vy <= 0;
    if (onSurface) { actor.y = support; actor.vy = 0; actor.grounded = true; }
    else actor.grounded = false;
    if (jumpPressed && actor.grounded) { actor.vy = 7.2; actor.grounded = false; }
    if (actor.grounded || duration === 0) return actor;

    let remaining = duration;
    while (remaining > 1e-10) {
      const sub = Math.min(1/120, remaining);
      remaining -= sub;
      actor.vy = Math.max(-18, actor.vy - 19 * sub);
      const next = Math.max(0, actor.y + actor.vy * sub);
      if (actor.vy <= 0) {
        // Swept landing
        const landing = supportHeight(world, blocks, actor.x, actor.z, actor.y);
        if (next <= landing + SURFACE_EPSILON) {
          actor.y = landing;
          actor.vy = 0;
          actor.grounded = true;
          break;
        }
        actor.y = next;
      } else if (collides(world, blocks, actor.x, next, actor.z)) {
        // Ceiling impact
        actor.vy = 0;
      } else actor.y = next;
    }
    return actor;
  }
  return { MAX_BLOCKS, MAX_WORLD_SIZE, regionStats, markerPosition, empty, normalize, demo, inBounds, blockMap, setBlock, invalidateWorldCache, stampAsset, angle, orbit, markerAt, markerNear, rotate, unrotate, project, view, screen, pick, draw, collides, spawnIssues, initialActor, step };
});
