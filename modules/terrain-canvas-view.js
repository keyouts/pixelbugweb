(() => {
  "use strict";
  function create({tile,focus=false,projectWidth,projectHeight,layoutResolver}) {
    const focused=Boolean(focus && tile && tile.w>0 && tile.h>0);
    const width=focused ? tile.w : Math.max(1,Math.floor(projectWidth));
    const height=focused ? tile.h : Math.max(1,Math.floor(projectHeight));
    const hit=(x,y)=>{
      if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=width||y>=height)return null;
      return focused ? {tile,px:x,py:y,placementKey:null} : layoutResolver?.hit(x,y) || null;
    };
    return Object.freeze({width,height,focused,hit});
  }
  function fittedBox(width,height,tileWidth,tileHeight){
    const scale=Math.min(Math.max(1,width)/Math.max(1,tileWidth),Math.max(1,height)/Math.max(1,tileHeight));
    const w=tileWidth*scale,h=tileHeight*scale;
    return Object.freeze({x:(width-w)/2,y:(height-h)/2,width:w,height:h});
  }
  const api=Object.freeze({create,fittedBox});
  if(typeof globalThis!=="undefined")globalThis.PixelBugTerrainCanvasView=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
