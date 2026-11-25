"use strict";

(function attachPlayImportAssetPreview(root,factory){
 const api=Object.freeze(factory());
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.PixelBugPlayImportAssetPreview=api;
})(typeof globalThis!=="undefined"?globalThis:this,function createPreview(){
 function drawSpriteSheet(canvas,frames,asset,width,height,selected=0){
   const ctx=canvas?.getContext?.("2d");if(!ctx)return;
   ctx.clearRect(0,0,canvas.width,canvas.height);
   const indices=(asset?.frames||[]).slice(0,64);
   const cols=Math.min(8,Math.max(1,Number(asset?.columns)||4));
   const rows=Math.max(1,Math.ceil(indices.length/cols));
   const cellW=canvas.width/cols,cellH=canvas.height/rows;
   const sx=cellW/Math.max(1,width),sy=cellH/Math.max(1,height);
   for(let n=0;n<indices.length;n++){
     const frame=frames[indices[n]];if(!frame)continue;
     const left=n%cols*cellW,top=Math.floor(n/cols)*cellH;
     ctx.fillStyle=n===selected?"#1a4c67":"#303b45";
     ctx.fillRect(left,top,cellW,cellH);
     for(const layer of frame.layers||[]){
       for(let y=0;y<height;y++)for(let x=0;x<width;x++){
         const c=layer?.pixels?.[y]?.[x];
         if(typeof c!=="string"||!/^#[\da-f]{6}$/i.test(c))continue;
         ctx.fillStyle=c;ctx.fillRect(left+x*sx,top+y*sy,Math.ceil(sx),Math.ceil(sy));
       }
     }
     ctx.strokeStyle=n===selected?"#ffe080":"#667987";ctx.lineWidth=n===selected?2:1;
     ctx.strokeRect(left+1,top+1,cellW-2,cellH-2);
   }
   return {columns:cols,rows,count:indices.length};
 }
 function spriteIndexAt(canvas,asset,offsetX,offsetY){
   const count=(asset?.frames||[]).length;
   if(!count)return -1;
   const cols=Math.min(8,Math.max(1,Number(asset?.columns)||4));
   const rows=Math.ceil(count/cols);
   const column=Math.floor(offsetX/(canvas.width/cols)),row=Math.floor(offsetY/(canvas.height/rows));
   const index=row*cols+column;
   return column>=0&&column<cols&&row>=0&&row<rows&&index<count?index:-1;
 }
 return {drawSpriteSheet,spriteIndexAt};
});
