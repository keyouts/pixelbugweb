"use strict";
// Geometry runtime
(function attachVoxelCharacterGeometry(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelCharacterGeometry = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVoxelCharacterGeometry() {
  const MAX_DRAW_CELLS = 2600;
  const cachedSurfaces = new WeakMap();
  const hex = /^#[0-9a-f]{6}$/i;
  const limit = (v, lo, hi, fallback) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
  function normalizeRig(raw) {
    return {
      enabled: raw?.enabled === true,
      interpolate: raw?.interpolate === true,
      swing: Math.round(limit(raw?.swing, 0, 35, 14)),
      bob: Math.round(limit(raw?.bob, 0, 20, 4)),
      type: "biped"
    };
  }
  function poseCubes(asset, poseId) {
    return (asset?.poses || []).find(p => p.id === poseId)?.cubes || asset?.cubes || [];
  }
  function surfaces(asset, poseId) {
    let poses = cachedSurfaces.get(asset);
    if (!poses) { poses = new Map(); cachedSurfaces.set(asset, poses); }
    const id = poseId || "base";
    const source = poseCubes(asset, poseId);
    const prior = poses.get(id);
    if (prior?.source === source && prior.length === source.length) return prior;
    const occupied = new Set();
    for (const c of source.slice(0,24000)) if (c && hex.test(c.color) && [c.x,c.y,c.z].every(Number.isInteger) && c.x>=0 && c.y>=0 && c.z>=0 && c.x<asset.width && c.y<asset.height && c.z<asset.depth) occupied.add(`${c.x},${c.y},${c.z}`);
    const result = [];
    for (const c of source.slice(0,24000)) {
      if (!c || !occupied.has(`${c.x},${c.y},${c.z}`)) continue;
      const {x,y,z} = c;
      const open = {
        top: !occupied.has(`${x},${y+1},${z}`),
        px: !occupied.has(`${x+1},${y},${z}`), nx: !occupied.has(`${x-1},${y},${z}`),
        pz: !occupied.has(`${x},${y},${z+1}`), nz: !occupied.has(`${x},${y},${z-1}`)
      };
      if (open.top || open.px || open.nx || open.pz || open.nz) result.push({ x,y,z,color:c.color,open });
    }
    const value = {source, length:source.length, cells:result};
    poses.set(id,value);
    if (poses.size > 16) poses.delete(poses.keys().next().value);
    return value;
  }
  function clipFrame(settings, key, tick) {
    const field = key === "voxelIdlePoseId" ? "voxelIdlePoseClip" : key === "voxelWalkPoseId" ? "voxelWalkPoseClip" : "";
    const entries = field ? String(settings?.[field] || "").split(",").slice(0,12).filter(v => /^[a-z0-9_-]{1,48}$/i.test(v)) : [];
    const fallback = String(settings?.[key] || "").slice(0,48);
    if (!entries.length) return {first:fallback,second:fallback,mix:0};
    const ticks = Math.max(2, Math.min(60, Math.floor(Number(settings?.voxelPoseClipTicks) || 8)));
    const progress = Math.max(0, Number(tick) || 0) / ticks;
    const n = Math.floor(progress);
    return {first:entries[n % entries.length],second:entries[(n+1) % entries.length],mix:progress-n};
  }
  function boneFor(c, w, h) {
    const x = (c.x + .5) / w, y = (c.y + .5) / h;
    if (y < .34) return x < .5 ? "left-leg" : "right-leg";
    if (y >= .33 && y < .78 && (x < .25 || x > .75)) return x < .5 ? "left-arm" : "right-arm";
    if (y >= .78) return "head";
    return "torso";
  }
// Rig motion
  function articulate(c, width, height, depth, rig, tick, moving, grounded) {
    const x = c.x + .5, y = c.y + .5, z = c.z + .5;
    if (!rig.enabled) return {x,y,z};
    const group = boneFor(c,width,height);
    const phase = Math.max(0,Number(tick)||0) * Math.PI / 14;
    const amplitude = (rig.swing * Math.PI / 180) * (moving && grounded ? 1 : .15);
    const sign = group.startsWith("left") ? 1 : -1;
    if (group === "torso") return {x,y:y + Math.sin(phase*2) * rig.bob / 100,z};
    if (group === "head") return {x,y:y + Math.sin(phase*2) * rig.bob / 75,z};
    const pivotY = group.endsWith("arm") ? height*.72 : height*.32;
    const angle = Math.sin(phase) * amplitude * sign * (group.endsWith("leg") ? -1 : 1);
    const dy = y - pivotY, dz = z - depth / 2;
    return {x,y:pivotY+dy*Math.cos(angle)-dz*Math.sin(angle),z:depth/2+dy*Math.sin(angle)+dz*Math.cos(angle)};
  }
  function mixColor(first, second, amount) {
    if (first === second || amount <= 0) return first;
    const a = Number.parseInt(first.slice(1),16), b = Number.parseInt(second.slice(1),16);
    const c = shift => Math.max(0,Math.min(255,Math.round(((a>>shift)&255)*(1-amount)+((b>>shift)&255)*amount)));
    return `#${[c(16),c(8),c(0)].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  }
  function sample(asset, settings, actor, tick=0) {
    if (!asset || !actor) return [];
    const width = Math.max(1, Number(asset.width)||1), height = Math.max(1, Number(asset.height)||1), depth = Math.max(1,Number(asset.depth)||1);
    const rig = normalizeRig(settings?.voxelRigPreview || asset.rig);
    const moving = actor.moving === true || Math.abs(Number(actor.vx)||0) > .08;
    const state = !actor.grounded ? "voxelJumpPoseId" : moving ? "voxelWalkPoseId" : "voxelIdlePoseId";
    const frames = clipFrame(settings, state, tick);
    const primary = surfaces(asset,frames.first).cells;
    const secondary = rig.interpolate && frames.second !== frames.first ? surfaces(asset,frames.second).cells : null;
    const byKey = secondary ? new Map(secondary.map(c=>[`${c.x},${c.y},${c.z}`,c])) : null;
    const primaryKeys = byKey ? new Set() : null;
    const model = [];
    for (const c of primary) {
      const k=`${c.x},${c.y},${c.z}`;
      if (primaryKeys) primaryKeys.add(k);
      const next=byKey?.get(k);
      model.push({...c,color:next?mixColor(c.color,next.color,frames.mix):c.color,alpha:next?1:secondary?1-frames.mix:1});
    }
    if (secondary) for (const c of secondary) if (!primaryKeys.has(`${c.x},${c.y},${c.z}`)) model.push({...c,alpha:frames.mix});
    const stride = Math.max(1,Math.ceil(model.length/MAX_DRAW_CELLS));
    const scale = Math.min(1.65/height,.95/Math.max(width,depth));
    const yaw = ({down:0,right:1,up:2,left:3})[actor.direction] ?? 0;
    const cubes=[];
    for (let i=0;i<model.length;i+=stride) {
      const c=model[i];
      if (!c || c.alpha < .035) continue;
      const v=articulate(c,width,height,depth,rig,tick,moving,actor.grounded);
      let x=(v.x-width/2)*scale, z=(v.z-depth/2)*scale;
      if (yaw===1) [x,z]=[-z,x]; else if(yaw===2) {x=-x;z=-z;} else if(yaw===3) [x,z]=[z,-x];
// Geometry runtime
      cubes.push({x:actor.x+x,y:Math.max(actor.y,actor.y+(v.y-.5)*scale),z:actor.z+z,size:scale,color:c.color,alpha:c.alpha,open:c.open});
    }
    return cubes;
  }
  return {normalizeRig, sample, clipFrame, MAX_DRAW_CELLS};
});
