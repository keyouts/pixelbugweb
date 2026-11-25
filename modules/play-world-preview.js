"use strict";
// Scene previews
(function attachPlayWorldPreview(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorldPreview = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayWorldPreview() {
  const safeColor = (v, fallback) => /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : fallback;
  const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,Number(v)||0));
  function actualScene(playMode,id) {
    const scene=(playMode?.scenes||[]).find(s=>s.id===id);
    if (!scene) return null;
    return id===playMode.activeSceneId ? { ...scene, ...playMode, id:scene.id, name:scene.name } : scene;
  }
  function render(canvas, scene, callbacks={}, rotation=0) {
    if (!canvas || !scene) return [];
    const ctx=canvas.getContext("2d"); if (!ctx) return [];
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const hotspots=[];
    if (scene.worldType!=="voxel3d") {
      ctx.fillStyle=safeColor(scene.backgroundColor||scene.skyColor,"#b9d9e8");ctx.fillRect(0,0,w,h);
      ctx.fillStyle="#9fca9f";ctx.fillRect(0,h*.76,w,h*.24);
      ctx.fillStyle="#618c72";ctx.fillRect(0,h*.76,w,2);
      const sw=Math.max(1,Number(scene.sceneWidth)||640),sh=Math.max(1,Number(scene.sceneHeight)||360);
      for (const [index,p] of (scene.props||[]).slice(0,120).entries()) {
        const x=clamp(Number(p.x)/sw*w,4,w-4),y=clamp(Number(p.y)/sh*h,4,h-4);
        const asset=callbacks.getFrameCanvas?.(Math.max(0,Number(p.frame)||0));
        const sz=Math.max(8,Math.min(21,8+(Number(p.scale)||1)*2));
        if (asset?.width) { ctx.imageSmoothingEnabled=false;ctx.drawImage(asset,x-sz/2,y-sz/2,sz,sz); }
        else {ctx.fillStyle=p.targetSceneId?"#e7a83a":"#415d9b";ctx.fillRect(x-sz/2,y-sz/2,sz,sz);}
        ctx.strokeStyle="#283946";ctx.lineWidth=1;ctx.strokeRect(x-sz/2,y-sz/2,sz,sz);
        hotspots.push({id:String(p.nodeTriggerId||`prop-${index+1}`),x:x/w,y:y/h,label:String(p.name||`Object ${index+1}`),kind:"sprite"});
      }
      const frame=callbacks.getFrameCanvas?.(Number(scene.idleFrame)||0);
      if (frame?.width) {ctx.imageSmoothingEnabled=false;ctx.drawImage(frame,7,h-35,27,27);}
      return hotspots;
    }
    const world=scene.voxelWorld||{},worldW=Math.max(4,Number(world.width)||16),worldD=Math.max(4,Number(world.depth)||16);
    ctx.fillStyle="#c5e4ee";ctx.fillRect(0,0,w,h);
    const rot=(Math.round(Number(rotation)||0)%4+4)%4;
    const angle=Math.PI/4+rot*Math.PI/2, c=Math.cos(angle),s=Math.sin(angle);
    const project=(x,y,z)=>{
      const cx=x-worldW/2,cz=z-worldD/2;
      const a=(cx*c-cz*s),b=(cx*s+cz*c);
      const scale=Math.min(w/(worldW+worldD+7)*1.45,h/(worldW+worldD+10)*1.95);
      return {x:w/2+a*scale,y:h*.58+b*scale*.48-y*scale*.78,size:Math.max(2,scale)};
    };
    const floor=[project(0,0,0),project(worldW,0,0),project(worldW,0,worldD),project(0,0,worldD)];
    ctx.beginPath();floor.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle="#79a98d";ctx.fill();ctx.strokeStyle="#4c7a64";ctx.stroke();
    const all=world.blocks||[];
    const step=Math.max(1,Math.ceil(all.length/700));
    const blocks=[];
    for(let i=0;i<all.length;i+=step) {
      const b=all[i];if (!b) continue;
      const p=project(Number(b.x)||0,Number(b.y)||0,Number(b.z)||0);
      blocks.push({p,b,order:p.y+(Number(b.y)||0)*.05});
    }
    blocks.sort((a,b)=>a.order-b.order);
    for(const {p,b} of blocks) {
      const sz=Math.max(2,p.size*.86);
      ctx.fillStyle=safeColor(b.color,"#658f7a");
      ctx.fillRect(p.x-sz*.5,p.y-sz*.75,sz,sz*.8);
      ctx.fillStyle="rgba(0,0,0,.16)";ctx.fillRect(p.x+sz*.17,p.y-sz*.6,sz*.3,sz*.62);
      ctx.fillStyle="rgba(255,255,255,.27)";ctx.fillRect(p.x-sz*.46,p.y-sz*.7,sz*.6,sz*.16);
    }
    for(const marker of (world.markers||[]).filter(m=>m.kind==="trigger").slice(0,128)) {
      const p=project((Number(marker.x)||0)+.5,(Number(marker.y)||0)+.5,(Number(marker.z)||0)+.5);
      ctx.fillStyle="#f6ad3d";ctx.strokeStyle="#4e3230";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();
      hotspots.push({id:String(marker.triggerId||marker.id),x:clamp(p.x/w,0,1),y:clamp(p.y/h,0,1),label:String(marker.name||marker.id),kind:"voxel"});
    }
    return hotspots;
  }
  return {render,actualScene};
});
