"use strict";

(function attachPlayVoxelEditor(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayVoxelEditor() {
  function validCell(world, cell) {
    return !!world && !!cell && Number.isInteger(cell.x) && Number.isInteger(cell.y) &&
      Number.isInteger(cell.z) && cell.x >= 0 && cell.x < world.width &&
      cell.y >= 0 && cell.y < world.height && cell.z >= 0 && cell.z < world.depth;
  }
  function addMarker(world, cell, details = {}) {
    if (!validCell(world, cell)) return { error: "Select a valid world cell." };
    const kind = details.kind === "npc" ? "npc" : "trigger";
    const characterId = String(details.characterId || "").slice(0, 48);
    if (kind === "npc" && !characterId) return { error: "Choose an NPC from Character Manager first." };
    const name = String(details.name || "marker").trim().slice(0, 32);
    const base = name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "marker";
    world.markers ||= [];
    const remaining = world.markers.filter(m => !(m.x === cell.x && m.y === cell.y && m.z === cell.z));
    if (remaining.length >= 128) return { error: "World marker limit reached (128)." };
    let id = base, suffix = 2;
    while (remaining.some(item => item.id === id)) id = `${base}-${suffix++}`;
    const marker = { id, kind, x: cell.x, y: cell.y, z: cell.z, name: name || id,
      triggerId: id, characterId: kind === "npc" ? characterId : "" };
    world.markers = [...remaining, marker];
    return { marker };
  }
  function removeMarker(world, cell) {
    if (!validCell(world, cell)) return false;
    const count = world.markers?.length || 0;
    world.markers = (world.markers || []).filter(m => !(m.x === cell.x && m.y === cell.y && m.z === cell.z));
    return count !== world.markers.length;
  }
  function setSpawn(world, cell) {
    if (!validCell(world, cell)) return null;
    const support = (world.blocks || []).reduce((max, b) => b.x === cell.x && b.z === cell.z ? Math.max(max, b.y + 1) : max, 0);
    world.start = { x: cell.x + .5, y: Math.min(support, world.height), z: cell.z + .5 };
    return world.start;
  }
  return { validCell, addMarker, removeMarker, setSpawn };
});
