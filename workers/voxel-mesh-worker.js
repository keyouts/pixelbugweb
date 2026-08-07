self.onmessage = event => {
  const { id, cubes, deformationMode } = event.data || {};
  const source = Array.isArray(cubes) ? cubes : [];
  const occupied = new Map(source.map(cube => [`${cube.x},${cube.y},${cube.z}`, cube]));
  const faces = [
    ["top", 0, 1, 0],
    ["bottom", 0, -1, 0],
    ["front", 0, 0, 1],
    ["back", 0, 0, -1],
    ["right", 1, 0, 0],
    ["left", -1, 0, 0]
  ];
  const groups = new Map();
  const cellFor = (faceName, cube) => {
    if (faceName === "top") return { plane: cube.y + 1, u: cube.x, v: cube.z };
    if (faceName === "bottom") return { plane: cube.y, u: cube.x, v: cube.z };
    if (faceName === "front") return { plane: cube.z + 1, u: cube.x, v: cube.y };
    if (faceName === "back") return { plane: cube.z, u: cube.x, v: cube.y };
    if (faceName === "right") return { plane: cube.x + 1, u: cube.z, v: cube.y };
    return { plane: cube.x, u: cube.z, v: cube.y };
  };
  source.forEach(cube => {
    faces.forEach(([faceName, dx, dy, dz]) => {
      const neighbor = occupied.get(`${cube.x + dx},${cube.y + dy},${cube.z + dz}`);
      const sameRig = neighbor && (neighbor.partId || "part-root") === (cube.partId || "part-root") && (neighbor.boneId || "") === (cube.boneId || "");
      if (neighbor && (deformationMode === "smooth" || sameRig)) return;
      const cell = cellFor(faceName, cube);
      const material = cube.material || "matte";
      const partId = cube.partId || "part-root";
      const boneId = cube.boneId || "";
      const key = `${faceName}|${cell.plane}|${cube.color}|${material}|${partId}|${boneId}`;
      if (!groups.has(key)) groups.set(key, { faceName, plane: cell.plane, color: cube.color, material, partId, boneId, cells: new Set() });
      groups.get(key).cells.add(`${cell.u},${cell.v}`);
    });
  });
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
        for (let du = 0; du < width; du++) {
          if (!remaining.has(`${u + du},${v + height}`)) {
            complete = false;
            break;
          }
        }
        if (!complete) break;
        height++;
      }
      for (let dv = 0; dv < height; dv++) for (let du = 0; du < width; du++) remaining.delete(`${u + du},${v + dv}`);
      quads.push({ faceName: group.faceName, plane: group.plane, u, v, width, height, color: group.color, material: group.material, partId: group.partId, boneId: group.boneId });
    }
  });
  self.postMessage({ id, quads });
};
