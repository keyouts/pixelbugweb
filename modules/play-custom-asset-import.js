"use strict";
(function attachPlayCustomAssetImport(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayCustomAssetImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayCustomAssetImport() {
  const MAX_FILE_BYTES = 16 * 1024 * 1024;
  const MAX_VOXELS = 24000;
  const MAX_WORLD_BLOCKS = 16384;
  const MAX_SHEET_CELLS = 64;
  const HEX = /^#[0-9a-f]{6}$/i;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : min));
  const cleanName = (text, fallback = "Imported asset") => String(text || fallback).replace(/[<>\r\n]/g, "").trim().slice(0, 48) || fallback;
  function checkedVoxelData(raw) {
    if (!raw || typeof raw !== "object") throw new Error("Expected a voxel model or world JSON object.");
    let src = raw;
    if (raw.voxelModel?.cubes) src = raw.voxelModel;
    else if (raw.voxelWorld?.blocks) src = raw.voxelWorld;
    else if (raw.world?.blocks) src = raw.world;
    const blocks = Array.isArray(src.blocks) ? src.blocks : null;
    const cubes = blocks || (Array.isArray(src.cubes) ? src.cubes : null);
    if (!cubes) throw new Error("JSON must contain cubes or blocks (PixelBug voxel JSON/world).");
    if (cubes.length > MAX_VOXELS * 4) throw new Error("Voxel import has too many cells; reduce the model before importing.");
    const seen = new Set(), out = [];
    for (const item of cubes) {
      const x = Number(item?.x), y = Number(item?.y), z = Number(item?.z);
      const color = String(item?.color || "");
      if (![x,y,z].every(Number.isInteger) || !HEX.test(color) || x < 0 || y < 0 || z < 0 || x > 511 || y > 511 || z > 511) continue;
      const key = `${x}:${y}:${z}`;
      if (seen.has(key)) continue;
      seen.add(key); out.push({ x, y, z, color: color.toLowerCase() });
      if (out.length > MAX_VOXELS) throw new Error(`Voxel import exceeds the ${MAX_VOXELS.toLocaleString()}-voxel asset limit.`);
    }
    if (!out.length) throw new Error("There are no valid colored voxel cells in this file.");
    const width = Math.max(1, Number(src.width) || Math.max(...out.map(p => p.x)) + 1);
    const height = Math.max(1, Number(src.height) || Math.max(...out.map(p => p.y)) + 1);
    const depth = Math.max(1, Number(src.depth) || Math.max(...out.map(p => p.z)) + 1);
    if (![width,height,depth].every(n => Number.isInteger(n) && n >= 1 && n <= 512)) throw new Error("Voxel dimensions must be between 1 and 512 cells.");
    const valid = out.filter(p => p.x < width && p.y < height && p.z < depth);
    if (!valid.length) throw new Error("No voxel cells fit the declared dimensions.");
    return { name: cleanName(src.name || raw.name, "Imported voxels"), width, height, depth, cubes: valid, source: blocks ? "world" : "model" };
  }

  function parseVox(input) {
    const scene = typeof module === "object" && module.exports
      ? require("./play-vox-scene.js")
      : globalThis.PixelBugPlayVoxScene;
    if (!scene) throw new Error("VOX scene reader is unavailable.");
    return scene.parseVoxScene(input);
  }
  function asAsset(voxel, id, name) {
    if (!voxel?.cubes?.length) throw new Error("Select a voxel file first.");
    return { id:String(id).replace(/[^a-z0-9_-]/gi,"-").slice(0,48), name:cleanName(name,voxel.name),
      width:voxel.width,height:voxel.height,depth:voxel.depth,cubes:voxel.cubes,poses:[],detailStep:1 };
  }
  function asWorld(voxel) {
    if (!voxel?.cubes?.length) throw new Error("Select a voxel file first.");
    const ratio = Math.max(1,voxel.width/96,voxel.height/24,voxel.depth/96);
    const width = clamp(Math.ceil(voxel.width/ratio),4,96);
    const height = clamp(Math.ceil(voxel.height/ratio),2,24);
    const depth = clamp(Math.ceil(voxel.depth/ratio),4,96);
    const seen=new Set(),blocks=[];
    for(const cube of voxel.cubes) {
      const x=Math.floor(cube.x/ratio), y=Math.floor(cube.y/ratio), z=Math.floor(cube.z/ratio);
      if(x>=width||y>=height||z>=depth)continue;
      const key=`${x}:${y}:${z}`;
      if(seen.has(key))continue;
      seen.add(key);blocks.push({x,y,z,color:cube.color});
      if(blocks.length>MAX_WORLD_BLOCKS)throw new Error("Landscape exceeds 16,384 playable blocks. Simplify it or import it as a reusable object.");
    }
    const occupied=new Set(blocks.map(b=>`${b.x}:${b.y}:${b.z}`));
    let start=null,score=Infinity;
    for(let x=0;x<width;x++)for(let z=0;z<depth;z++)for(let y=height-2;y>=0;y--){
      if(!occupied.has(`${x}:${y}:${z}`)||occupied.has(`${x}:${y+1}:${z}`)||occupied.has(`${x}:${y+2}:${z}`))continue;
      const d=Math.abs(x-width/2)+Math.abs(z-depth/2) + Math.abs(y-height/3)*.1;
      if(d<score){score=d;start={x:x+.5,y:y+1,z:z+.5};}
      break;
    }
    if(!start)throw new Error("Landscape has no unobstructed player spawn. Remove a few blocks to leave headroom.");
    return {width,depth,height,cellSize:38,yaw:0,cameraAngle:0,cameraTilt:.5,turntable:false,markers:[],blocks,start,importScale:ratio};
  }
  function imageSignature(input) {
    const b=input instanceof Uint8Array?input:new Uint8Array(input);
    if(b.length>=8&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x))return "png";
    if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return "jpeg";
    if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP")return "webp";
    throw new Error("Unsupported or unrecognized image bytes. Use a PNG, JPEG, or WebP image.");
  }
  function sheetLayout(width,height,columns,rows,maxFrames=240,existingFrames=0) {
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4096*4096)throw new Error("Image dimensions are unsupported.");
    columns=clamp(columns,1,32);rows=clamp(rows,1,32);
    if(width%columns || height%rows)throw new Error("Sheet width/height must divide evenly into the chosen columns and rows.");
    const count=columns*rows;
    if(count>MAX_SHEET_CELLS)throw new Error("Import up to 64 sprites per sheet.");
    if(existingFrames+count>maxFrames)throw new Error("Not enough Base Mode frame slots (240 maximum).");
    return {width,height,columns,rows,count,cellWidth:width/columns,cellHeight:height/rows};
  }
  function shiftFramePixels(frame, dx = 0, dy = 0) {
    dx=clamp(dx,-64,64);dy=clamp(dy,-64,64);
    if(!frame?.length||(!dx&&!dy))return frame;
    const height=frame.length,width=frame[0].length;
    return frame.map((row,y)=>row.map((_,x)=>frame[y-dy]?.[x-dx]??null));
  }
  function extractSheet(imageData,layout,projectWidth,projectHeight,options = {}) {
    const {data,width,height}=imageData;
    if(width!==layout.width||height!==layout.height||!data||data.length<width*height*4)throw new Error("Image data and sheet dimensions differ.");
    projectWidth=clamp(projectWidth,1,512);projectHeight=clamp(projectHeight,1,512);
    if(projectWidth*projectHeight*layout.count>1000000)throw new Error("Sprite import would create more than one million editable pixels. Use fewer frames or a smaller Base canvas.");
    const frames=[];
    for(let index=0;index<layout.count;index++){
      const left=(index%layout.columns)*layout.cellWidth,top=Math.floor(index/layout.columns)*layout.cellHeight;
      const pixels=[];
      for(let y=0;y<projectHeight;y++){
        const row=[];
        for(let x=0;x<projectWidth;x++){
          const sx=left+Math.floor(x*layout.cellWidth/projectWidth), sy=top+Math.floor(y*layout.cellHeight/projectHeight);
          const off=(sy*width+sx)*4;
          row.push(data[off+3]<128?null:`#${[data[off],data[off+1],data[off+2]].map(c=>c.toString(16).padStart(2,"0")).join("")}`);
        }
        pixels.push(row);
      }
      frames.push(shiftFramePixels(pixels,options.offsetX??0,options.offsetY??0));
    }
    return frames;
  }
  function normalizeSpriteAssets(assets, frameCount) {
    return (Array.isArray(assets)?assets:[]).slice(0,32).map((asset,index)=>({
      id:String(asset?.id||`sheet-${index+1}`).replace(/[^a-z0-9_-]/gi,"-").slice(0,48),
      name:cleanName(asset?.name,`Sprites ${index+1}`),
      frames:(Array.isArray(asset?.frames)?asset.frames:[]).filter(n=>Number.isInteger(n)&&n>=0&&n<frameCount).slice(0,MAX_SHEET_CELLS),
      columns:clamp(asset?.columns||1,1,32),rows:clamp(asset?.rows||1,1,32)
    })).filter(asset=>asset.frames.length);
  }
  function remapSpriteAssets(playMode, convert) {
    if(!Array.isArray(playMode?.spriteAssets))return;
    playMode.spriteAssets=playMode.spriteAssets.map(asset=>({
      ...asset,frames:(asset.frames||[]).map(frame=>convert(frame)).filter(frame=>Number.isInteger(frame)&&frame>=0)
    })).filter(asset=>asset.frames.length);
  }
  function animationAssignment(frames, columns, rows, options = {}) {
    if(!frames?.length)throw new Error("Select an imported sprite set.");
    const clip=values=>values.join(",");
    const boundedRow=value=>Number.isInteger(Number(value))?clamp(value,0,Math.max(0,rows-1)):0;
    const row=r=>frames.slice(r*columns,Math.min((r+1)*columns,frames.length));
    const idleFrames=row(boundedRow(options.idleRow));
    const runFrames=row(boundedRow(options.runRow));
    const idleFrame=idleFrames[0]??frames[0];
    const idleClip=clip(idleFrames);
    const runClip=clip(runFrames);
    const out={idleFrame,walkFrame:runFrames[Math.min(1,runFrames.length-1)]??frames[0],jumpFrame:idleFrame,idleClip,runClip};
    if(rows>=4){
      const mapping=options.directionRows||{};
      for(const [direction,defaultRow] of Object.entries({down:0,left:1,right:2,up:3})){
        const framesForDirection=row(boundedRow(mapping[direction]??defaultRow));
        out[direction+"Clip"]=clip(framesForDirection);
        out[direction+"IdleClip"]=clip(framesForDirection.slice(0,1));
        out[direction+"RunClip"]=clip(framesForDirection);
      }
    }
    if(options.idleTicks!==undefined)out.idleClipTicks=clamp(options.idleTicks,2,60);
    if(options.runTicks!==undefined)out.runClipTicks=clamp(options.runTicks,2,60);
    return out;
  }
  return {MAX_FILE_BYTES,MAX_VOXELS,MAX_WORLD_BLOCKS,checkedVoxelData,parseVox,asAsset,asWorld,imageSignature,sheetLayout,extractSheet,shiftFramePixels,normalizeSpriteAssets,remapSpriteAssets,animationAssignment,cleanName};
});
