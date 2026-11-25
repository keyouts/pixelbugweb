"use strict";
(function attachPlayComponentObstacles(root,factory){
  const api=Object.freeze({...factory(),standaloneSource:`(${factory.toString()})()`});
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PixelBugPlayComponentObstacles=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPlayComponentObstacles(){
  function context(props,active,dimensions,worldWidth,canvasHeight,groundY,open){
    if(!active?.componentAvoidObstacles)return {};
    const size=dimensions(active), obstacles=[];
    for(const prop of props||[]){
      if(prop===active||prop.solid===false||prop.componentKind||open(prop))continue;
      const metrics=dimensions(prop);
      obstacles.push({x:Number(prop.x)||0,y:Number(prop.y)||0,
        w:Math.max(1,Number(metrics?.w)||1),h:Math.max(1,Number(metrics?.h)||1)});
      if(obstacles.length>=128)break;
    }
    return {navigation:{width:worldWidth,height:canvasHeight,groundY,
      bodyW:Math.max(2,Number(size?.w)||16),bodyH:Math.max(2,Number(size?.h)||24),obstacles}};
  }
  return {context};
});
