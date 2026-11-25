"use strict";


(function attachPlayCustomAssetController(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayCustomAssetController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayCustomAssetController() {
  function mount(deps) {
    const $ = selector => document.querySelector(selector);
    const core=deps.core, library=globalThis.PixelBugPlayImportAssetLibrary;
    const previews=globalThis.PixelBugPlayImportAssetPreview;
    const inputVoxel=$("#play-import-voxel-file"),inputSheet=$("#play-import-sprite-file");
    const previewVoxel=$("#play-import-voxel-preview"),previewSheet=$("#play-import-sprite-preview");
    const voxelSummary=$("#play-import-voxel-status"),sheetSummary=$("#play-import-sprite-status");
    const spriteSelect=$("#play-import-sprite-library"),voxelSelect=$("#play-import-voxel-library");
    const sceneSelect=$("#play-import-target-scene"),spritePreview=$("#play-import-sprite-library-preview");
    let pendingVoxel=null,pendingSheet=null,voxelSerial=0,spriteSerial=0,chosenFrame=0;
    let sceneSelectionInitialized=false;
    function message(el,value){if(el)el.textContent=value;deps.status(value);}
    function requireStopped(){if(deps.isRunning())throw new Error("Stop the game before changing assets.");}
    function number(id,fallback=0){const n=Number($(id)?.value);return Number.isFinite(n)?Math.floor(n):fallback;}
    function previewCanvas(target,source){
      const ctx=target?.getContext("2d");if(!ctx)return;
      ctx.clearRect(0,0,target.width,target.height);ctx.imageSmoothingEnabled=false;
      if(!source)return;
      const scale=Math.min(target.width/source.width,target.height/source.height);
      const w=Math.max(1,Math.floor(source.width*scale)),h=Math.max(1,Math.floor(source.height*scale));
      ctx.drawImage(source,Math.floor((target.width-w)/2),Math.floor((target.height-h)/2),w,h);
    }
    function previewVoxelAsset(voxel){
      const canvas=deps.voxelAssets.createCanvas(core.asAsset(voxel,"preview","Preview"),number("#play-import-voxel-yaw"),document);
      previewCanvas(previewVoxel,canvas);
    }
    function activeSprite(){
      const id=spriteSelect?.value;
      return (deps.playMode().spriteAssets||[]).find(a=>a.id===id)||null;
    }
    function activeVoxel(){
      return (deps.playMode().voxelAssets||[]).find(a=>a.id===voxelSelect?.value)||null;
    }
    function drawSpriteLibrary(){
      const asset=activeSprite();
      previews.drawSpriteSheet(spritePreview,deps.frames(),asset,deps.projectWidth(),deps.projectHeight(),chosenFrame);
      const usage=asset?library.spriteUsage(deps.playMode(),asset):[];
      const target=$("#play-import-sprite-usage");
      if(target)target.textContent=asset?`${asset.frames.length} editable frames; used in ${usage.length} world(s): ${usage.map(x=>x.name).join(", ")||"none yet"}.`:"Choose a saved sprite set to preview its frames and scene usage.";
    }
    function drawVoxelLibrary(){
      const asset=activeVoxel(),usage=asset?library.voxelUsage(deps.playMode(),asset.id):[];
      const target=$("#play-import-voxel-usage");
      if(target)target.textContent=asset?`${asset.cubes.length.toLocaleString()} voxels; referenced in ${usage.length} world(s): ${usage.map(x=>x.name).join(", ")||"none yet"}. Available for placement in every world.`:"Reusable voxel objects are available in all scenes.";
    }
    function renderScenes(){
      if(!sceneSelect)return;
      const old=sceneSelect.value,pm=deps.playMode();
      sceneSelect.replaceChildren();sceneSelect.add(new Option("Every world", "all"));
      for(const scene of pm.scenes||[])sceneSelect.add(new Option(`${scene.name||scene.id} (${scene.worldType==="voxel3d"?"3D":"2D"})`,scene.id));
      sceneSelect.value=sceneSelectionInitialized&&["all",...(pm.scenes||[]).map(s=>s.id)].includes(old)?old:pm.activeSceneId;
      if(!sceneSelect.value)sceneSelect.value="all";
      sceneSelectionInitialized=true;
    }
    function renderLibrary(){
      if(spriteSelect){
        const old=spriteSelect.value;spriteSelect.replaceChildren();spriteSelect.add(new Option("Choose a saved sprite set",""));
        for(const asset of deps.playMode().spriteAssets||[])spriteSelect.add(new Option(`${asset.name} · ${asset.frames.length} frames`,asset.id));
        spriteSelect.value=(deps.playMode().spriteAssets||[]).some(a=>a.id===old)?old:"";
      }
      if(voxelSelect){
        const old=voxelSelect.value;voxelSelect.replaceChildren();voxelSelect.add(new Option("Choose a reusable voxel object",""));
        for(const asset of deps.playMode().voxelAssets||[])voxelSelect.add(new Option(`${asset.name} · ${asset.cubes.length} voxels`,asset.id));
        voxelSelect.value=(deps.playMode().voxelAssets||[]).some(a=>a.id===old)?old:"";
      }
      renderScenes();drawSpriteLibrary();drawVoxelLibrary();
    }
    async function readVoxel(){
      const file=inputVoxel?.files?.[0];if(!file)return;
      const serial=++voxelSerial;pendingVoxel=null;previewCanvas(previewVoxel,null);
      for(const id of ["#play-import-voxel-world","#play-import-voxel-object"])if($(id))$(id).disabled=true;
      if(voxelSummary)voxelSummary.textContent="Reading voxel models…";
      if(file.size>core.MAX_FILE_BYTES)throw new Error("File is larger than 16 MB.");
      if(!/\.(?:vox|json)$/i.test(file.name))throw new Error("Choose a .vox or PixelBug voxel .json file.");
      const data=/\.vox$/i.test(file.name)?core.parseVox(await file.arrayBuffer()):core.checkedVoxelData(JSON.parse(await file.text()));
      if(serial!==voxelSerial)return;
      pendingVoxel={...data,name:core.cleanName(file.name.replace(/\.(?:vox|json)$/i,""),data.name)};
      previewVoxelAsset(pendingVoxel);
      for(const id of ["#play-import-voxel-world","#play-import-voxel-object"])if($(id))$(id).disabled=false;
      const detail=pendingVoxel.source==="vox"?` · ${pendingVoxel.modelCount} model(s), ${pendingVoxel.instanceCount} scene instance(s)${pendingVoxel.sceneGraph?" with transforms":""}`:"";
      message(voxelSummary,`${pendingVoxel.width} × ${pendingVoxel.depth} × ${pendingVoxel.height} · ${pendingVoxel.cubes.length.toLocaleString()} voxels${detail}${pendingVoxel.missingPalette?" · fallback colors (no RGBA palette)":""}. Choose World or Object below.`);
    }
    async function readSheet(){
      const file=inputSheet?.files?.[0];if(!file)return;
      const serial=++spriteSerial;pendingSheet=null;previewCanvas(previewSheet,null);
      if($("#play-import-sprite-frames"))$("#play-import-sprite-frames").disabled=true;
      if(sheetSummary)sheetSummary.textContent="Reading and aligning sprite frames…";
      if(file.size>core.MAX_FILE_BYTES)throw new Error("Image is larger than 16 MB.");
      if(!/\.(?:png|jpg|jpeg|webp)$/i.test(file.name)||!["image/png","image/jpeg","image/webp",""].includes(file.type||""))throw new Error("Choose a PNG, JPEG, or WebP image (not SVG).");
      core.imageSignature(await file.slice(0,12).arrayBuffer());
      const url=URL.createObjectURL(file);
      try{
        const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Could not decode the sprite sheet."));image.src=url;});
        if(serial!==spriteSerial)return;
        const sheet=document.createElement("canvas");sheet.width=img.naturalWidth;sheet.height=img.naturalHeight;
        const layout=core.sheetLayout(sheet.width,sheet.height,number("#play-import-sprite-cols"),number("#play-import-sprite-rows"),deps.maxFrames,deps.frames().length);
        const ctx=sheet.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("Canvas is unavailable.");
        ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0);
        const pixels=core.extractSheet(ctx.getImageData(0,0,sheet.width,sheet.height),layout,deps.projectWidth(),deps.projectHeight(),{offsetX:number("#play-import-sprite-offset-x"),offsetY:number("#play-import-sprite-offset-y")});
        pendingSheet={name:core.cleanName(file.name.replace(/\.[^.]+$/,"")),layout,pixels,canvas:sheet};
        previewCanvas(previewSheet,sheet);
        if($("#play-import-sprite-frames"))$("#play-import-sprite-frames").disabled=false;
        message(sheetSummary,`${layout.count} editable ${layout.cellWidth} × ${layout.cellHeight} sprites → ${deps.projectWidth()} × ${deps.projectHeight()} Base frames; alignment (${number("#play-import-sprite-offset-x")}, ${number("#play-import-sprite-offset-y")}). Ready to import.`);
      }finally{URL.revokeObjectURL(url);}
    }
    function safe(action,target){try{const result=action();if(result?.catch)result.catch(error=>message(target,error.message||"Import failed."));}catch(error){message(target,error.message||"Import failed.");}}
    function saveVoxelAsObject(){
      requireStopped();if(!pendingVoxel)throw new Error("Choose a voxel file first.");
      if(deps.playMode().voxelAssets.length>=32)throw new Error("The reusable voxel library holds 32 objects.");
      const asset=deps.voxelAssets.normalizeAsset(core.asAsset(pendingVoxel,`custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,$("#play-import-asset-name")?.value||pendingVoxel.name));
      if(!asset.cubes.length||asset.cubes.length!==pendingVoxel.cubes.length)throw new Error("This voxel object cannot be stored without dropping cells.");
      deps.history();deps.playMode().voxelAssets.push(asset);deps.renderVoxelLibrary();deps.selectVoxel(asset.id);deps.save();
      renderLibrary();voxelSelect.value=asset.id;drawVoxelLibrary();
      message(voxelSummary,`Saved “${asset.name}” as a reusable voxel object for every world. Place or assign it from Voxel Assets.`);
    }
    function replaceWorld(){
      requireStopped();if(!pendingVoxel)throw new Error("Choose a voxel file first.");
      const world=deps.voxelWorld.normalize(core.asWorld(pendingVoxel));if(!world.blocks.length)throw new Error("Imported world has no solid blocks.");
      const old=deps.playMode().voxelWorld?.blocks?.length||0,markers=deps.playMode().voxelWorld?.markers?.length||0;
      if((old||markers)&&!window.confirm(`Replace the current scene's ${old} blocks and ${markers} markers with ${world.blocks.length} imported blocks? Undo can restore the previous world.`))return;
      deps.history();deps.playMode().worldType="voxel3d";deps.playMode().voxelWorld=world;
      deps.captureScene();deps.showPlay();deps.refresh();deps.save();
      message(voxelSummary,`Imported a playable ${world.width} × ${world.depth} × ${world.height} voxel world with ${world.blocks.length} solid blocks and safe spawn.`);
    }
    function importSheet(){
      requireStopped();if(!pendingSheet)throw new Error("Choose a sprite sheet first.");
      const {layout,pixels}=pendingSheet;
      core.sheetLayout(layout.width,layout.height,layout.columns,layout.rows,deps.maxFrames,deps.frames().length);
      const existing=deps.playMode().spriteAssets||[];if(existing.length>=32)throw new Error("The sprite library holds up to 32 imported sheets.");
      const first=deps.frames().length;
      const frames=pixels.map((pixelGrid,index)=>{
        const layer=deps.newLayer(deps.projectWidth(),"Imported sprite",deps.projectHeight());
        layer.pixels=pixelGrid;layer.sourcePixels=pixelGrid.map(row=>[...row]);
        return {duration:120,tag:`${pendingSheet.name} ${index+1}`.slice(0,32),layers:[layer]};
      });
      deps.history();deps.frames().push(...frames);
      const asset={id:`sheet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,name:pendingSheet.name,frames:frames.map((_,i)=>first+i),columns:layout.columns,rows:layout.rows};
      deps.playMode().spriteAssets=[...existing,asset];deps.refresh();deps.save();renderLibrary();spriteSelect.value=asset.id;chosenFrame=0;drawSpriteLibrary();
      message(sheetSummary,`Imported ${frames.length} editable Base frames (${first+1}–${first+frames.length}); saved set is shared across all worlds.`);
    }
    function selectedSprite(){const asset=activeSprite();if(!asset)throw new Error("Choose a saved sprite set first.");return asset;}
    function assignSprites(useObject=false){
      requireStopped();const asset=selectedSprite();
      if(useObject){const index=asset.frames[chosenFrame]??asset.frames[0];deps.setNextObjectFrame(index);message(sheetSummary,`Frame ${index+1} selected for the next object. Open Objects to place it.`);return;}
      renderScenes();
      const rows=asset.rows;
      const row=id=>Math.min(rows,Math.max(1,number(id,1)))-1;
      const values=core.animationAssignment(asset.frames,asset.columns,asset.rows,{
        idleRow:row("#play-import-idle-row"),runRow:row("#play-import-run-row"),
        directionRows:{down:row("#play-import-row-down"),left:row("#play-import-row-left"),right:row("#play-import-row-right"),up:row("#play-import-row-up")},
        idleTicks:number("#play-import-idle-ticks",8),runTicks:number("#play-import-run-ticks",8)
      });
      const target=sceneSelect?.value||deps.playMode().activeSceneId;
      deps.history();const changed=library.assignSpriteToScenes(deps.playMode(),target,values);
      if(target==="all"||target===deps.playMode().activeSceneId)deps.captureScene();
      deps.refresh();deps.save();drawSpriteLibrary();
      message(sheetSummary,`Assigned ${asset.name} to ${changed.length||1} world(s), with selected directional rows and frame timing.`);
    }
    function renameSprite(){
      requireStopped();const asset=selectedSprite();const name=library.sanitizeName($("#play-import-sprite-rename")?.value,asset.name);
      deps.history();asset.name=name;deps.save();renderLibrary();spriteSelect.value=asset.id;drawSpriteLibrary();
      message(sheetSummary,`Renamed reusable sprite set to “${name}”; all scene frame references are unchanged.`);
    }
    function renameVoxel(){
      requireStopped();const asset=activeVoxel();if(!asset)throw new Error("Choose a reusable voxel object first.");
      const name=library.sanitizeName($("#play-import-voxel-rename")?.value,asset.name);
      deps.history();asset.name=name;deps.renderVoxelLibrary();deps.save();renderLibrary();voxelSelect.value=asset.id;drawVoxelLibrary();
      message(voxelSummary,`Renamed voxel asset to “${name}”; all object references retain their existing asset ID.`);
    }
    function removeSpriteEntry(){
      requireStopped();const asset=selectedSprite();const count=library.spriteUsage(deps.playMode(),asset).length;
      deps.history();deps.playMode().spriteAssets=deps.playMode().spriteAssets.filter(a=>a.id!==asset.id);
      deps.save();renderLibrary();
      message(sheetSummary,`Removed “${asset.name}” from the library. Its Base frames and references in ${count} worlds were preserved.`);
    }
    inputVoxel?.addEventListener("change",()=>safe(readVoxel,voxelSummary));
    $("#play-import-voxel-yaw")?.addEventListener("change",()=>pendingVoxel&&safe(()=>previewVoxelAsset(pendingVoxel),voxelSummary));
    inputSheet?.addEventListener("change",()=>safe(readSheet,sheetSummary));
    for(const id of ["play-import-sprite-cols","play-import-sprite-rows","play-import-sprite-offset-x","play-import-sprite-offset-y"]){
      $("#"+id)?.addEventListener("input",()=>{if(inputSheet?.files?.length)safe(readSheet,sheetSummary);});
    }
    spriteSelect?.addEventListener("change",()=>{chosenFrame=0;drawSpriteLibrary();});
    voxelSelect?.addEventListener("change",drawVoxelLibrary);
    sceneSelect?.addEventListener("focus",renderScenes);
    spritePreview?.addEventListener("click",event=>{
      const asset=activeSprite();if(!asset)return;
      const rect=spritePreview.getBoundingClientRect();
      const x=(event.clientX-rect.left)*spritePreview.width/Math.max(1,rect.width),y=(event.clientY-rect.top)*spritePreview.height/Math.max(1,rect.height);
      const selected=previews.spriteIndexAt(spritePreview,asset,x,y);
      if(selected>=0){chosenFrame=selected;drawSpriteLibrary();message(sheetSummary,`Selected sprite frame ${asset.frames[selected]+1} for next object.`);}
    });
    $("#play-import-voxel-world")?.addEventListener("click",()=>safe(replaceWorld,voxelSummary));
    $("#play-import-voxel-object")?.addEventListener("click",()=>safe(saveVoxelAsObject,voxelSummary));
    $("#play-import-voxel-rename-button")?.addEventListener("click",()=>safe(renameVoxel,voxelSummary));
    $("#play-import-sprite-frames")?.addEventListener("click",()=>safe(importSheet,sheetSummary));
    $("#play-import-sprite-player")?.addEventListener("click",()=>safe(()=>assignSprites(false),sheetSummary));
    $("#play-import-sprite-object")?.addEventListener("click",()=>safe(()=>assignSprites(true),sheetSummary));
    $("#play-import-sprite-rename-button")?.addEventListener("click",()=>safe(renameSprite,sheetSummary));
    $("#play-import-sprite-remove")?.addEventListener("click",()=>safe(removeSpriteEntry,sheetSummary));
    renderLibrary();
    return Object.freeze({renderLibrary});
  }
  return {mount};
});
