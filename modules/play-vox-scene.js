"use strict";


(function attachPlayVoxScene(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxScene = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxScene() {
  const MAX_BYTES = 16 * 1024 * 1024, MAX_VOXELS = 24000, MAX_MODELS = 128, MAX_NODES = 2048;
  const identity = () => [[1,0,0],[0,1,0],[0,0,1]];
  const multiply = (a,b) => a.map(row=>b[0].map((_,j)=>row.reduce((n,v,i)=>n+v*b[i][j],0)));
  const vector = (m,v) => m.map(row=>row.reduce((n,value,i)=>n+value*v[i],0));
  const parseRotation = code => {
    const v=Number(code);
    if (!Number.isInteger(v)||v<0||v>255) throw new Error("Invalid VOX rotation code.");
    const i=v&3,j=(v>>2)&3,k=3-i-j;
    if(i>2||j>2||k<0||k>2||i===j)throw new Error("Invalid VOX rotation axis.");
    const m=[[0,0,0],[0,0,0],[0,0,0]];
    m[0][i]=(v&16)?-1:1;m[1][j]=(v&32)?-1:1;m[2][k]=(v&64)?-1:1;
    return m;
  };
  function parseVoxScene(input) {
    const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
    if(bytes.length>MAX_BYTES)throw new Error("VOX file exceeds 16 MB.");
    if(bytes.length<20||String.fromCharCode(...bytes.slice(0,4))!=="VOX ")throw new Error("Not a MagicaVoxel VOX file.");
    const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const u32=i=>dv.getUint32(i,true),i32=i=>dv.getInt32(i,true);
    if(u32(4)<150)throw new Error("Unsupported MagicaVoxel VOX version (requires 150 or newer).");
    const decode=typeof TextDecoder!=="undefined"?new TextDecoder("utf-8",{fatal:true}):null;
    const models=[],nodes=new Map();let pendingSize=null,palette=null,chunks=0;
    function readDictionary(p,end) {
      if(p+4>end)throw new Error("Truncated VOX attributes.");
      const count=i32(p);p+=4;
      if(count<0||count>128)throw new Error("VOX has too many attributes.");
      const out={};
      for(let j=0;j<count;j++) {
        const values=[];
        for(let part=0;part<2;part++){
          if(p+4>end)throw new Error("Truncated VOX string length.");
          const size=i32(p);p+=4;
          if(size<0||size>256||p+size>end)throw new Error("Invalid VOX attribute length.");
          values.push(decode?decode.decode(bytes.subarray(p,p+size)):String.fromCharCode(...bytes.subarray(p,p+size)));p+=size;
        }
        out[values[0]]=values[1];
      }
      return {out,p};
    }
    function inspect(start,end,depth=0){
      if(depth>12)throw new Error("VOX chunk nesting exceeds limit.");
      for(let p=start;p<end;){
        if(++chunks>50000||p+12>end)throw new Error("Malformed VOX chunk header.");
        const tag=String.fromCharCode(...bytes.subarray(p,p+4));
        const content=u32(p+4),children=u32(p+8),from=p+12;
        if(content>MAX_BYTES||children>MAX_BYTES||from+content+children>end)throw new Error("Malformed VOX chunk length.");
        const stop=from+content;
        if(tag==="SIZE"){
          if(content<12)throw new Error("Malformed VOX model size.");
          pendingSize=[u32(from),u32(from+4),u32(from+8)];
          if(!pendingSize.every(n=>n>0&&n<=256))throw new Error("VOX dimensions must be 1–256.");
        }else if(tag==="XYZI"){
          if(!pendingSize||content<4)throw new Error("VOX model is missing SIZE.");
          if(models.length>=MAX_MODELS)throw new Error("VOX has too many models.");
          const count=u32(from);
          if(count>MAX_VOXELS||4+count*4>content)throw new Error("VOX model is too large or malformed.");
          const cubes=[];
          for(let n=0;n<count;n++){
            const q=from+4+n*4;
            if(bytes[q]>=pendingSize[0]||bytes[q+1]>=pendingSize[1]||bytes[q+2]>=pendingSize[2])throw new Error("VOX cell exceeds model dimensions.");
            if(bytes[q+3])cubes.push([bytes[q],bytes[q+1],bytes[q+2],bytes[q+3]]);
          }
          models.push({size:pendingSize,cubes});pendingSize=null;
        }else if(tag==="RGBA"){
          if(content<1024)throw new Error("Malformed VOX palette.");
          palette=bytes.slice(from,from+1024);
        }else if(["nTRN","nGRP","nSHP"].includes(tag)){
          let q=from;
          if(q+4>stop)throw new Error("Malformed VOX scene node.");
          const id=i32(q);q+=4;
          if(id<0||nodes.has(id)||nodes.size>=MAX_NODES)throw new Error("Invalid or duplicate VOX node.");
          const attrs=readDictionary(q,stop);q=attrs.p;
          let node={id,type:tag,children:[],attrs:attrs.out};
          if(tag==="nTRN"){
            if(q+16>stop)throw new Error("Malformed VOX transform node.");
            node.children=[i32(q)];q+=12;const count=i32(q);q+=4;
            if(count<1||count>32)throw new Error("VOX transform has invalid frames.");
            for(let f=0;f<count;f++){
              const frame=readDictionary(q,stop);q=frame.p;
              if(f===0)node.frame=frame.out;
            }
          }else if(tag==="nGRP"){
            if(q+4>stop)throw new Error("Malformed VOX group node.");
            const count=i32(q);q+=4;
            if(count<0||count>MAX_NODES||q+count*4>stop)throw new Error("VOX group is too large.");
            node.children=Array.from({length:count},(_,i)=>i32(q+i*4));q+=count*4;
          }else{
            if(q+4>stop)throw new Error("Malformed VOX shape node.");
            const count=i32(q);q+=4;
            if(count<1||count>MAX_MODELS)throw new Error("VOX shape is too large.");
            node.modelIds=[];
            for(let n=0;n<count;n++){
              if(q+4>stop)throw new Error("Malformed VOX shape reference.");
              node.modelIds.push(i32(q));q=readDictionary(q+4,stop).p;
            }
          }
          if(q!==stop)throw new Error("Unexpected VOX scene node bytes.");
          nodes.set(id,node);
        }
        if(children)inspect(stop,stop+children,depth+1);
        p=stop+children;
      }
    }
    inspect(8,bytes.length);
    if(!models.length||!models.some(m=>m.cubes.length))throw new Error("VOX file contains no colored model cells.");
    const paletteColor=idx=>{
      const base=idx-1,levels=[255,204,153,102,51,0];
      const fallback=base<216?[levels[Math.floor(base/36)],levels[Math.floor(base/6)%6],levels[base%6]]:[Math.max(0,255-Math.floor((base-216)*255/40)),Math.max(0,255-Math.floor((base-216)*255/40)),Math.max(0,255-Math.floor((base-216)*255/40))];
      const rgb=palette?[palette[base*4],palette[base*4+1],palette[base*4+2]]:fallback;
      return "#"+rgb.map(n=>n.toString(16).padStart(2,"0")).join("");
    };
    const positions=[];let instances=0;
    function place(modelId,m,t){
      const model=models[modelId];
      if(!model)throw new Error("VOX scene references an absent model.");
      if(++instances>MAX_NODES)throw new Error("Too many VOX model instances.");
      for(const [x,y,z,color] of model.cubes){
        const v=vector(m,[x,y,z]);
        positions.push({x:v[0]+t[0],y:v[1]+t[1],z:v[2]+t[2],color:paletteColor(color)});
        if(positions.length>MAX_VOXELS)throw new Error(`VOX scene exceeds ${MAX_VOXELS.toLocaleString()} voxels after placing models.`);
      }
    }
    if(nodes.size){
      const referenced=new Set([...nodes.values()].flatMap(n=>n.children));
      const roots=[...nodes.keys()].filter(id=>!referenced.has(id));
      if(!roots.length)throw new Error("VOX scene graph has no root.");
      function visit(id,m,t,stack=new Set(),depth=0){
        if(depth>48||stack.has(id))throw new Error("VOX scene graph contains a cycle or excessive nesting.");
        const node=nodes.get(id);if(!node)throw new Error("VOX scene has a missing child node.");
        const chain=new Set(stack);chain.add(id);
        if(node.type==="nSHP"){
          for(const modelId of node.modelIds)place(modelId,m,t);
        }else{
          let nextM=m,nextT=t;
          if(node.type==="nTRN"){
            const offset=(node.frame?._t||"0 0 0").trim().split(/\s+/).map(Number);
            if(offset.length!==3||!offset.every(n=>Number.isInteger(n)&&Math.abs(n)<=8192))throw new Error("Invalid VOX translation.");
            const rotation=parseRotation(node.frame?._r??"4");
            nextT=vector(m,offset).map((value,i)=>value+t[i]);nextM=multiply(m,rotation);
          }
          for(const child of node.children)visit(child,nextM,nextT,chain,depth+1);
        }
      }
      for(const root of roots)visit(root,identity(),[0,0,0]);
    }else{
      let cursor=0;
      for(let i=0;i<models.length;i++){
        place(i,identity(),[cursor,0,0]);cursor+=models[i].size[0]+1;
      }
    }
    if(!positions.length)throw new Error("VOX scene contains no visible cells.");
    const min=[Math.min(...positions.map(p=>p.x)),Math.min(...positions.map(p=>p.y)),Math.min(...positions.map(p=>p.z))];
    const seen=new Map();
    // Axis mapping
    for(const p of positions){
      const x=p.x-min[0],y=p.z-min[2],z=p.y-min[1];
      seen.set(`${x}:${y}:${z}`,{x,y,z,color:p.color});
    }
    const cubes=[...seen.values()];
    const declared=models.length===1&&!nodes.size?models[0].size:null;
    const width=declared?declared[0]:Math.max(...cubes.map(p=>p.x))+1;
    const height=declared?declared[2]:Math.max(...cubes.map(p=>p.y))+1;
    const depth=declared?declared[1]:Math.max(...cubes.map(p=>p.z))+1;
    if([width,height,depth].some(n=>n>512))throw new Error("Combined VOX scene exceeds the 512-cell asset dimension limit.");
    return {name:"MagicaVoxel import",width,height,depth,cubes,source:"vox",modelCount:models.length,instanceCount:instances,multipleModels:models.length>1,missingPalette:!palette,sceneGraph:nodes.size>0};
  }
  return {parseVoxScene,parseRotation};
});
