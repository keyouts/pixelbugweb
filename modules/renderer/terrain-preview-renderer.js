(() => {
  "use strict";
  const Heightmap = globalThis.PixelBugTerrainHeightmap || (typeof require === "function" ? require("../terrain-heightmap.js") : null);
  const cache=new WeakMap();
  function shade(hex,amount){
    const rgb=/^#([0-9a-f]{6})$/i.exec(hex||"");
    if(!rgb)return "#79927c";
    const n=parseInt(rgb[1],16);
    return `rgb(${[n>>16,(n>>8)&255,n&255].map(v=>Math.max(0,Math.min(255,Math.round(v*amount)))).join(",")})`;
  }
  function buildGeometry({columns,width,height,depth,settings}){
    if(!columns?.length||!width||!height)return [];
    const step=Math.max(1,Math.ceil(Math.max(width,height)/65),
      Math.ceil(Math.sqrt(width*height*Math.min(depth,32)/50000)));
    const faces=[];
    const heights=columns.map((c,i)=>c?Heightmap.columnHeight(c,i%width,Math.floor(i/width),width,height,settings,depth):0);
    function add(points,color){faces.push({points,color});}
    function side(x,y,x2,y2,lower,top,faceName,c,weight,slope){
      if(settings.solid===false || top<=lower)return;
      const sideShade=faceName==="east"?.68:faceName==="west"?.77:faceName==="south"?.8:.7;
      let bandStart=Math.max(0,lower),previous=null;
      const flush=(z)=>{
        if(previous===null||z<=bandStart)return;
        let points;
        if(faceName==="east")points=[[x2,y,bandStart],[x2,y,z],[x2,y2,z],[x2,y2,bandStart]];
        if(faceName==="west")points=[[x,y2,bandStart],[x,y2,z],[x,y,z],[x,y,bandStart]];
        if(faceName==="south")points=[[x2,y2,bandStart],[x2,y2,z],[x,y2,z],[x,y2,bandStart]];
        if(faceName==="north")points=[[x,y,bandStart],[x,y,z],[x2,y,z],[x2,y,bandStart]];
        add(points,shade(previous,sideShade));
      };
      for(let z=bandStart;z<top;z++){
        const color=Heightmap.voxelColor(c,weight,slope,settings,x,y,z,top,width,height);
        if(previous!==null && color!==previous){flush(z);bandStart=z;}
        previous=color;
      }
      flush(top);
    }
    for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
      const i=y*width+x,c=columns[i];if(!c)continue;
      const x2=Math.min(width,x+step),y2=Math.min(height,y+step),top=heights[i];
      const weight=Heightmap.shapedWeight(c.weight,x,y,width,height,settings);
      const slope=Heightmap.columnSlope(heights,x,y,width,height);
      const topColor=Heightmap.voxelColor(c,weight,slope,settings,x,y,top-1,top,width,height);
      add([[x,y,top],[x2,y,top],[x2,y2,top],[x,y2,top]],shade(topColor,1.13));
      const east=x2===width?0:heights[y*width+x2]||0;
      const west=x===0?0:heights[y*width+x-1]||0;
      const south=y2===height?0:heights[y2*width+x]||0;
      const north=y===0?0:heights[(y-1)*width+x]||0;
      side(x,y,x2,y2,east,top,"east",c,weight,slope);
      side(x,y,x2,y2,west,top,"west",c,weight,slope);
      side(x,y,x2,y2,south,top,"south",c,weight,slope);
      side(x,y,x2,y2,north,top,"north",c,weight,slope);
    }
    return faces;
  }
  function geometryFor(params){
    const {columns,width,height,depth,settings}=params;
    if(!columns?.length)return [];
    const {base,peak,relief,solid,strata,colorMode,style,seed,detail,terraces,biomePalette}=settings;
    const signature=JSON.stringify({width,height,depth,base,peak,relief,solid,strata,colorMode,style,seed,detail,terraces,biomePalette});
    const saved=cache.get(columns);
    if(saved?.signature===signature)return saved.faces;
    const faces=buildGeometry(params);
    cache.set(columns,{signature,faces});
    return faces;
  }
  function render3d({canvas,columns,width,height,depth,settings,cameraAngle,cameraZoom,cameraTilt}){
    if(!canvas)return;
    const ctx=canvas.getContext("2d"),cw=canvas.width,ch=canvas.height;
    ctx.clearRect(0,0,cw,ch);ctx.fillStyle="#18232b";ctx.fillRect(0,0,cw,ch);
    if(!columns?.length)return;
    const ca=Math.cos(cameraAngle),sa=Math.sin(cameraAngle);
    const scale=Math.min(cw/(width+height),ch/(width+height+depth))*1.3*cameraZoom;
    const project=(x,y,z)=>({x:cw/2+((x-width/2)*ca-(y-height/2)*sa)*scale,
      y:ch*.64+(((x-width/2)*sa+(y-height/2)*ca)*cameraTilt-z)*scale});
    const faces=geometryFor({columns,width,height,depth,settings});
    const projected=faces.map(face=>({color:face.color,
      points:face.points.map(p=>project(...p)),
      order:face.points.reduce((n,p)=>n+(p[0]-width/2)*sa+(p[1]-height/2)*ca,0)/face.points.length}));
    projected.sort((a,b)=>a.order-b.order);
    for(const face of projected){
      ctx.beginPath();face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
    }
  }
  const api=Object.freeze({render3d,buildGeometry,geometryFor});
  if(typeof globalThis!=="undefined")globalThis.PixelBugTerrainPreviewRenderer=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})();
