"use strict";
// Obstacle navigation
(function attachPlayComponentNavigation(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource:`(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayComponentNavigation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayComponentNavigation() {
  function route(start, goal, options = {}) {
    const tile = 20;
    const width=Math.max(1,Math.min(20000,Number(options.width)||800));
    const height=Math.max(1,Math.min(4000,Number(options.height)||500));
    const minX=Math.max(0,Number(options.minX)||0),maxX=Math.min(width,Number(options.maxX)||width);
    const blocked=Array.isArray(options.obstacles) ? options.obstacles.slice(0,128) : [];
    const at=(p)=>({x:Math.floor(p.x/tile),y:Math.floor(p.y/tile)});
    const begin=at(start),end=at(goal),key=(x,y)=>`${x},${y}`;
    const available=(x,y)=>{
      const px=x*tile+tile/2,py=y*tile+tile/2;
      if(px<minX || px>maxX || py<0 || py>=height) return false;
      return !blocked.some(b=>px>Number(b.x)-8 && px<Number(b.x)+Number(b.w)+8 &&
        py>Number(b.y)-8 && py<Number(b.y)+Number(b.h)+8);
    };
    if(!available(begin.x,begin.y) || !available(end.x,end.y))return [];
    if(key(begin.x,begin.y)===key(end.x,end.y))return [goal];
    const queue=[{...begin,cost:0,score:Math.abs(end.x-begin.x)+Math.abs(end.y-begin.y)}];
    const costs=new Map([[key(begin.x,begin.y),0]]),parents=new Map();
    let examined=0;
    while(queue.length && examined++<1600){
      queue.sort((a,b)=>a.score-b.score||a.cost-b.cost||a.y-b.y||a.x-b.x);
      const node=queue.shift(),id=key(node.x,node.y);
      if(node.cost!==costs.get(id))continue;
      if(id===key(end.x,end.y)){
        const result=[];let trace=id;
        while(trace!==key(begin.x,begin.y)&&result.length<1600){
          const [x,y]=trace.split(',').map(Number);result.push({x:x*tile+tile/2,y:y*tile+tile/2});
          trace=parents.get(trace);if(!trace)return [];
        }
        return result.reverse();
      }
      for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
        const x=node.x+dx,y=node.y+dy,neighbor=key(x,y),cost=node.cost+1;
        if(!available(x,y)||cost>=(costs.get(neighbor)??Infinity))continue;
        costs.set(neighbor,cost);parents.set(neighbor,id);
        queue.push({x,y,cost,score:cost+Math.abs(end.x-x)+Math.abs(end.y-y)});
      }
    }
    return [];
  }
  return {route};
});
