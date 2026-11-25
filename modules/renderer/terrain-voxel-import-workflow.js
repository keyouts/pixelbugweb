(() => {
  "use strict";
  function run(terrainCubes, dimensions, host) {
    if (!Array.isArray(terrainCubes) || !terrainCubes.length) return 0;
    // Ground orientation
    const width = host.clampWidth(dimensions?.width,host.projectWidth());
    const height = host.clampWidth(dimensions?.depth,16);
    const depth = host.clampDepth(dimensions?.height,host.projectHeight());
    const terrain = terrainCubes.map(cube => host.toVoxelMode(cube,height)).filter(cube => Number.isInteger(cube.x)
      && Number.isInteger(cube.y) && Number.isInteger(cube.z) && cube.x >= 0 && cube.x < width
      && cube.y >= 0 && cube.y < height && cube.z >= 0 && cube.z < depth
      && /^#[0-9a-f]{6}$/i.test(cube.color));
    if (!terrain.length || terrain.length > host.maxCubes) return 0;
    const previous = host.getModel();
    const existing = host.getCount();
    if (existing && !host.confirm(`Replace the current Voxel Mode model (${existing.toLocaleString()} voxels) with ${terrain.length.toLocaleString()} landscape voxels?\n\nThe terrain will lie flat on the X/Z ground plane with its base at the bottom of the Voxel Mode model. This does not change Base Mode artwork. Cancel to keep the current model, or choose Merge from the transfer selector instead.`)) return 0;
    const canUndo = existing <= host.historyLimit && terrain.length <= host.historyLimit;
    const before = host.snapshot(canUndo);
    const origin = host.defaultOrigin(width,height,depth);
    const viewCanvases = host.defaultViews(width,height,depth,origin);
    const surfaces = new Map();
    for (const cube of terrain) {
      const key = `${cube.x},${cube.z}`;
      surfaces.set(key, Math.min(cube.y, surfaces.get(key) ?? height));
    }
    const surfaceLevels = [...surfaces.values()].sort((a,b)=>a-b);
    const surfaceSlice = surfaceLevels[Math.floor(surfaceLevels.length / 2)];
    if (viewCanvases[4]) viewCanvases[4] = {...viewCanvases[4], plane:"xz", slice:surfaceSlice};
    const parts = host.defaultParts(width,height,depth,origin);
    const armature = host.defaultArmature({},parts,width,height,depth,"part-root");
    const rootBoneId = armature.bones[0]?.id || "";
    const cubes = terrain.map(({x,y,z,color}) => ({x,y,z,color:color.toLowerCase(),material:"matte",partId:"part-root",boneId:rootBoneId}));
    // Top workspace
    const model = host.normalizeModel({
      ...host.defaultModel(32), width,height,depth,origin,viewCanvases,parts,armature,
      activePartId:"part-root",activePlane:"xz",activeViewCanvas:4,viewYaw:4,activeSlice:surfaceSlice,
      cameraPreset:6,cameraYaw:Math.PI/4,cameraPitch:-Math.PI/6,
      renderer:previous.renderer,projection:previous.projection,lightingPreset:previous.lightingPreset,
      groundPlane:true,cubes
    });
    host.storeModel(model);
    host.finish(before);
    host.enter();
    return cubes.length;
  }
  const api = Object.freeze({run});
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainVoxelImport = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
