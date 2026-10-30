"use strict";

// Play workspace
(function attachPlayWorkspace(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorkspace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayWorkspace() {
  function text(value) { return String(value ?? ""); }
  function scenes(playMode = {}) {
    const stored = Array.isArray(playMode.scenes) ? playMode.scenes : [];
    if (!stored.length) return [playMode];
    return stored.map(scene => String(scene?.id || "") === String(playMode.activeSceneId || "") ? { ...scene, props: playMode.props || [], dialogue: playMode.dialogue || scene.dialogue || {} } : scene);
  }
  function scene(playMode = {}, sceneId = playMode.activeSceneId) {
    const id = text(sceneId || playMode.activeSceneId);
    return scenes(playMode).find(item => text(item?.id) === id) || null;
  }
  function triggerOptions(playMode = {}, sceneId = playMode.activeSceneId) {
    if (sceneId === "") return scenes(playMode).flatMap(item => (item?.props || []).map((prop, index) => ({ id: text(prop?.nodeTriggerId || `prop-${index + 1}`), index, frame: Number(prop?.frame) || 0, sceneId: text(item?.id), sceneName: text(item?.name || item?.id) })));
    const current = scene(playMode, sceneId);
    return (current?.props || []).map((prop, index) => ({ id: text(prop?.nodeTriggerId || `prop-${index + 1}`), index, frame: Number(prop?.frame) || 0, sceneId: text(current?.id), sceneName: text(current?.name || current?.id) }));
  }
  function characterOptions(playMode = {}, sceneId = playMode.activeSceneId) {
    if (sceneId === "") return scenes(playMode).flatMap(item => (item?.dialogue?.characters || []).filter(character => character?.role !== "actor" && character?.visible !== false).map(character => ({ id: text(character.id), name: text(character.name || character.id), startLine: Math.max(0, Number(character.startLine) || 0), sceneId: text(item?.id), sceneName: text(item?.name || item?.id) })));
    const current = scene(playMode, sceneId);
    return (current?.dialogue?.characters || []).filter(character => character?.role !== "actor" && character?.visible !== false).map(character => ({ id: text(character.id), name: text(character.name || character.id), startLine: Math.max(0, Number(character.startLine) || 0), sceneId: text(current?.id), sceneName: text(current?.name || current?.id) }));
  }
  function validate(playMode = {}) {
    const allScenes = scenes(playMode);
    const sceneIds = new Set(allScenes.map(item => text(item?.id)).filter(Boolean));
    const audioIds = new Set((playMode.audioLibrary || []).map(asset => text(asset?.id)).filter(Boolean));
    const errors = [];
    const warnings = [];
    if (!allScenes.length) errors.push("The game has no scenes.");
    if (sceneIds.size !== allScenes.filter(item => text(item?.id)).length) errors.push("Two scenes use the same internal scene ID.");
    allScenes.forEach((item, sceneIndex) => {
      const label = text(item?.name || `Scene ${sceneIndex + 1}`);
      const used = new Set();
      (item?.props || []).forEach((prop, propIndex) => {
        const trigger = text(prop?.nodeTriggerId || `prop-${propIndex + 1}`);
        if (used.has(trigger)) warnings.push(`${label} has more than one object named ${trigger}.`);
        used.add(trigger);
        if (prop?.targetSceneId && !sceneIds.has(text(prop.targetSceneId))) errors.push(`${label} has an object linked to a missing scene.`);
      });
    });
    const nodes = Array.isArray(playMode?.nodeEditor?.nodes) ? playMode.nodeEditor.nodes : [];
    const nodeIds = new Set(nodes.map(node => text(node?.id)).filter(Boolean));
    nodes.forEach(node => {
      const data = node?.data || {};
      const name = text(node?.name || "Rule");
      if (node?.next && !nodeIds.has(text(node.next))) errors.push(`${name} points to a missing next rule.`);
      if (node?.alt && !nodeIds.has(text(node.alt))) errors.push(`${name} points to a missing Else rule.`);
      if (["eventStart", "eventTrigger", "eventInteract"].includes(node?.type) && data.sceneId && !sceneIds.has(text(data.sceneId))) errors.push(`${name} is assigned to a missing scene.`);
      if (node?.type === "actionScene" && (!data.sceneId || !sceneIds.has(text(data.sceneId)))) errors.push(`${name} needs a valid destination scene.`);
      if (node?.type === "actionPlaySound" && data.audioAssetId && !audioIds.has(text(data.audioAssetId))) errors.push(`${name} uses a missing audio clip.`);
      if (node?.type === "eventTrigger" && data.trigger && data.trigger !== "any") {
        const options = data.sceneId ? triggerOptions(playMode, data.sceneId) : allScenes.flatMap(item => triggerOptions(playMode, item?.id));
        if (!options.some(option => text(option.id) === text(data.trigger))) errors.push(`${name} uses object ${text(data.trigger)}, which does not exist in ${data.sceneId ? text(scene(playMode, data.sceneId)?.name || data.sceneId) : "any scene"}.`);
      }
      if (node?.type === "eventInteract" && data.character && data.character !== "any") {
        const options = data.sceneId ? characterOptions(playMode, data.sceneId) : allScenes.flatMap(item => characterOptions(playMode, item?.id));
        if (!options.some(option => text(option.id) === text(data.character))) errors.push(`${name} uses character ${text(data.character)}, which does not exist in ${data.sceneId ? text(scene(playMode, data.sceneId)?.name || data.sceneId) : "any scene"}.`);
      }
    });
    return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  }
  return { scenes, scene, triggerOptions, characterOptions, validate };
});
