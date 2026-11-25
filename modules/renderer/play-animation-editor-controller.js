"use strict";
// Animation editor
(function attachPlayAnimationEditor(root, factory) {
  const api=Object.freeze(factory());
  if(typeof module === "object" && module.exports)module.exports=api;
  if(root)root.PixelBugPlayAnimationEditor=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlayAnimationEditor() {
  const CLIPS=Object.freeze(["riseClip","fallClip","leftIdleClip","rightIdleClip","upIdleClip","downIdleClip",
    "leftRunClip","rightRunClip","upRunClip","downRunClip"]);
  const HOLDS=Object.freeze(["idleClipTicks","runClipTicks","airClipTicks"]);
  const SELECTORS=Object.freeze({
    riseClip:"#play-rise-clip",fallClip:"#play-fall-clip",leftIdleClip:"#play-left-idle-clip",
    rightIdleClip:"#play-right-idle-clip",upIdleClip:"#play-up-idle-clip",downIdleClip:"#play-down-idle-clip",
    leftRunClip:"#play-left-run-clip",rightRunClip:"#play-right-run-clip",upRunClip:"#play-up-run-clip",
    downRunClip:"#play-down-run-clip",idleClipTicks:"#play-idle-clip-ticks",
    runClipTicks:"#play-run-clip-ticks",airClipTicks:"#play-air-clip-ticks"});
  function inputs(query) {return Object.fromEntries(Object.entries(SELECTORS).map(([key,selector])=>[key,query(selector)]));}
  function show(fields,mode) {
    for(const key of CLIPS)if(fields[key])fields[key].value=mode[key]||"";
    for(const key of HOLDS)if(fields[key])fields[key].value=String(mode[key]||mode.clipFrameTicks||8);
  }
  function normalize(mode,frameCount,core) {
    for(const key of CLIPS)mode[key]=core.parseClip(mode[key],frameCount).join(",");
    for(const key of HOLDS)mode[key]=Math.max(2,Math.min(Number(mode[key] ?? mode.clipFrameTicks)||8,60));
    return mode;
  }
  function bind(fields,options) {
    for(const key of CLIPS){
      const element=fields[key];if(!element)continue;
      element.onchange=()=>{
        options.history();const mode=options.mode();
        mode[key]=options.core.parseClip(element.value,options.frameCount()).join(",");
        element.value=mode[key];options.changed();
      };
    }
    for(const key of HOLDS){
      const element=fields[key];if(!element)continue;
      element.onchange=()=>{
        options.history();const mode=options.mode();
        mode[key]=Math.max(2,Math.min(Number(element.value)||8,60));
        element.value=String(mode[key]);options.changed();
      };
    }
  }
  return {CLIPS,HOLDS,SELECTORS,inputs,show,normalize,bind};
});
