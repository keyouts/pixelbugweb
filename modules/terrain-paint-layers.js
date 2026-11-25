(() => {
  "use strict";
  const kinds=Object.freeze(["height","biome","material"]);
  const palettes=Object.freeze({biome:["#777777","#519a55","#c7a16a","#dce7f1","#4e9d8d"],material:["#777777","#778079","#bba36e","#9c7559","#d8dce0"]});
  function ensure(terrain,kind,tile){
    if(!palettes[kind] || !tile) return null;
    terrain.paintLayers ||= {}; terrain.paintLayers[kind] ||= {};
    const records=terrain.paintLayers[kind];
    const stored=Object.hasOwn(records,tile.id)?records[tile.id]:null;
    if(Array.isArray(stored)&&stored.length===tile.w*tile.h)return stored;
    const next=Array(tile.w*tile.h).fill(0);
    Object.defineProperty(records,tile.id,{value:next,writable:true,enumerable:true,configurable:true});
    return next;
  }
  function paint(values,w,h,x,y,radius,value){
    if(!values||values.length!==w*h)return false;
    let changed=false;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      if(dx*dx+dy*dy>radius*radius)continue;
      const px=((x+dx)%w+w)%w,py=((y+dy)%h+h)%h,i=py*w+px;
      if(values[i]!==value){values[i]=value;changed=true;}
    }
    return changed;
  }
  function placement(terrain,kind,tile,key){
    if(!key || !palettes[kind] || !tile)return ensure(terrain,kind,tile);
    terrain.placementPaintLayers ||= {};
    terrain.placementPaintLayers[kind] ||= {};
    const records=terrain.placementPaintLayers[kind];
    const stored=records[key];
    if(Array.isArray(stored) && stored.length===tile.w*tile.h)return stored;
    return (records[key]=ensure(terrain,kind,tile).slice());
  }
  function valueAt(terrain,kind,tile,key,index){
    const override=key && terrain.placementPaintLayers?.[kind]?.[key];
    if(Array.isArray(override) && override.length===tile.w*tile.h)return override[index] || 0;
    return terrain.paintLayers?.[kind]?.[tile.id]?.[index] || 0;
  }
  const api=Object.freeze({kinds,palettes,ensure,placement,valueAt,paint});
  if(typeof globalThis!=="undefined")globalThis.PixelBugTerrainPaintLayers=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
