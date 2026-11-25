"use strict";
// Animation timeline
(function attachPlayAnimationTimeline(root,factory){
  const api=Object.freeze(factory());
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PixelBugPlayAnimationTimeline=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlayAnimationTimeline(){
  const keys=["idleClip","runClip","leftClip","rightClip","upClip","downClip",
    "riseClip","fallClip","leftIdleClip","rightIdleClip","upIdleClip","downIdleClip",
    "leftRunClip","rightRunClip","upRunClip","downRunClip"];
  const label=key=>key.replace(/Clip$/,"").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,letter=>letter.toUpperCase());
  function reorder(source,from,to){
    const items=source.slice();
    if(from>=0&&from<items.length&&to>=0&&to<items.length){const [item]=items.splice(from,1);items.splice(to,0,item);}
    return items;
  }
  function mount(options){
    const root=options.root,doc=root?.ownerDocument;
    if(!root||!doc)return null;
    const pick=root.querySelector("#play-anim-timeline-clip"),strip=root.querySelector("#play-anim-strip");
    const preview=root.querySelector("#play-anim-preview-canvas"),status=root.querySelector("#play-anim-timeline-status");
    if(!pick||!strip||!preview)return null;
    for(const key of keys){const option=doc.createElement("option");option.value=key;option.textContent=label(key);pick.appendChild(option);}
    let selected=0,timer=null,playingIndex=0;
    const clip=()=>options.core.parseClip(options.mode()[pick.value]||"",options.frameCount());
    function drawFrame(index){
      const ctx=preview.getContext("2d");if(!ctx)return;
      ctx.clearRect(0,0,preview.width,preview.height);ctx.imageSmoothingEnabled=false;
      const image=options.frameCanvas(index);
      if(image&&image.width&&image.height){const fit=Math.min(preview.width/image.width,preview.height/image.height);
        const w=Math.max(1,Math.round(image.width*fit)),h=Math.max(1,Math.round(image.height*fit));
        ctx.drawImage(image,Math.floor((preview.width-w)/2),Math.floor((preview.height-h)/2),w,h);}
    }
    function stop(){if(timer!==null){clearInterval(timer);timer=null;}const button=root.querySelector("#play-anim-preview");if(button)button.textContent="▶ Preview";}
    function render(){
      if(!pick.value)pick.value="idleClip";
      const frames=clip();selected=Math.max(0,Math.min(selected,Math.max(0,frames.length-1)));
      strip.replaceChildren();
      for(const [position,index] of frames.entries()){
        const button=doc.createElement("button");button.type="button";
        button.className="play-timeline-frame";button.dataset.position=String(position);
        button.setAttribute("aria-label",`Select frame ${index+1}, timeline slot ${position+1}`);
        button.setAttribute("aria-pressed",String(selected===position));
        const canvas=doc.createElement("canvas");canvas.width=36;canvas.height=36;canvas.className="play-timeline-thumbnail";
        const ctx=canvas.getContext("2d");if(ctx){ctx.imageSmoothingEnabled=false;const image=options.frameCanvas(index);
          if(image?.width&&image?.height){const fit=Math.min(36/image.width,36/image.height);const w=Math.max(1,Math.round(image.width*fit)),h=Math.max(1,Math.round(image.height*fit));
            ctx.drawImage(image,Math.floor((36-w)/2),Math.floor((36-h)/2),w,h);}}
        const text=doc.createElement("span");text.textContent=String(index+1);
        button.append(canvas,text);button.onclick=()=>{selected=position;render();};strip.appendChild(button);
      }
      const frame=frames[selected]??options.activeFrame();drawFrame(frame);
      if(status)status.textContent=`${label(pick.value)} · ${frames.length} frame${frames.length===1?"":"s"} · ${frames.length?`selected ${selected+1}`:"add a frame to begin"}`;
    }
    function commit(frames){
      stop();options.history();options.mode()[pick.value]=options.core.parseClip(frames,options.frameCount()).join(",");
      const input=doc.querySelector(`[id="play-${pick.value.replace(/[A-Z]/g,ch=>`-${ch.toLowerCase()}`).replace(/-clip$/,'-clip')}"]`);
      if(input)input.value=options.mode()[pick.value];
      options.changed();render();
    }
    pick.onchange=()=>{stop();selected=0;render();};
    root.querySelector("#play-anim-append").onclick=()=>{const frames=clip();if(frames.length>=12)return;
      selected=frames.length;commit([...frames,options.activeFrame()]);};
    root.querySelector("#play-anim-remove").onclick=()=>{const frames=clip();if(!frames.length)return;frames.splice(selected,1);commit(frames);};
    root.querySelector("#play-anim-earlier").onclick=()=>{if(selected<=0)return;commit(reorder(clip(),selected,selected-1));selected--;render();};
    root.querySelector("#play-anim-later").onclick=()=>{const frames=clip();if(selected>=frames.length-1)return;commit(reorder(frames,selected,selected+1));selected++;render();};
    root.querySelector("#play-anim-preview").onclick=()=>{
      if(timer!==null){stop();return;}const frames=clip();if(!frames.length)return;
      const mode=options.mode(),hold=pick.value.includes("Run")||pick.value==="runClip"?mode.runClipTicks:
        pick.value==="riseClip"||pick.value==="fallClip"?mode.airClipTicks:mode.idleClipTicks;
      const period=Math.max(34,Math.round((Number(hold)||Number(mode.clipFrameTicks)||8)*1000/60));
      playingIndex=selected;root.querySelector("#play-anim-preview").textContent="■ Stop";
      timer=setInterval(()=>{if(!root.isConnected||root.offsetParent===null){stop();return;}
        playingIndex=(playingIndex+1)%frames.length;drawFrame(frames[playingIndex]);},period);
    };
    pick.value="idleClip";render();
    return {render,stop,clipKeys:keys};
  }
  return {mount,reorder,keys};
});
