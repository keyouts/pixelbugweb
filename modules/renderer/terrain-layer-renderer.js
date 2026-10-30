(() => {
  "use strict";
  function draw(ctx, {width,height,tileWidth,tileHeight,values,opacity=0.55,contours=false,labels=false,base=0,peak=14}) {
    ctx.clearRect(0,0,width,height);
    if (!values?.length || !tileWidth || !tileHeight) return;
    const color = globalThis.PixelBugTerrainHeightmap.biomeColor;
    ctx.globalAlpha=opacity;
    for(let y=0;y<height;y++) for(let x=0;x<width;x++){
      const tx=x%tileWidth,ty=y%tileHeight,v=values[ty*tileWidth+tx];
      ctx.fillStyle=color(v);ctx.fillRect(x,y,1,1);
    }
    ctx.globalAlpha=1;
    if(contours){
      ctx.fillStyle='rgba(14,24,32,.8)';
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const a=values[(y%tileHeight)*tileWidth+x%tileWidth];
        const left=values[(y%tileHeight)*tileWidth+((x+tileWidth-1)%tileWidth)];
        const top=values[((y+tileHeight-1)%tileHeight)*tileWidth+x%tileWidth];
        if(Math.floor(a/32)!==Math.floor(left/32)||Math.floor(a/32)!==Math.floor(top/32))ctx.fillRect(x,y,1,1);
      }
    }
    if(labels){
      ctx.font='4px monospace';ctx.textBaseline='top';
      for(let y=2;y<height;y+=Math.max(8,tileHeight))for(let x=2;x<width;x+=Math.max(8,tileWidth)){
        const v=values[(y%tileHeight)*tileWidth+x%tileWidth];
        const n=Math.round(base+(peak-base)*v/255);
        ctx.fillStyle='rgba(0,0,0,.85)';ctx.fillRect(x-1,y-1,8,6);ctx.fillStyle='#ffffff';ctx.fillText(String(n),x,y);
      }
    }
  }
  const api=Object.freeze({draw});
  if(typeof globalThis!=='undefined')globalThis.PixelBugTerrainLayerRenderer=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
