"use strict";
(function attachPlaySpriteLayerPolicy(root,factory){
 const api=Object.freeze(factory());
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.PixelBugPlaySpriteLayerPolicy=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createLayerPolicy(){
 function selectLayers(frame,actorOnly,deps){
   const visible=(frame?.layers||[]).filter(layer=>layer?.visible!==false);
   if(!actorOnly)return visible;
   const actors=visible.filter(layer=>/(^|\b)(actor|player|sprite|character|hero)(\b|$)/i.test(deps.nameText(layer)));
   if(actors.some(deps.hasActorPixels))return actors;
   const sprites=visible.filter(layer=>!deps.isSceneArtLayer(layer));
   return sprites.some(deps.hasActorPixels)?sprites:visible;
 }
 return {selectLayers};
});
