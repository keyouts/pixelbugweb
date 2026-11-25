"use strict";

// Scene mapping
(function attachPlaySceneRuleMap(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlaySceneRuleMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaySceneRuleMap() {
  const text = value => String(value ?? "").trim();
  const validFrame = (index, frameCount) => Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < frameCount;
  function analyze(playMode = {}, frames = null) {
    const sources = Array.isArray(playMode.scenes) && playMode.scenes.length ? playMode.scenes : [{ ...playMode, id: playMode.activeSceneId || "scene-main", name: "Scene 1" }];
    const nodes = Array.isArray(playMode.nodeEditor?.nodes) ? playMode.nodeEditor.nodes : [];
    const frameCount = Number.isInteger(frames) && frames > 0 ? frames : null;
    const portalLinks = [];
    const scenes = sources.map(source => {
      const live = text(source.id) === text(playMode.activeSceneId);
      const scene = live ? { ...source, worldType: playMode.worldType ?? source.worldType, voxelWorld: playMode.voxelWorld ?? source.voxelWorld,
        props: playMode.props ?? source.props, dialogue: playMode.dialogue ?? source.dialogue,
        idleFrame: playMode.idleFrame ?? source.idleFrame, walkFrame: playMode.walkFrame ?? source.walkFrame,
        jumpFrame: playMode.jumpFrame ?? source.jumpFrame } : source;
      const mode = scene.worldType === "voxel3d" ? "voxel3d" : "sidescroller";
      const triggers = (mode === "voxel3d" ? scene.voxelWorld?.markers?.filter(marker => marker?.kind === "trigger").map(marker => ({ id: text(marker.triggerId || marker.id), name: text(marker.name || marker.id), markerId: text(marker.id), kind: "voxel", x: Number(marker.x) || 0, y: Number(marker.y) || 0, z: Number(marker.z) || 0, aliases: [text(marker.triggerId || marker.id), text(marker.id)] })) || []
        : (scene.props || []).map((prop, index) => ({ id: text(prop?.nodeTriggerId || `prop-${index + 1}`), name: text(prop?.name || `Object ${index + 1}`), kind: "sprite", frame: Number(prop?.frame) || 0, index, aliases: [text(prop?.nodeTriggerId || `prop-${index + 1}`), `prop-${index + 1}`, `prop-${index}`] })));
      if (mode === "sidescroller") for (const [index, prop] of (scene.props || []).entries()) {
        if (!prop?.targetSceneId) continue;
        portalLinks.push({ from:text(scene.id), to:text(prop.targetSceneId), origin:`Object ${index + 1}`, propIndex:index, entryX:prop.targetX ?? null, entryY:prop.targetY ?? null });
      }
      const npcMarkers = mode === "voxel3d" ? (scene.voxelWorld?.markers || []).filter(marker => marker?.kind === "npc") : [];
      const characters = (scene.dialogue?.characters || []).filter(item => item?.role !== "actor" && item?.visible !== false).map(item => text(item.id));
      return { id: text(scene.id), name: text(scene.name || scene.id || "Scene"), mode, triggers, npcMarkers, characters,
        width: mode === "voxel3d" ? Number(scene.voxelWorld?.width) || 0 : Number(scene.sceneWidth) || 640,
        depth: mode === "voxel3d" ? Number(scene.voxelWorld?.depth) || 0 : Number(scene.sceneHeight) || 360,
        spriteFrames: [scene.idleFrame ?? 0, scene.walkFrame ?? 0, scene.jumpFrame ?? 0],
        blocks: mode === "voxel3d" ? (scene.voxelWorld?.blocks || []).length : 0 };
    });
    const issues = [], sceneIds = new Set(scenes.map(scene => scene.id)), links = [];
    if (sceneIds.size !== scenes.length) issues.push({ type:"duplicate-scene", message:"Multiple worlds have the same ID. Rename or recreate the duplicate world." });
    if (playMode.activeSceneId && !sceneIds.has(text(playMode.activeSceneId))) issues.push({ type:"missing-active-scene", message:"The active world is not in the world list." });
    const matchesTrigger = (scene, bind) => scene.triggers.some(trigger => trigger.aliases.includes(bind));
    for (const portal of portalLinks) {
      if (!sceneIds.has(portal.to)) issues.push({ sceneId:portal.from, type:"missing-portal", message:`${portal.origin} in ${portal.from} leads to a missing world.` });
      else links.push({ ...portal, event:"objectPortal", binding:portal.origin, rootId:"", actionId:"",
        crossDimension:scenes.find(scene => scene.id === portal.from)?.mode !== scenes.find(scene => scene.id === portal.to)?.mode });
    }
    const nodeById = new Map(nodes.map(node => [text(node?.id), node]));
    for (const scene of scenes) {
      const used = new Set();
      for (const trigger of scene.triggers) {
        if (!trigger.id) issues.push({ sceneId:scene.id, type:"empty-trigger", message:`${scene.name}: an object has no touch-rule ID.` });
        if (used.has(trigger.id)) issues.push({ sceneId:scene.id, type:"duplicate-trigger", message:`${scene.name}: multiple objects share touch-rule ID ${trigger.id}.` });
        used.add(trigger.id);
      }
      for (const marker of scene.npcMarkers) if (!scene.characters.includes(text(marker.characterId)))
        issues.push({ sceneId:scene.id, type:"unbound-npc", message:`${scene.name}: NPC marker ${text(marker.name || marker.id)} has no matching visible dialogue character.` });
      if (frameCount !== null) for (const frame of scene.spriteFrames) if (!validFrame(frame, frameCount))
        issues.push({ sceneId:scene.id, type:"missing-sprite", message:`${scene.name}: player animation refers to a missing Base drawing frame ${frame}.` });
    }
    const reachableActions = (start, found = new Set()) => {
      if (!start || found.has(start) || found.size > 100) return [];
      found.add(start);
      const node = nodeById.get(start);
      if (!node) return [];
      return [...(node.type === "actionScene" ? [node] : []), ...reachableActions(text(node.next), found), ...reachableActions(text(node.alt), found)];
    };
    for (const node of nodes) {
      const data = node?.data || {}, ruleId = text(node?.id), scope = text(data.sceneId);
      if (node?.type === "actionScene" && !sceneIds.has(scope))
        issues.push({ sceneId:scope, ruleId, type:"missing-destination", message:`Rule ${text(node.name || ruleId)} links to a missing world.` });
      if (!["eventStart", "eventTrigger", "eventInteract"].includes(node?.type)) continue;
      const applicable = scope ? scenes.filter(scene => scene.id === scope) : scenes;
      if (scope && !applicable.length) issues.push({ sceneId:scope, ruleId, type:"missing-source", message:`Rule ${text(node.name || ruleId)} starts in a missing world.` });
      for (const scene of applicable) {
        const bind = text(node.type === "eventTrigger" ? data.trigger || "any" : data.character || "any");
        if (node.type === "eventTrigger" && bind !== "any" && !((scope ? [scene] : scenes).some(item => matchesTrigger(item, bind))))
          issues.push({ sceneId:scene.id, ruleId, type:"missing-trigger", message:`${scene.name}: touch rule ${text(node.name || ruleId)} cannot find ${bind}.` });
        if (node.type === "eventInteract" && bind !== "any" && !((scope ? [scene] : scenes).some(item => item.characters.includes(bind))))
          issues.push({ sceneId:scene.id, ruleId, type:"missing-character", message:`${scene.name}: interaction rule ${text(node.name || ruleId)} cannot find ${bind}.` });
        if (node.type === "eventTrigger" && (bind === "any" ? !scene.triggers.length : !matchesTrigger(scene, bind))) continue;
        if (node.type === "eventInteract" && (bind === "any" ? !scene.characters.length : !scene.characters.includes(bind))) continue;
        for (const dest of reachableActions(text(node.next))) if (sceneIds.has(text(dest.data?.sceneId)))
          links.push({ from:scene.id, to:text(dest.data.sceneId), rootId:ruleId, actionId:text(dest.id), event:node.type, binding:bind,
            crossDimension:scene.mode !== scenes.find(item => item.id === text(dest.data.sceneId))?.mode });
      }
    }
    return { scenes, links, issues };
  }
  return { analyze };
});
