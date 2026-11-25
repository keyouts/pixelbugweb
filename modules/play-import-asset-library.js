"use strict";

(function attachPlayImportAssetLibrary(root, factory) {
  const api=Object.freeze(factory());
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PixelBugPlayImportAssetLibrary=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createLibrary(){
  const frameFields=["idleFrame","walkFrame","jumpFrame","runFrame","riseFrame","fallFrame","backgroundFrame","sceneryFrame"];
  const clipFields=["idleClip","runClip","leftClip","rightClip","upClip","downClip","riseClip","fallClip","leftIdleClip","leftRunClip","rightIdleClip","rightRunClip","upIdleClip","upRunClip","downIdleClip","downRunClip"];
  const sanitizeName=(name,fallback="Asset")=>String(name||fallback).replace(/[<>\r\n]/g,"").trim().slice(0,48)||fallback;
  function framesUsed(scene){
    const set=new Set();
    for(const field of frameFields)if(Number.isInteger(scene?.[field])&&scene[field]>=0)set.add(scene[field]);
    for(const field of clipFields){
      const entries=typeof scene?.[field]==="string"?scene[field].split(","):[];
      for(const entry of entries){const text=entry.trim();if(/^\d+$/.test(text))set.add(Number(text));}
    }
    for(const prop of scene?.props||[])if(Number.isInteger(prop?.frame))set.add(prop.frame);
    for(const layer of scene?.visualLayers||[])if(Number.isInteger(layer?.frame)&&layer.frame>=0)set.add(layer.frame);
    return set;
  }
  function spriteUsage(playMode,asset){
    const assets=new Set(asset?.frames||[]);
    const refs=[];
    const scenes=Array.isArray(playMode?.scenes)?playMode.scenes:[];
    for(const scene of scenes){
      if([...framesUsed(scene)].some(frame=>assets.has(frame)))refs.push({id:scene.id,name:scene.name||scene.id});
    }

    if(!scenes.some(scene=>scene.id===playMode?.activeSceneId)
      && [...framesUsed(playMode)].some(frame=>assets.has(frame)))refs.push({id:playMode?.activeSceneId||"scene-main",name:"Active world"});
    return refs;
  }
  function voxelUsage(playMode,assetId){
    const out=[];const scenes=Array.isArray(playMode?.scenes)?playMode.scenes:[];
    for(const scene of scenes){
      if(scene.voxelActorAssetId===assetId||scene.voxelBackgroundAssetId===assetId
        ||(scene.props||[]).some(prop=>prop.voxelAssetId===assetId)
        ||(scene.voxelWorld?.markers||[]).some(marker=>marker.voxelAssetId===assetId))
        out.push({id:scene.id,name:scene.name||scene.id});
    }
    return out;
  }
  function assignSpriteToScenes(playMode,targetId,values){
    if(!playMode||!values||typeof values!=="object")throw new Error("Missing sprite assignment.");
    const scenes=Array.isArray(playMode.scenes)?playMode.scenes:[];
    const all=targetId==="all";
    const changed=[];
    for(const scene of scenes){
      if(!all&&scene.id!==targetId)continue;
      for(const [field,value] of Object.entries(values))if(clipFields.includes(field)||frameFields.includes(field)||["idleClipTicks","runClipTicks","clipFrameTicks"].includes(field))scene[field]=value;
      changed.push(scene.id);
    }

    if((all||targetId===playMode.activeSceneId)&&(!scenes.length||changed.includes(playMode.activeSceneId))){
      for(const [field,value] of Object.entries(values))if(clipFields.includes(field)||frameFields.includes(field)||["idleClipTicks","runClipTicks","clipFrameTicks"].includes(field))playMode[field]=value;
    }
    if(!changed.length&&!(targetId===playMode.activeSceneId&&!scenes.length))throw new Error("Choose an existing destination world.");
    return changed;
  }
  return {frameFields,clipFields,sanitizeName,framesUsed,spriteUsage,voxelUsage,assignSpriteToScenes};
});
