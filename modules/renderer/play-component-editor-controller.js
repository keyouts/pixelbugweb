"use strict";
(function attachPlayComponentEditor(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayComponentEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayComponentEditor() {
  function place(pm, options = {}, pieces) {
    const kind = pieces.normalizeKind(options.kind);
    if (!kind) return { ok:false, message:"Choose a gameplay piece first." };
    const voxel = pm.worldType === "voxel3d", world = pm.voxelWorld;
    if (voxel && !options.selectedCell) return { ok:false, message:"Select a voxel cell before adding a gameplay trigger." };
    if (voxel && (world.markers || []).length >= 128) return { ok:false, message:"The voxel world has reached its 128-marker limit." };
    const nodes = pm.nodeEditor?.nodes || [];
    const taken = new Set([...(pm.props || []).map(prop => prop.nodeTriggerId),
      ...(world?.markers || []).map(marker => marker.triggerId || marker.id),
      ...nodes.filter(node => node.type === "eventTrigger").map(node => node.data?.trigger)]);
    let counter = 1;
    while (taken.has(`${kind}-${counter}`)) counter++;
    const spec = pieces.build(kind, { ...options, sceneId:pm.activeSceneId, trigger:`${kind}-${counter}`,
      existingIds:nodes.map(node => node.id) });
    if (nodes.length + spec.nodes.length > 100) return { ok:false, message:"The rule graph supports 100 nodes. Remove unused rules before placing this component." };
    if (options.dryRun) return {ok:true, spec, voxel};
    pm.nodeEditor.nodes.push(...spec.nodes);
    if (kind === "enemy" && !Object.hasOwn(pm.variables, "health")) pm.variables.health = "3";
    if (voxel) {
      world.markers.push({ ...spec.marker, ...options.selectedCell,
        componentBehavior:kind === "enemy" ? (options.behavior || "sentry") : "sentry",
        componentPatrolRange:kind === "enemy" ? Math.min(24,Math.max(0,Number(options.patrolRange)||0)/32) : 0,
        componentPatrolSpeed:kind === "enemy" ? Math.min(8,Math.max(0,Number(options.patrolSpeed)||0)/32) : 0,
        componentAggroRange:kind === "enemy" ? Math.min(24,Math.max(1,(Number(options.aggroRange)||160)/32)) : 5 });
    } else {
      pm.props.push({ ...spec.prop, frame:options.frame, x:options.x, y:options.y, scale:options.scale,
        voxelAssetId:"", voxelYaw:0, voxelPoseId:"", voxelInFront:false,
        dialogueCharacterId:"", targetSceneId:"", targetX:null, targetY:null, prefabId:"" });
    }
    return { ok:true, spec, voxel, selectedIndex:voxel ? -1 : pm.props.length - 1,
      message:`${pieces.LABELS[kind]} added with ${spec.nodes.length} editable rule nodes${voxel ? " and a voxel trigger marker" : ""}.` };
  }
  function inspect(pm, prop) {
    if (!prop?.componentKind) return null;
    const trigger = String(prop.nodeTriggerId || "");
    const rules = (pm.nodeEditor?.nodes || []).filter(node => String(node.id || "").startsWith(`piece-${trigger}-`));
    const score = rules.find(node => node.type === "actionChangeNumber" && node.data?.variable === "score");
    const damage = rules.find(node => node.type === "actionChangeNumber" && node.data?.variable === "health");
    return { kind:prop.componentKind, item:prop.componentItem || "key",
      score:score ? Number(score.data.amount) : 1,
      damage:damage ? Math.abs(Number(damage.data.amount)) : 1,
      patrolRange:prop.componentPatrolRange || 0, patrolSpeed:prop.componentPatrolSpeed || 0,
      bobHeight:prop.componentBobHeight || 0, altFrame:prop.componentAltFrame,
      behavior:prop.componentBehavior || "patrol", aggroRange:prop.componentAggroRange || 180,
      avoidObstacles:prop.componentAvoidObstacles === true, platformJump:prop.componentPlatformJump === true };
  }
  function update(pm, prop, settings, pieces) {
    if (!prop?.componentKind) return { ok:false, message:"Select a gameplay piece first." };
    if (settings.kind !== prop.componentKind) return { ok:false, message:"Piece type cannot change in place. Add another piece instead." };
    const trigger = String(prop.nodeTriggerId || "");
    const generated = (pm.nodeEditor?.nodes || []).filter(node => String(node.id || "").startsWith(`piece-${trigger}-`));
    if (!generated.some(node => node.type === "eventTrigger" && node.data?.trigger === trigger))
      return { ok:false, message:"Generated rule group was changed or deleted. Edit the rules manually to avoid overwriting custom logic." };
    const build = pieces.build(prop.componentKind, { ...settings, sceneId:pm.activeSceneId, trigger });
    for (const key of ["componentPatrolRange", "componentPatrolSpeed", "componentBobHeight", "componentAltFrame", "componentBehavior", "componentAggroRange", "componentAvoidObstacles","componentPlatformJump"]) prop[key] = build.prop[key];
    if (prop.componentKind === "collectible" || prop.componentKind === "door") {
      prop.componentItem = build.prop.componentItem;
      for (const node of generated) if ((node.type === "logicHasItem" || node.type === "actionAddItem") && node.data?.item)
        node.data.item = build.item;
    }
    for (const node of generated) {
      if (node.type !== "actionChangeNumber" || !node.data) continue;
      if (prop.componentKind === "collectible" && node.data.variable === "score") node.data.amount = Number(build.nodes.find(n => n.type === "actionChangeNumber")?.data?.amount || 0);
      if (prop.componentKind === "enemy" && node.data.variable === "health") node.data.amount = Number(build.nodes.find(n => n.type === "actionChangeNumber")?.data?.amount || -1);
    }
    return { ok:true, message:`${pieces.LABELS[prop.componentKind]} properties and generated rule values updated.` };
  }
  function inspectMarker(pm,marker) {
    if (!marker?.componentKind) return null;
    const proxy={...marker,nodeTriggerId:marker.triggerId || marker.id};
    return inspect(pm,proxy);
  }
  function updateMarker(pm,marker,options,pieces) {
    if (!marker?.componentKind) return {ok:false,message:"Choose a generated gameplay marker first."};
    const proxy={...marker,nodeTriggerId:marker.triggerId || marker.id};
    const result=update(pm,proxy,{...options,kind:marker.componentKind},pieces);
    if (!result.ok) return result;
    marker.componentItem=proxy.componentItem;
    if (marker.componentKind==="enemy") {
      marker.componentBehavior=proxy.componentBehavior;
      marker.componentPatrolRange=Math.max(0,Math.min(24,Number(options.patrolRange)||0));
      marker.componentPatrolSpeed=Math.max(0,Math.min(8,Number(options.patrolSpeed)||0));
      marker.componentAggroRange=Math.max(1,Math.min(24,Number(options.aggroRange)||5));
    }
    return result;
  }
  return { place, inspect, update, inspectMarker, updateMarker };
});
