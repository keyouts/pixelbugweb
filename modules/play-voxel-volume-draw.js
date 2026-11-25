"use strict";
// Volume rendering
(function attachVoxelVolumeDraw(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelVolumeDraw = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVoxelVolumeDraw() {
  function commands(world, actor, volume, rotate) {
    if (!actor || !volume?.voxelVolume || !Array.isArray(volume.cubes)) return [];
    return volume.cubes.slice(0,2600).filter(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&Number.isFinite(c.z)&&
      Number.isFinite(c.size)&&c.size>0&&c.size<=2 && /^#[0-9a-f]{6}$/i.test(c.color)).map(c => {
        const p=rotate(world,c.x,c.z);
        return {kind:"voxel-actor", cube:c, depth:p.x+p.z+.12,y:c.y};
      });
  }
  function draw(ctx, world, cube, offset, screen, polygon, shade, angle) {
    const s=cube.size, x=cube.x-s/2,y=cube.y,z=cube.z-s/2;
    const point=(dx,dy,dz)=>screen(world,x+dx*s,y+dy*s,z+dz*s,offset);
    const a=point(0,1,0),b=point(1,1,0),c=point(1,1,1),d=point(0,1,1);
    const e=point(0,0,0),f=point(1,0,0),g=point(1,0,1),h=point(0,0,1);
    const theta=angle(world), dx=Math.cos(theta)+Math.sin(theta),dz=Math.cos(theta)-Math.sin(theta);
    ctx.save();ctx.globalAlpha*=Math.max(.04,Math.min(1,cube.alpha??1));
    if (Math.abs(dx)>1e-6) {
      const near=dx>0;
// Rig motion
      polygon(ctx,near?[b,c,g,f]:[d,a,e,h],shade(cube.color,.76),null);
    }
    if (Math.abs(dz)>1e-6) polygon(ctx,dz>0?[d,c,g,h]:[a,b,f,e],shade(cube.color,.62),null);
    polygon(ctx,[a,b,c,d],shade(cube.color,1.14),null);
    ctx.restore();
  }
  return {commands,draw};
});
