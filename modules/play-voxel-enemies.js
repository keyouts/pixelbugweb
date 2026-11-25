"use strict";
(function attachPlayVoxelEnemies(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource:`(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelEnemies = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxelEnemies() {
  const memory = new WeakMap();
  const clamp = (v, lo, hi, fallback=lo) => Math.max(lo,Math.min(hi,Number.isFinite(Number(v)) ? Number(v) : fallback));
  const cellKey = (x,y,z) => `${x},${y},${z}`;
  function settings(marker = {}) {
    return {
      behavior:["patrol","chase","guard","wander","sentry"].includes(marker.componentBehavior) ? marker.componentBehavior : "sentry",
      range:clamp(marker.componentPatrolRange,0,24), speed:clamp(marker.componentPatrolSpeed,0,8),
      aggro:clamp(marker.componentAggroRange,1,24,5)
    };
  }
  function standing(world, occupied, x, y, z) {
    return x>=0 && z>=0 && x<world.width && z<world.depth && y>=0 && y+1<world.height &&
      !occupied.has(cellKey(x,y,z)) && !occupied.has(cellKey(x,y+1,z)) &&
      (y===0 || occupied.has(cellKey(x,y-1,z)));
  }
  function route(world,start,goal,occupied,layer=0,maxNodes=1200) {
    const sx=Math.floor(start.x), sz=Math.floor(start.z);
    const sy=Math.floor(Number(start.y??layer));
    const gx=Math.floor(goal.x), gz=Math.floor(goal.z), gy=Math.floor(Number(goal.y??layer));
    const originY=[sy,sy-1,sy+1].find(y=>standing(world,occupied,sx,y,sz));
    if(originY==null)return [];
    const heights=[gy,gy-1,gy+1,gy-2,gy+2].filter((v,i,a)=>a.indexOf(v)===i);
    const targetY=heights.find(y=>standing(world,occupied,gx,y,gz));
    if(targetY==null)return [];
    const id=cellKey(sx,originY,sz),last=cellKey(gx,targetY,gz);
    if(id===last)return [{x:gx+.5,y:targetY,z:gz+.5}];
    const heuristic=(x,y,z)=>Math.abs(x-gx)+Math.abs(z-gz)+Math.abs(y-targetY)*1.25;
    const queue=[{x:sx,y:originY,z:sz,cost:0,score:heuristic(sx,originY,sz)}];
    const costs=new Map([[id,0]]),parents=new Map();let examined=0;
    while(queue.length && examined++<Math.max(1,Math.min(4000,maxNodes))) {
      queue.sort((a,b)=>a.score-b.score||a.cost-b.cost||a.y-b.y||a.z-b.z||a.x-b.x);
      const cur=queue.shift(),current=cellKey(cur.x,cur.y,cur.z);
      if(cur.cost!==costs.get(current))continue;
      if(current===last){
        const path=[];let key=last;
        while(key!==id && path.length<maxNodes) {
          const [x,y,z]=key.split(',').map(Number);path.push({x:x+.5,y,z:z+.5});
          key=parents.get(key);if(!key)return [];
        }
        return path.reverse();
      }
      for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]) {
        const x=cur.x+dx,z=cur.z+dz;
        for(const dy of [0,1,-1]) {
          const y=cur.y+dy,neighbor=cellKey(x,y,z);
          if(!standing(world,occupied,x,y,z))continue;
          if(dy>0 && occupied.has(cellKey(cur.x,cur.y+2,cur.z)))continue;
          const cost=cur.cost+1+(dy!==0?.3:0);
          if(cost>=(costs.get(neighbor)??Infinity))continue;
          costs.set(neighbor,cost);parents.set(neighbor,current);
          queue.push({x,y,z,cost,score:cost+heuristic(x,y,z)});
        }
      }
    }
    return [];
  }
  function position(world,marker,tick=0,actor=null,occupied=null) {
    const home={x:marker.x+.5,z:marker.z+.5,y:marker.y};
    if(marker.componentKind!=="enemy")return home;
    const cfg=settings(marker),now=Math.max(0,Math.floor(Number(tick)||0));
    if(cfg.behavior==="sentry"||!cfg.speed||!cfg.range||!occupied||!now)return home;
    let state=memory.get(marker);
    if(!state||now<state.tick||state.homeX!==home.x||state.homeZ!==home.z||state.homeY!==home.y){
      state={x:home.x,y:home.y,z:home.z,tick:0,homeX:home.x,homeY:home.y,homeZ:home.z,path:[],targetKey:"",nextPath:0};
      memory.set(marker,state);
    }
    if(now===state.tick)return {x:state.x,y:state.y,z:state.z};
    const actorX=Number(actor?.x),actorZ=Number(actor?.z),actorY=Number(actor?.y);
    const nearby=Number.isFinite(actorX)&&Number.isFinite(actorZ)&&
      Math.hypot(actorX-state.x,actorZ-state.z)<=cfg.aggro&&
      (!Number.isFinite(actorY)||Math.abs(actorY-state.y)<=cfg.aggro);
    let dest={x:home.x,z:home.z,y:home.y};
    if(cfg.behavior==="chase"||cfg.behavior==="guard") {
      if(nearby && Math.hypot(actorX-home.x,actorZ-home.z)<=cfg.range+cfg.aggro)
        dest={x:actorX,z:actorZ,y:Number.isFinite(actorY)?actorY:home.y};
      else if(cfg.behavior==="chase")dest={x:state.x,y:state.y,z:state.z};
    } else if(cfg.behavior==="patrol") {
      const phase=(now*cfg.speed/60)%(cfg.range*2);
      dest={x:home.x+cfg.range-Math.abs(phase-cfg.range),z:home.z,y:home.y};
    } else if(cfg.behavior==="wander") {
      const side=Math.floor(now/90)%4,radius=Math.max(1,cfg.range);
      dest={x:home.x+[radius,0,-radius,0][side],z:home.z+[0,radius,0,-radius][side],y:home.y};
    }
    const x=Math.max(0,Math.min(world.width-1,Math.floor(dest.x))),z=Math.max(0,Math.min(world.depth-1,Math.floor(dest.z)));
    const targetKey=cellKey(x,Math.floor(dest.y),z);
    if(targetKey!==state.targetKey||(now>=state.nextPath&&!state.path.length)) {
      state.path=route(world,{x:state.x,y:state.y,z:state.z},{x,y:dest.y,z},occupied,Math.floor(state.y));
      state.targetKey=targetKey;state.nextPath=now+15;
    }
    let remaining=cfg.speed*Math.min(8,now-state.tick)/60;
    while(remaining>0.00001 && state.path.length) {
      const point=state.path[0],dx=point.x-state.x,dz=point.z-state.z,dist=Math.hypot(dx,dz);
      if(point.y>state.y)state.y=point.y;
      if(dist<=remaining) {state.x=point.x;state.z=point.z;state.y=point.y;remaining-=dist;state.path.shift();}
      else {state.x+=dx/dist*remaining;state.z+=dz/dist*remaining;remaining=0;}
    }
    state.tick=now;
    return {x:state.x,y:state.y,z:state.z};
  }
  function reset(marker) {memory.delete(marker);}
  return {settings,standing,route,position,reset};
});
