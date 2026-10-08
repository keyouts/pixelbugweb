(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugVoxelWeighting = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp01 = value => Math.max(0, Math.min(Number(value) || 0, 1));
  const weightEntries = value => Array.isArray(value) ? value.map(item => Array.isArray(item) ? { boneId: String(item[0] || ""), weight: Number(item[1]) || 0 } : { boneId: String(item?.boneId || ""), weight: Number(item?.weight) || 0 }) : [];
  const manual = (value, validBoneIds = null, limit = 4) => {
    const allowed = validBoneIds && typeof validBoneIds.has === "function" ? validBoneIds : null;
    const combined = new Map();
    weightEntries(value).forEach(item => {
      if (!item.boneId || allowed && !allowed.has(item.boneId)) return;
      combined.set(item.boneId, clamp01((combined.get(item.boneId) || 0) + item.weight));
    });
    return Array.from(combined, ([boneId, weight]) => ({ boneId, weight })).sort((left, right) => right.weight - left.weight || left.boneId.localeCompare(right.boneId)).slice(0, Math.max(1, Math.round(Number(limit) || 4)));
  };
  const normalize = (value, validBoneIds = null, limit = 4) => {
    const items = manual(value, validBoneIds, limit).filter(item => item.weight > 0);
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    if (!(total > 0)) return [];
    const output = items.map(item => ({ boneId: item.boneId, weight: item.weight / total }));
    const roundedTotal = output.reduce((sum, item) => sum + item.weight, 0);
    if (output.length && Math.abs(1 - roundedTotal) > 1e-10) output[0].weight += 1 - roundedTotal;
    return output;
  };
  const equal = (left, right) => JSON.stringify(manual(left)) === JSON.stringify(manual(right));
  const paint = (current, boneId, targetWeight, strength, fallback = [], validBoneIds = null) => {
    const target = String(boneId || "");
    if (!target || validBoneIds && typeof validBoneIds.has === "function" && !validBoneIds.has(target)) return manual(current, validBoneIds);
    const currentWeights = manual(current, validBoneIds);
    const fallbackWeights = normalize(fallback, validBoneIds);
    const source = currentWeights.length ? currentWeights : fallbackWeights;
    const map = new Map(source.map(item => [item.boneId, item.weight]));
    const oldWeight = map.has(target) ? map.get(target) : fallbackWeights.find(item => item.boneId === target)?.weight || 0;
    const nextWeight = oldWeight + (clamp01(targetWeight) - oldWeight) * clamp01(strength);
    const others = Array.from(map.entries()).filter(([id, weight]) => id !== target && weight > 0);
    const otherTotal = others.reduce((sum, [, weight]) => sum + weight, 0);
    map.set(target, nextWeight);
    if (otherTotal > 0) others.forEach(([id, weight]) => map.set(id, weight / otherTotal * Math.max(0, 1 - nextWeight)));
    return manual(Array.from(map, ([id, weight]) => ({ boneId: id, weight })), validBoneIds);
  };
  const brush = (cubes, center, radius = 1) => {
    const size = Math.max(1, Math.min(Math.round(Number(radius) || 1), 8));
    const distance = Math.max(0.75, size - 0.15);
    return (Array.isArray(cubes) ? cubes : []).filter(cube => Math.hypot(Number(cube.x) - Number(center.x), Number(cube.y) - Number(center.y), Number(cube.z) - Number(center.z)) <= distance);
  };
  const brushCoords = (center, radius = 1) => { const size = Math.max(1, Math.min(Math.round(Number(radius) || 1), 8)); const limit = Math.max(0.75, size - 0.15); const output = []; for (let z = -size + 1; z < size; z++) for (let y = -size + 1; y < size; y++) for (let x = -size + 1; x < size; x++) if (Math.hypot(x, y, z) <= limit) output.push({ x: Math.round(center.x) + x, y: Math.round(center.y) + y, z: Math.round(center.z) + z }); return output; };
  const heatColor = value => { const weight = clamp01(value); const stops = weight < 0.5 ? [[34, 76, 180], [255, 210, 48], weight * 2] : [[255, 210, 48], [224, 52, 52], (weight - 0.5) * 2]; const channel = index => Math.round(stops[0][index] + (stops[1][index] - stops[0][index]) * stops[2]).toString(16).padStart(2, "0"); return `#${channel(0)}${channel(1)}${channel(2)}`; };
  const selectedWeight = (weights, boneId) => manual(weights).find(item => item.boneId === boneId)?.weight || 0;
  const average = (sets, validBoneIds = null, limit = 4) => normalize((Array.isArray(sets) ? sets : []).flatMap(set => normalize(set, validBoneIds, limit)), validBoneIds, limit);
  const manualAverage = (sets, validBoneIds = null, limit = 4) => {
    const source = Array.isArray(sets) ? sets.map(set => manual(set, validBoneIds, limit)).filter(set => set.length) : [];
    if (!source.length) return [];
    const sums = new Map();
    source.forEach(set => set.forEach(item => sums.set(item.boneId, (sums.get(item.boneId) || 0) + item.weight / source.length)));
    return manual(Array.from(sums, ([boneId, weight]) => ({ boneId, weight })), validBoneIds, limit);
  };
  const pointCells = value => { const numeric = Number(value) || 0; const rounded = Math.round(numeric); return Math.abs(numeric - rounded) < 1e-7 ? [rounded - 1, rounded] : [Math.floor(numeric)]; };
  const sharedPointWeights = (point, lookup, automatic = [], validBoneIds = null, limit = 4) => {
    if (typeof lookup !== "function") return [];
    const manualSets = [];
    let bound = false;
    pointCells(point?.z).forEach(z => pointCells(point?.y).forEach(y => pointCells(point?.x).forEach(x => {
      const cube = lookup(x, y, z);
      if (!cube) return;
      const painted = manual(cube.weights, validBoneIds, limit);
      if (painted.length) manualSets.push(painted);
      if (cube.boneId && (!validBoneIds || typeof validBoneIds.has !== "function" || validBoneIds.has(cube.boneId))) bound = true;
    })));
    if (manualSets.length) return manualAverage(manualSets, validBoneIds, limit);
    return bound ? normalize(automatic, validBoneIds, limit) : [];
  };
  const pointDistance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
  const blendRadius = (left, right = null) => { const first = Math.max(0.25, Number(left?.bindRadius) || 1.5); const second = Math.max(0.25, Number(right?.bindRadius) || first); return Math.max(0.5, (first + second) / 2); };
  const hierarchyDepth = (bone, parentById) => { let depth = 0; let current = bone; const seen = new Set(); while (current?.parentBoneId && !seen.has(current.id)) { seen.add(current.id); current = parentById(current.parentBoneId); depth++; } return depth; };
  const cubeCenter = cube => ({ x: Number(cube?.x) + Math.max(1, Number(cube?.w) || 1) / 2, y: Number(cube?.y) + Math.max(1, Number(cube?.h) || 1) / 2, z: Number(cube?.z) + Math.max(1, Number(cube?.d) || 1) / 2 });
  const blendPoint = (point, influences, transform) => {
    const entries = manual(influences, null, 8).filter(item => item.weight > 0);
    const total = entries.reduce((sum, item) => sum + item.weight, 0);
    if (!(total > 0)) return { ...point };
    const scale = total > 1 ? 1 / total : 1;
    const remainder = Math.max(0, 1 - total * scale);
    return entries.reduce((output, influence) => { const item = transform(point, influence.boneId); const weight = influence.weight * scale; output.x += item.x * weight; output.y += item.y * weight; output.z += item.z * weight; return output; }, { x: point.x * remainder, y: point.y * remainder, z: point.z * remainder });
  };
  const blendNormal = (normal, influences, transform) => { const output = blendPoint(normal, influences, transform); const length = Math.hypot(output.x, output.y, output.z) || 1; return { x: output.x / length, y: output.y / length, z: output.z / length }; };

  return { normalize, manual, equal, paint, brush, brushCoords, heatColor, selectedWeight, average, manualAverage, sharedPointWeights, pointDistance, blendRadius, hierarchyDepth, cubeCenter, blendPoint, blendNormal };
});
