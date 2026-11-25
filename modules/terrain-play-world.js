"use strict";

(function attachTerrainPlayWorld(root, factory) {
  const heights = typeof module === "object" && module.exports ? require("./terrain-heightmap.js") : root?.PixelBugTerrainHeightmap;
  const voxel = typeof module === "object" && module.exports ? require("./play-voxel-world.js") : root?.PixelBugPlayVoxelWorld;
  const api = Object.freeze(factory(heights, voxel));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugTerrainPlayWorld = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTerrainPlayWorld(Heights, Voxel) {
  function convert(columns, dimensions, settings = {}) {
    if (!Heights?.columnHeight || !Voxel?.normalize || !Array.isArray(columns)) return null;
    const width = Math.max(4, Math.min(48, Math.floor(Number(dimensions?.width) || 16)));
    const depth = Math.max(4, Math.min(48, Math.floor(Number(dimensions?.depth) || 16)));
    const height = Math.max(2, Math.min(24, Math.floor(Number(dimensions?.height) || 12)));
    const surface = [];
    const elevations = columns.slice(0, width * depth).map((column, index) => column
      ? Heights.columnHeight(column, index % width, Math.floor(index / width), width, depth, settings, height)
      : 0);
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const index = z * width + x;
      const column = columns[index];
      if (!column) continue;
      const elevation = elevations[index];
      const weight = Heights.shapedWeight(column.weight, x, z, width, depth, settings);
      const slope = Heights.columnSlope(elevations, x, z, width, depth);
      surface.push({ x, z, elevation, column, weight, slope });
    }
    if (!surface.length) return null;
    const blocks = [];
    for (let layer = 0; layer < height && blocks.length < Voxel.MAX_BLOCKS && (settings.solid !== false || layer === 0); layer++) {
      for (const cell of surface) {
        if (blocks.length >= Voxel.MAX_BLOCKS) break;
        const y = cell.elevation - 1 - layer;
        if (y < 0) continue;
        const color = Heights.voxelColor(cell.column, cell.weight, cell.slope, settings,
          cell.x, cell.z, y, cell.elevation, width, depth);
        blocks.push({ x: cell.x, y, z: cell.z, color });
      }
    }
    const centerX = (width - 1) / 2, centerZ = (depth - 1) / 2;
    const spawn = surface.reduce((best, cell) => {
      const distance = (cell.x - centerX) ** 2 + (cell.z - centerZ) ** 2;
      return !best || distance < best.distance ? { ...cell, distance } : best;
    }, null);
    const world = Voxel.normalize({ width, depth, height, cameraTilt: .5, cellSize: 38,
      blocks, markers: [], start: { x: spawn.x + .5, y: spawn.elevation, z: spawn.z + .5 } });
    return { world, columns: surface.length, blocks: world.blocks.length,
      surfaceOnly: settings.solid === false,
      limited: settings.solid !== false && blocks.length < surface.reduce((total, cell) => total + cell.elevation, 0) };
  }
  return { convert };
});
