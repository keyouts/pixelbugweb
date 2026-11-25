"use strict";
// Landscape presets
(function attachPlayVoxelLandscapes(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelLandscapes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxelLandscapes() {
  const MAX_BLOCKS = 16384;
  const PRESETS = Object.freeze(["forest", "desert", "snow", "islands"]);
  const PALETTE = {
    forest:["#42634b", "#648958", "#83a86a", "#b6bd7c", "#446a57"],
    desert:["#8e684d", "#bc8a57", "#e3b978", "#f1cf90", "#b97356"],
    snow:["#586e8a", "#a1bed1", "#d9e7e6", "#f1f6ee", "#81a4be"],
    islands:["#356b8d", "#568c9e", "#b2c68d", "#92b46d", "#4b8b79"]
  };
  const clamp = (v,lo,hi,def) => Math.max(lo, Math.min(Number.isFinite(Number(v)) ? Number(v) : def, hi));
  function hash(x,z,seed) {
    let h=(Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(seed|0,1442695041))|0;
    h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
  }
  function smooth(x,z,seed,scale) {
    const sx=x/scale,sz=z/scale,xi=Math.floor(sx),zi=Math.floor(sz);
    const u=(sx-xi)**2*(3-2*(sx-xi)),v=(sz-zi)**2*(3-2*(sz-zi));
    const lerp=(a,b,t)=>a+(b-a)*t;
    return lerp(lerp(hash(xi,zi,seed),hash(xi+1,zi,seed),u),lerp(hash(xi,zi+1,seed),hash(xi+1,zi+1,seed),u),v);
  }
  function generate(options = {}) {
    const preset=PRESETS.includes(options.preset) ? options.preset : "forest";
    const seed=Math.floor(clamp(options.seed,0,2147483647,17));
    const width=Math.floor(clamp(options.width,4,96,24)),depth=Math.floor(clamp(options.depth,4,96,24));
    const height=Math.floor(clamp(options.height,2,24,12));
    const world = { width, depth, height, cellSize:Math.floor(clamp(options.cellSize,16,64,38)),
      yaw:0,cameraAngle:0,cameraTilt:.5,turntable:false,markers:[],blocks:[],start:{x:0,y:0,z:0} };
    const middleX=Math.floor(width/2),middleZ=Math.floor(depth/2);
    const elevations=Array.from({length:depth},()=>Array(width).fill(0));
    const maxTerrain=Math.max(1,height-5);
    for (let z=0;z<depth;z++) for(let x=0;x<width;x++) {
      const major=smooth(x,z,seed,7),minor=smooth(x,z,seed+41,3);
      const dx=(x-middleX)/Math.max(1,width/2),dz=(z-middleZ)/Math.max(1,depth/2);
      const radius=Math.hypot(dx,dz);
      const flatten=Math.abs(x-middleX)<=1 && Math.abs(z-middleZ)<=1;
      let level=1+Math.floor((major*.68+minor*.32)*maxTerrain);
      if (preset==="islands") level-=Math.floor(Math.max(0,radius-.5)*5);
      if (flatten) level=Math.max(1,Math.floor(height*.27));
      elevations[z][x]=Math.max(0,Math.min(height-3,level));
    }
    // Terrain budget
    const columns=width*depth;
    let budget=MAX_BLOCKS;
    const peak=Math.min(height-3,Math.max(1,Math.floor(MAX_BLOCKS/columns)-1));
    for(let z=0;z<depth;z++)for(let x=0;x<width;x++) {
      const level=Math.min(elevations[z][x],peak);
      elevations[z][x]=level;
      const colorIndex=Math.min(3,Math.floor((level/Math.max(1,peak))*3));
      for(let y=0;y<level && budget>0;y++) {
        world.blocks.push({x,y,z,color:PALETTE[preset][y===level-1 ? colorIndex : 0]});budget--;
      }
    }
    // Terrain decor
    if(height>=7)for(let z=2;z<depth-2;z+=3)for(let x=2;x<width-2;x+=3){
      if(budget<3||Math.abs(x-middleX)<=2&&Math.abs(z-middleZ)<=2)continue;
      const y=elevations[z][x];
      if(y<1||y>=height-4||hash(x,z,seed+93)<.53)continue;
      const [a,b]=preset==="snow"?["#6b7b96","#b7d5e2"]:preset==="desert"?["#92674e","#e0a964"]:preset==="islands"?["#647b4c","#519681"]:["#795b44","#347955"];
      world.blocks.push({x,y,z,color:a},{x,y:y+1,z,color:b},{x,y:y+2,z,color:b});budget-=3;
    }
    world.start={x:middleX+.5,y:elevations[middleZ][middleX],z:middleZ+.5};
    return world;
  }
  return { PRESETS, MAX_BLOCKS, generate };
});
