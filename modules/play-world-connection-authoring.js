"use strict";
// Connection authoring
(function attachPlayWorldConnectionAuthoring(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorldConnectionAuthoring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWorldConnectionAuthoring() {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : lo));
  const safe = v => String(v ?? "").replace(/[^a-z0-9_-]/gi, "-").slice(0, 48);
  function sceneFor(playMode, id) {
    const scene = (playMode?.scenes || []).find(item => item.id === id);
    if (!scene) return null;
    // Active state
    return id === playMode.activeSceneId ? playMode : scene;
  }
  function markerLocation(world = {}) {
    const w = Math.max(4, Number(world.width) || 16), d = Math.max(4, Number(world.depth) || 16);
    const h = Math.max(2, Number(world.height) || 12);
    const sx = Math.floor(clamp(world.start?.x ?? w / 2, 0, w - 1));
    const sz = Math.floor(clamp(world.start?.z ?? d / 2, 0, d - 1));
    const occupied = new Set((world.blocks || []).map(b => `${b.x},${b.y},${b.z}`));
    const markers = new Set((world.markers || []).map(m => `${m.x},${m.y},${m.z}`));
    for (let radius = 0; radius < Math.max(w, d); radius++) {
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = sx + dx, z = sz + dz;
        if (x < 0 || z < 0 || x >= w || z >= d) continue;
        for (let y = 1; y < h; y++) {
          if (occupied.has(`${x},${y},${z}`) || markers.has(`${x},${y},${z}`)) continue;
          if (occupied.has(`${x},${y-1},${z}`)) return {x,y,z};
        }
      }
    }
    // Blank worlds
    return {x:sx,y:Math.round(clamp(world.start?.y ?? 0,0,h-1)),z:sz};
  }
  function create(playMode, fromId, toId, options = {}) {
    const source = sceneFor(playMode, fromId);
    const destination = sceneFor(playMode, toId);
    if (!source || !destination) return {ok:false, message:"Choose two existing worlds."};
    if (fromId === toId) return {ok:false, message:"Choose a different destination world."};
    const isVoxel = source.worldType === "voxel3d";
    const mode = options.mode === "portal" && !isVoxel ? "portal" : "rule";
    const nodes = playMode.nodeEditor?.nodes;
    if (mode === "rule" && (!Array.isArray(nodes) || nodes.length > 98)) return {ok:false,message:"The rule map has reached its 100-node limit."};
    if (isVoxel && (!source.voxelWorld || !Array.isArray(source.voxelWorld.markers) || source.voxelWorld.markers.length >= 128))
      return {ok:false,message:"This voxel world has reached its marker limit."};
    if (!isVoxel && Array.isArray(source.props) && source.props.length >= 128)
      return {ok:false,message:"This 2D world has reached its object limit."};
    const used = new Set([...(nodes || []).map(n => String(n.id)),
      ...(source.props || []).map(p => String(p.nodeTriggerId || "")),
      ...(source.voxelWorld?.markers || []).flatMap(m => [String(m.id),String(m.triggerId)])]);
    const makeId = options.makeId || (prefix => `${prefix}-${Math.random().toString(36).slice(2,10)}`);
    function unique(prefix) {
      let id;
      for (let n=0;n<256;n++) {
        id = safe(makeId(prefix)) || `${prefix}-${n}`;
        if (!used.has(id)) {used.add(id);return id;}
      }
      return "";
    }
    const triggerId=unique("portal-touch");
    if (!triggerId) return {ok:false,message:"Unable to assign a unique portal trigger ID."};
    const eventId=mode==="rule"?unique("world-touch"):"";
    const actionId=mode==="rule"?unique("world-go"):"";
    if (mode==="rule"&&(!eventId||!actionId)) return {ok:false,message:"Unable to assign rule IDs."};
    const destinationName=String((playMode.scenes || []).find(item=>item.id===toId)?.name || destination.name || toId);
    const name = `Portal to ${destinationName.slice(0,28)}`;
    let object;
    if (isVoxel) {
      const point=markerLocation(source.voxelWorld);
      object={ id:triggerId,triggerId,kind:"trigger",name,x:point.x,y:point.y,z:point.z };
      source.voxelWorld.markers.push(object);
    } else {
      if (!Array.isArray(source.props)) source.props=[];
      const index=source.props.length;
      const sceneWidth=Number(source.sceneWidth)||640,sceneHeight=Number(source.sceneHeight)||360;
      const x=clamp((source.player?.x ?? 76) + 54 + index*15,0,sceneWidth-20);
      const y=clamp(source.player?.y ?? sceneHeight-96,0,sceneHeight-20);
      object={id:triggerId,name,frame:Math.max(0,Math.floor(Number(source.idleFrame)||0)),x,y,scale:2,
        solid:false,nodeTriggerId:triggerId,targetSceneId:mode==="portal"?toId:"",targetX:null,targetY:null};
      source.props.push(object);
    }
    if (mode === "portal") return {ok:true,mode,object,triggerId,message:`Created an editable portal object to ${destinationName}.`};
    const index=nodes.length;
    const x=40+(index%3)*45,y=70+(index%5)*150;
    const event={id:eventId,type:"eventTrigger",name:`Touch ${name}`.slice(0,48),x,y,next:actionId,alt:"",data:{sceneId:fromId,trigger:triggerId}};
    const action={id:actionId,type:"actionScene",name:`Enter ${destinationName}`.slice(0,48),x:x+300,y,next:"",alt:"",data:{sceneId:toId}};
    nodes.push(event,action);
    playMode.nodeEditor.selectedId=eventId;
    return {ok:true,mode,object,triggerId,eventId,actionId,message:`Created portal target and touch → scene rule for ${destinationName}.`};
  }
  return {create,sceneFor,markerLocation};
});
