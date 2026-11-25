self.onmessage = event => {
  const data = event.data || {};
  const id = data.id;
  try {
    const positions = data.positions instanceof Int32Array ? data.positions : new Int32Array(data.positions || 0);
    const colorIndices = data.colorIndices instanceof Uint32Array ? data.colorIndices : new Uint32Array(data.colorIndices || 0);
    const materialIndices = data.materialIndices instanceof Uint32Array ? data.materialIndices : new Uint32Array(data.materialIndices || 0);
    const partIndices = data.partIndices instanceof Uint32Array ? data.partIndices : new Uint32Array(data.partIndices || 0);
    const boneIndices = data.boneIndices instanceof Uint32Array ? data.boneIndices : new Uint32Array(data.boneIndices || 0);
    const count = colorIndices.length;
    if (positions.length !== count * 3 || materialIndices.length !== count || partIndices.length !== count || boneIndices.length !== count) throw new Error("Voxel mesh data is incomplete.");
    const colors = Array.isArray(data.colors) ? data.colors : [];
    const materials = Array.isArray(data.materials) ? data.materials : [];
    const parts = Array.isArray(data.parts) ? data.parts : [];
    const bones = Array.isArray(data.bones) ? data.bones : [];
    const occupied = new Map();
    for (let index = 0; index < count; index++) occupied.set(`${positions[index * 3]},${positions[index * 3 + 1]},${positions[index * 3 + 2]}`, index);
    const faces = [
      ["top", 0, 1, 0],
      ["bottom", 0, -1, 0],
      ["front", 0, 0, 1],
      ["back", 0, 0, -1],
      ["right", 1, 0, 0],
      ["left", -1, 0, 0]
    ];
    const groups = new Map();
    const cellFor = (faceName, x, y, z) => {
      if (faceName === "top") return { plane: y + 1, u: x, v: z };
      if (faceName === "bottom") return { plane: y, u: x, v: z };
      if (faceName === "front") return { plane: z + 1, u: x, v: y };
      if (faceName === "back") return { plane: z, u: x, v: y };
      if (faceName === "right") return { plane: x + 1, u: z, v: y };
      return { plane: x, u: z, v: y };
    };
    for (let index = 0; index < count; index++) {
      const x = positions[index * 3];
      const y = positions[index * 3 + 1];
      const z = positions[index * 3 + 2];
      for (const [faceName, dx, dy, dz] of faces) {
        const neighbor = occupied.get(`${x + dx},${y + dy},${z + dz}`);
        const sameRig = neighbor !== undefined && partIndices[neighbor] === partIndices[index] && boneIndices[neighbor] === boneIndices[index];
        if (neighbor !== undefined && (data.deformationMode === "smooth" || sameRig)) continue;
        const cell = cellFor(faceName, x, y, z);
        const color = colors[colorIndices[index]] || "#000000";
        const material = materials[materialIndices[index]] || "matte";
        const partId = parts[partIndices[index]] || "part-root";
        const boneId = bones[boneIndices[index]] || "";
        const key = `${faceName}|${cell.plane}|${color}|${material}|${partId}|${boneId}`;
        if (!groups.has(key)) groups.set(key, { faceName, plane: cell.plane, color, material, partId, boneId, cells: new Set() });
        groups.get(key).cells.add(`${cell.u},${cell.v}`);
      }
    }
    const quads = [];
    groups.forEach(group => {
      const cells = Array.from(group.cells, key => key.split(",").map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const remaining = new Set(group.cells);
      for (const [u, v] of cells) {
        if (!remaining.has(`${u},${v}`)) continue;
        let width = 1;
        while (remaining.has(`${u + width},${v}`)) width++;
        let height = 1;
        while (true) {
          let complete = true;
          for (let offset = 0; offset < width; offset++) {
            if (!remaining.has(`${u + offset},${v + height}`)) {
              complete = false;
              break;
            }
          }
          if (!complete) break;
          height++;
        }
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) remaining.delete(`${u + column},${v + row}`);
        quads.push({ faceName: group.faceName, plane: group.plane, u, v, width, height, color: group.color, material: group.material, partId: group.partId, boneId: group.boneId });
      }
    });
    self.postMessage({ id, ok: true, quads });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || "Voxel mesh generation failed.").slice(0, 300) });
  }
};
