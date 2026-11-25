"use strict";
// Marker inspector
(function attachPlayVoxelMarkerInspector(root,factory){
  const api=Object.freeze(factory());
  if(typeof module === "object" && module.exports)module.exports=api;
  if(root)root.PixelBugPlayVoxelMarkerInspector=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlayVoxelMarkerInspector(){
  const SELECTORS=Object.freeze({item:"#play-marker-item",score:"#play-marker-score",
    damage:"#play-marker-damage",behavior:"#play-marker-behavior",range:"#play-marker-range",
    speed:"#play-marker-speed",aggro:"#play-marker-aggro"});
  function inputs(query){return Object.fromEntries(Object.entries(SELECTORS).map(([key,id])=>[key,query(id)]));}
  function chosen(pm,cell,worldApi){return cell?worldApi.markerAt(pm.voxelWorld,cell):null;}
  function load(pm,cell,fields,controller,worldApi){
    const marker=chosen(pm,cell,worldApi),info=controller.inspectMarker(pm,marker);
    if(!info)return {ok:false,message:"Select a generated voxel gameplay marker first."};
    const values={item:info.item,score:info.score,damage:info.damage,
      behavior:marker.componentBehavior||"sentry",range:marker.componentPatrolRange||0,
      speed:marker.componentPatrolSpeed||0,aggro:marker.componentAggroRange||5};
    for(const [key,value] of Object.entries(values))if(fields[key])fields[key].value=String(value);
    return {ok:true,message:`${info.kind} · ${marker.triggerId||marker.id} · rule values editable`,info};
  }
  function read(fields){
    return {item:fields.item?.value||"key",score:fields.score?.value,damage:fields.damage?.value,
      behavior:fields.behavior?.value,patrolRange:fields.range?.value,
      patrolSpeed:fields.speed?.value,aggroRange:fields.aggro?.value};
  }
  function apply(pm,cell,fields,controller,worldApi,pieces){
    const marker=chosen(pm,cell,worldApi);
    if(!marker?.componentKind)return {ok:false,message:"Select a generated voxel gameplay marker first."};
    return controller.updateMarker(pm,marker,read(fields),pieces);
  }
  return {SELECTORS,inputs,chosen,load,read,apply};
});
