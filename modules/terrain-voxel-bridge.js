(() => {
  "use strict";
  function apply(cubes, { getModel, getMap, setCube, begin, commit, sync, enter, render, abort }) {
    if (!Array.isArray(cubes) || !cubes.length) return 0;
    const model = getModel(), map = getMap();
    const incoming = cubes.filter(cube => cube.x >= 0 && cube.y >= 0 && cube.z >= 0 && cube.x < model.width && cube.y < model.height && cube.z < model.depth && !map.has(`${cube.x},${cube.y},${cube.z}`));
    if (!incoming.length) return 0;
    begin();
    let count = 0;
    for (const cube of incoming) if (setCube(cube.x, cube.y, cube.z, cube.color)) count++;
    if (count) { commit(); sync(); enter(); render(); }
    else abort();
    return count;
  }
  const api = Object.freeze({ apply });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainBridge = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
