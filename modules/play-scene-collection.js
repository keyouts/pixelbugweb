"use strict";
// Scene collection
(function attachPlaySceneCollection(root, factory) {
  const api=Object.freeze(factory());
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PixelBugPlaySceneCollection=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlaySceneCollection(){
  function add(pm,duplicate,generateId,snapshot){
    const scenes=pm.scenes;
    const current=scenes.find(scene=>scene.id===pm.activeSceneId);
    const name=`Scene ${scenes.length+1}`;
    const id=generateId(name);
    const source=duplicate&&current?current:snapshot({},id,name);
    const scene=snapshot(source,id,duplicate&&current?`${current.name} Copy`:name);
    scenes.push(scene);
    return scene;
  }
  function removeActive(pm){
    if(!Array.isArray(pm?.scenes)||pm.scenes.length<=1)return null;
    const index=pm.scenes.findIndex(scene=>scene.id===pm.activeSceneId);
    if(index<0)return null;
    pm.scenes.splice(index,1);
    const next=pm.scenes[Math.max(0,Math.min(index,pm.scenes.length-1))];
    for(const scene of pm.scenes)for(const prop of scene.props||[])
      if(prop.targetSceneId===pm.activeSceneId)prop.targetSceneId="";
    return next;
  }
  return {add,removeActive};
});
