"use strict";
(function attachPlayPlatformNavigation(root,factory){
  const api=Object.freeze({...factory(),standaloneSource:`(${factory.toString()})()`});
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PixelBugPlayPlatformNavigation=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlayPlatformNavigation(){
  const rect=(x,y,w,h)=>({x,y,w,h});
  const overlaps=(a,b)=>a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
  function tick(state,goalX,settings={},navigation={}) {
    const w=Math.max(2,Number(navigation.bodyW)||16),h=Math.max(2,Number(navigation.bodyH)||24);
    const floor=Math.max(4,Number(navigation.groundY)||Number(navigation.height)||360);
    const obstacles=Array.isArray(navigation.obstacles)?navigation.obstacles.slice(0,128):[];
    const speed=Math.max(0,Number(settings.speed)||0),gravity=780,jumpSpeed=380;
    const left=Math.max(0,Number(navigation.minX)||0),right=Math.max(left,Math.min(Number(navigation.maxX)||Infinity,Number(navigation.width)||Infinity)-w);
    const direction=Math.sign(goalX-state.x);
    state.facing=direction||state.facing||1;
    const body=()=>rect(state.x,state.y,w,h);
    const touching=box=>obstacles.some(o=>overlaps(box,o));
    const step=1/60;
    const foot=state.y+h;
    const groundedOnPlatform=obstacles.some(o=>Math.abs(foot-o.y)<1.5 && state.x+w>o.x && state.x<o.x+o.w);
    const grounded=Math.abs(foot-floor)<1.5||groundedOnPlatform;
    if(grounded && state.vy>=0){state.vy=0;state.grounded=true;}
    else state.grounded=false;
    if(direction && state.grounded && speed) {
      const ahead=obstacles.find(o=>{
        const gap=direction>0?o.x-(state.x+w):state.x-(o.x+o.w);
        const height=foot-o.y;
        return gap>=-1 && gap<=Math.max(18,speed*.35) && height>2 && height<jumpSpeed*jumpSpeed/(2*gravity)-7 &&
          o.y+o.h>state.y+3;
      });
      if(ahead){state.vy=-jumpSpeed;state.grounded=false;state.jumps=(state.jumps||0)+1;}
    }
    const dx=direction*Math.min(Math.abs(goalX-state.x),speed*step);
    const nextX=Math.max(left,Math.min(right,state.x+dx));
    if(!touching(rect(nextX,state.y,w,h)))state.x=nextX;
    else state.blocked=(state.blocked||0)+1;
    const previousY=state.y,previousFoot=previousY+h;
    state.vy+=gravity*step;
    let nextY=Math.min(floor-h,state.y+state.vy*step);
    if(state.vy>=0){
      const land=obstacles.filter(o=>state.x+w>o.x&&state.x<o.x+o.w && previousFoot<=o.y+1 && nextY+h>=o.y)
        .sort((a,b)=>a.y-b.y)[0];
      if(land){nextY=land.y-h;state.vy=0;state.grounded=true;}
      if(nextY===floor-h){state.vy=0;state.grounded=true;}
    }else if(touching(rect(state.x,nextY,w,h))){nextY=previousY;state.vy=0;}
    state.y=nextY;
    return state;
  }
  function create(x,y){return {x,y,vy:0,tick:0,facing:1,grounded:false,jumps:0,blocked:0};}
  return {create,tick};
});
