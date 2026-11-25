(() => {
  "use strict";
  // Ground coordinates
  function toVoxelMode(cube, modelHeight) {
    const height = Math.round(Number(modelHeight));
    return { ...cube, x: cube.x, y: height - 1 - cube.z, z: cube.y };
  }
  function apply(cubes, { getModel, getMap, setCube, begin, commit, sync, enter, render, abort }) {
    if (!Array.isArray(cubes) || !cubes.length) return 0;
    const model = getModel(), map = getMap();
    const incoming = cubes.map(cube => toVoxelMode(cube, model.height)).filter(cube => cube.x >= 0 && cube.y >= 0 && cube.z >= 0 && cube.x < model.width && cube.y < model.height && cube.z < model.depth && !map.has(`${cube.x},${cube.y},${cube.z}`));
    if (!incoming.length) return 0;
    begin();
    let count = 0;
    for (const cube of incoming) if (setCube(cube.x, cube.y, cube.z, cube.color)) count++;
    if (count) { commit(); sync(); enter(); render(); }
    else abort();
    return count;
  }
  const api = Object.freeze({ apply, toVoxelMode });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
