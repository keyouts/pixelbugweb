(() => {
  "use strict";
  const mod = (n,d) => ((n%d)+d)%d;
  function create(resolver,width,height,maxIndexed=65536) {
    if (width*height > maxIndexed) return null;
    const hits = Array(width*height);
    const shared = new Map(), placements = new Map();
    function add(map,key,index){
      let list=map.get(key);
      if(!list){list=[];map.set(key,list);}
      list.push(index);
    }
    for(let i=0;i<hits.length;i++){
      const hit=resolver.hit(i%width,Math.floor(i/width));
      hits[i]=hit;
      if(!hit)continue;
      const pixel=hit.py*hit.tile.w+hit.px;
      add(shared,`${hit.tile.id}|${pixel}`,i);
      if(hit.placementKey)add(placements,`${hit.placementKey}|${pixel}`,i);
    }
    function affected(stamps,maxDirty=Math.max(64,Math.floor(width*height*.4))) {
      const indices=new Set();
      for(const stamp of stamps){
        const {tileId,placementKey,individual,w,h,x,y,radius}=stamp;
        if(!w||!h)return null;
        const map=individual && placementKey ? placements : shared;
        const key=individual && placementKey ? placementKey : tileId;
        for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
          if(dx*dx+dy*dy>radius*radius)continue;
          const pixel=mod(y+dy,h)*w+mod(x+dx,w);
          for(const i of map.get(`${key}|${pixel}`)||[])indices.add(i);
          if(indices.size>maxDirty)return null;
        }
      }
      return indices;
    }
    return Object.freeze({hits,affected,width,height});
  }
  const api=Object.freeze({create});
  if(typeof globalThis!=="undefined")globalThis.PixelBugTerrainDirtyRegions=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
