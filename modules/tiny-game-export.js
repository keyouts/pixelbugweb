"use strict";

// Module bridge
(function attachTinyGameExport(root, factory) {
  const runtimeCore = typeof module === "object" && module.exports ? require("./play-runtime-core.js") : root?.PixelBugPlayRuntimeCore;
  const ruleRuntime = typeof module === "object" && module.exports ? require("./play-rule-runtime.js") : root?.PixelBugPlayRuleRuntime;
  const scenePortal = typeof module === "object" && module.exports ? require("./play-scene-portal.js") : root?.PixelBugPlayScenePortal;
  const voxelAssets = typeof module === "object" && module.exports ? require("./play-voxel-assets.js") : root?.PixelBugPlayVoxelAssets;
  const sessionControls = typeof module === "object" && module.exports ? require("./play-session-controls.js") : root?.PixelBugPlaySessionControls;
  const sessionState = typeof module === "object" && module.exports ? require("./play-session-state.js") : root?.PixelBugPlaySessionState;
  const voxelWorld = typeof module === "object" && module.exports ? require("./play-voxel-world.js") : root?.PixelBugPlayVoxelWorld;
  const viewport = typeof module === "object" && module.exports ? require("./renderer/play-viewport-controller.js") : root?.PixelBugPlayViewportController;
  const componentMotion = typeof module === "object" && module.exports ? require("./play-component-motion.js") : root?.PixelBugPlayComponentMotion;
  const componentObstacles = typeof module === "object" && module.exports ? require("./play-component-obstacles.js") : root?.PixelBugPlayComponentObstacles;
  const playInput = typeof module === "object" && module.exports ? require("./renderer/play-input-controller.js") : root?.PixelBugPlayInputController;
  const api = factory(runtimeCore, ruleRuntime, voxelAssets, voxelWorld, sessionState, sessionControls, playInput, viewport, componentMotion, componentObstacles, scenePortal);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugTinyGameExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTinyGameExport(runtimeCore, ruleRuntime, voxelAssets, voxelWorld, sessionState, sessionControls, playInput, viewport, componentMotion, componentObstacles, scenePortal) {
  if (!runtimeCore?.standaloneSource) throw new Error("Play runtime core is unavailable.");
  if (!ruleRuntime?.standaloneSource || !scenePortal?.standaloneSource) throw new Error("Play rule or portal runtime is unavailable.");
  if (!voxelAssets?.standaloneSource) throw new Error("Play voxel assets runtime is unavailable.");
  if (!viewport?.standaloneSource) throw new Error("Play viewport runtime is unavailable.");
  if (!componentObstacles?.standaloneSource) throw new Error("Gameplay obstacle context unavailable.");
  if (!componentMotion?.standaloneSource) throw new Error("Gameplay component motion runtime is unavailable.");
  if (!playInput?.standaloneSource) throw new Error("Play input runtime is unavailable.");
  if (!sessionState?.standaloneSource || !sessionControls?.standaloneSource) throw new Error("Play session runtime is unavailable.");
  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
  }

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

// Game html
function buildTinyGameHtml(payload) {
  const safeSize=(value,fallback,minimum,maximum)=>{
    const number=Number(value);
    return Number.isFinite(number)&&number>0 ? Math.max(minimum,Math.min(maximum,Math.round(number))) : fallback;
  };
  payload={...payload,exportWidth:safeSize(payload?.exportWidth,640,160,4096),
    exportHeight:safeSize(payload?.exportHeight,360,120,2160)};
  const sceneTypes = new Set((payload?.playMode?.scenes || []).map(scene => scene?.worldType === "voxel3d" ? "voxel3d" : "sidescroller"));
  if (!payload?.__hybridInner && sceneTypes.size > 1) return buildHybridGameHtml(payload);
  if (payload?.playMode?.worldType === "voxel3d") return buildVoxelGameHtml(payload);
  const payloadJson = escapeScriptJson(payload);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none';" />
<title>${escapeHtml(payload.title)}</title>
<style>
:root { color-scheme: dark; --bg:#141414; --ink:#f7f0da; --edge:#050505; --panel:#242424; --accent:#ffd447; }
* { box-sizing: border-box; }
html, body { margin:0; min-height:100%; background:var(--bg); color:var(--ink); font-family:system-ui, sans-serif; }
body { display:grid; place-items:center; padding:16px; overflow:auto; }
.wrap { width:100%; max-width:4096px; }
h1 { width:min(100%, ${payload.exportWidth}px); margin:0 auto 10px; font-size:clamp(20px, 4vw, 32px); text-transform:uppercase; letter-spacing:.04em; }
.stage { border:4px solid var(--edge); box-shadow:8px 8px 0 var(--edge); background:#fff; width:min(100%, ${payload.exportWidth}px); height:auto; aspect-ratio:${payload.exportWidth} / ${payload.exportHeight}; margin:0 auto; image-rendering:pixelated; }
canvas { display:block; width:100%; height:100%; image-rendering:pixelated; outline:none; }
.help { width:min(100%, ${payload.exportWidth}px); margin:16px auto 0; padding:12px 14px; border:3px solid var(--edge); background:var(--panel); box-shadow:5px 5px 0 var(--edge); font-weight:800; line-height:1.45; }
kbd { background:var(--accent); color:#111; border:2px solid var(--edge); padding:1px 5px; box-shadow:2px 2px 0 var(--edge); }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
</style>
</head>
<body>
<main class="wrap">
<h1>${escapeHtml(payload.title)}</h1>
<div class="stage"><canvas id="game" width="${payload.exportWidth}" height="${payload.exportHeight}" tabindex="0" aria-label="Tiny exported Pixel Bug game"></canvas></div>
<p class="help"><kbd>A</kbd>/<kbd>D</kbd> or arrows move. <kbd>W</kbd>/<kbd>Space</kbd> jumps. <kbd>E</kbd>/<kbd>Enter</kbd> advances dialogue. <kbd>R</kbd> returns to the latest checkpoint.</p>
<p class="sr-only" id="game-status" aria-live="polite">Game ready.</p>
</main>
<script>
window.__PB_HYBRID_STATE__=null;
const SESSION = ${sessionState.standaloneSource};
const SESSION_UI = ${sessionControls.standaloneSource};
const CORE = ${runtimeCore.standaloneSource};
const INPUT = ${playInput.standaloneSource};
const PORTAL = ${scenePortal.standaloneSource};
const VIEWPORT = ${viewport.standaloneSource};
const PIECES = ${componentMotion.standaloneSource};
const PIECE_CONTEXT = ${componentObstacles.standaloneSource};
const RULES = ${ruleRuntime.standaloneSource};
const VOXEL = ${voxelAssets.standaloneSource};
const GAME = ${payloadJson};
const canvas = document.getElementById("game");
const gameStatus = document.getElementById("game-status");
const ctx = canvas.getContext("2d", { alpha:false });
const rootPlayMode = Object.assign({}, GAME.playMode || {}, window.__PB_HYBRID_STATE__?.playMode || {});
const runtimeScenes = Array.isArray(rootPlayMode.scenes) ? rootPlayMode.scenes : [];
let currentSceneId = rootPlayMode.activeSceneId || runtimeScenes[0]?.id || "scene-main";
const initialScene = runtimeScenes.find(scene => scene.id === currentSceneId) || null;
let pm = Object.assign({}, rootPlayMode, initialScene || {});
let ui = Object.assign({ dialogueBoxColor:"rgba(15,15,15,0.94)", dialogueInkColor:"#f7f0da", dialogueBorderColor:"#f7f0da", dialogueBorderWidth:4, dialogueFont:"system-ui, sans-serif", dialogueNameSize:16, dialogueTextSize:15, dialogueMargin:0.035, dialogueBoxHeight:0.28, dialoguePortrait:true, dialogueCounter:true }, GAME.playUi || pm.ui || {});
let props = Array.isArray(pm.props) ? pm.props : [];
let visualLayers = Array.isArray(pm.visualLayers) ? pm.visualLayers : [];
let sceneLayers = visualLayers.filter(layer => layer && ["background", "foreground", "overlay"].includes(layer.role));
const artW = Math.max(1, GAME.artWidth || 32);
const artH = Math.max(1, GAME.artHeight || 32);
const images = {};
const spriteImages = { actor:{}, object:{} };
const spriteFrames = GAME.spriteFrames || { actor:{}, object:{} };
const keys = {};
const actor = { x:24, y:96, vx:0, vy:0, grounded:false, facing:1 };
let cameraX = 0;
let tick = 0;
let dialogueActive = false;
let dialogueContinuation = null;
let sessionReplaying = false;
let sessionRecording = false;
let standaloneSessionHook=null;
let dialogueLine = 0;
let revealStart = 0;
let revealChars = 0;
let activeCharacterId = "";
let nodeMessageText = "";
let nodeMessageUntil = 0;
let nodeCheckpoint = window.__PB_HYBRID_STATE__?.checkpoint || rootPlayMode.checkpoint || null;
let sceneAudio = null;
let sceneAudioPending = false;
let sceneAudioGeneration = 0;
let runtimeAudioUnlocked = false;
let pendingEffectAudio = [];
let sceneRuleTransitionTimes = [];
let sceneGeneration = 0;
const ruleQueue = RULES.createRuleQueue();
const effectAudios = new Set();
const runtimeAudioAssets = Array.isArray(rootPlayMode.audioLibrary) ? rootPlayMode.audioLibrary : [];
const runtimeAudioMixer = Object.assign({ master:1, music:.85, sfx:1, muteMusic:false, muteSfx:false }, rootPlayMode.audioMixer || {});
let transitionCooldownUntil = 0;
let lastFrameTime = 0;
const simulationClock = CORE.createSimulationClock();
let jumpHeld = false;
const jumpAssist = CORE.createJumpAssist();
let gamepadInteractPressed = false;
let gameFinished = false;
let nodeEntered = new Set();
const nodeGraph = rootPlayMode.nodeEditor && Array.isArray(rootPlayMode.nodeEditor.nodes) ? rootPlayMode.nodeEditor : { nodes: [] };
const ruleSeed = Number.isInteger(rootPlayMode.ruleSeed) ? rootPlayMode.ruleSeed : Date.now();
let ruleRandom = RULES.createSeededRandom(ruleSeed);
if (window.__PB_HYBRID_STATE__?.randomState != null) ruleRandom.setState(window.__PB_HYBRID_STATE__.randomState);
let nodeVariables = { ...(rootPlayMode.variables || {}) };
let nodeInventory = [...new Set((rootPlayMode.inventory || []).map(item => String(item || "").trim()).filter(Boolean))].slice(0, 64);
function propOpen(prop) {
  const variable = String(prop && prop.openVariable || "");
  if (!variable) return false;
  const value = String(nodeVariables[variable] == null ? "" : nodeVariables[variable]).toLowerCase();
  return ["yes", "true", "open", "1"].includes(value);
}
function propCollected(prop) { return prop?.componentKind === "collectible" && nodeInventory.includes(String(prop.componentItem || "")); }
function solidRuntimeProps() { return props.filter(prop => prop && prop.solid !== false && !prop.targetSceneId && !propOpen(prop) && !propCollected(prop)); }
canvas.width = Math.max(160, Math.min(GAME.exportWidth || pm.sceneWidth || 640, 4096));
canvas.height = Math.max(120, Math.min(GAME.exportHeight || pm.sceneHeight || 360, 2160));
function syncStageSize() {
  const stage = canvas.parentElement;
  const pixelWidth = Math.max(160, canvas.width || 640);
  const pixelHeight = Math.max(120, canvas.height || 360);
  stage.style.width = "min(100%, " + pixelWidth + "px)";
  stage.style.height = "auto";
  stage.style.aspectRatio = pixelWidth + " / " + pixelHeight;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
}
syncStageSize();
ctx.imageSmoothingEnabled = false;
function runtimeAudioAsset(id) { return runtimeAudioAssets.find(asset => String(asset && asset.id) === String(id || "")) || null; }
function runtimeAudioGain(value, fallback = 1) {
  const number = Number(value);
  return Math.max(0, Math.min(Number.isFinite(number) ? number : fallback, 1));
}
function runtimeAudioVolume(kind, local, assetVolume) {
  const master = runtimeAudioGain(runtimeAudioMixer.master, 1);
  const bus = kind === "music" ? (runtimeAudioMixer.muteMusic ? 0 : runtimeAudioGain(runtimeAudioMixer.music, .85)) : (runtimeAudioMixer.muteSfx ? 0 : runtimeAudioGain(runtimeAudioMixer.sfx, 1));
  return runtimeAudioGain(local, 1) * runtimeAudioGain(assetVolume, 1) * master * bus;
}
function resolvedSceneAudio() {
  const record = pm.audio || {};
  const asset = record.assetId ? runtimeAudioAsset(record.assetId) : null;
  return asset && asset.dataUrl ? Object.assign({}, record, { dataUrl:asset.dataUrl, name:asset.name, kind:asset.kind, assetVolume:asset.volume }) : Object.assign({}, record, { kind:"music", assetVolume:1 });
}
function stopSceneAudio() {
  sceneAudioGeneration += 1;
  sceneAudioPending = false;
  if (sceneAudio) {
    sceneAudio.pause();
    sceneAudio.removeAttribute("src");
    sceneAudio = null;
  }
}
function startSceneAudio() {
  stopSceneAudio();
  const audio = resolvedSceneAudio();
  if (!audio.dataUrl) return false;
  const generation = sceneAudioGeneration;
  sceneAudio = new Audio(audio.dataUrl);
  sceneAudio.loop = audio.loop !== false;
  sceneAudio.volume = runtimeAudioVolume("music", audio.volume, audio.assetVolume);
  const unlockedWhenStarted = runtimeAudioUnlocked;
  const attempt = sceneAudio.play();
  if (attempt && typeof attempt.catch === "function") attempt.catch(() => {
    if (generation !== sceneAudioGeneration || unlockedWhenStarted) return;
    if (runtimeAudioUnlocked) startSceneAudio();
    else sceneAudioPending = true;
  });
  return true;
}
function stopEffectAudio(audio) {
  if (!audio) return;
  audio.dataset.audioStopped = "true";
  audio.pause();
  audio.removeAttribute("src");
  effectAudios.delete(audio);
}
function startRuntimeAudioRequest(request, allowQueue = true) {
  const asset = runtimeAudioAsset(request.assetId);
  if (!asset || !asset.dataUrl) return false;
  while (effectAudios.size >= 32) stopEffectAudio(effectAudios.values().next().value);
  const audio = new Audio(asset.dataUrl);
  audio.loop = request.loop === true;
  audio.dataset.audioKind = asset.kind === "music" ? "music" : "sfx";
  audio.dataset.audioStopped = "false";
  audio.volume = runtimeAudioVolume(audio.dataset.audioKind, request.volume, asset.volume);
  effectAudios.add(audio);
  const cleanup = () => effectAudios.delete(audio);
  audio.addEventListener("ended", cleanup, { once:true });
  audio.addEventListener("error", cleanup, { once:true });
  const unlockedWhenStarted = runtimeAudioUnlocked;
  const attempt = audio.play();
  if (attempt && typeof attempt.catch === "function") attempt.catch(() => {
    cleanup();
    if (audio.dataset.audioStopped === "true" || !allowQueue || unlockedWhenStarted) return;
    if (runtimeAudioUnlocked) startRuntimeAudioRequest(request, false);
    else if (pendingEffectAudio.length < 32) pendingEffectAudio.push(request);
  });
  return true;
}
function playRuntimeAudio(assetId, volume, loop) {
  return startRuntimeAudioRequest({ assetId, volume:volume == null ? 1 : volume, loop:loop === true });
}
function unlockRuntimeAudio() {
  const alreadyUnlocked = runtimeAudioUnlocked;
  runtimeAudioUnlocked = true;
  if (sceneAudioPending || (!alreadyUnlocked && sceneAudio && sceneAudio.paused)) startSceneAudio();
  const queued = pendingEffectAudio.splice(0, pendingEffectAudio.length);
  queued.forEach(request => startRuntimeAudioRequest(request, false));
}
function stopRuntimeAudio(scope) {
  const chosenScope = ["all", "music", "sfx"].includes(scope) ? scope : "all";
  pendingEffectAudio = pendingEffectAudio.filter(request => {
    if (chosenScope === "all") return false;
    const asset = runtimeAudioAsset(request.assetId);
    const kind = asset?.kind === "music" ? "music" : "sfx";
    return kind !== chosenScope;
  });
  effectAudios.forEach(audio => {
    if (chosenScope !== "all" && audio.dataset.audioKind !== chosenScope) return;
    stopEffectAudio(audio);
  });
  if (chosenScope === "all" || chosenScope === "music") {
    sceneAudioPending = false;
    stopSceneAudio();
  }
}
function loadRuntimeScene(sceneId, announce = true, entry = null) {
  const scene = runtimeScenes.find(item => item.id === sceneId);
  if (!scene) return false;
  if (window.__PB_HYBRID_STATE__ && scene.worldType === "voxel3d") {
    sceneGeneration++; ruleQueue.clear();
    window.parent.postMessage({ tag:"pixelbug-hybrid-v1", type:"scene", sceneId:scene.id,
      variables:nodeVariables, inventory:nodeInventory, randomState:ruleRandom.getState(),
      checkpoint:nodeCheckpoint, entry, snapshot:sessionCapture() }, "*");
    return true;
  }
  currentSceneId = scene.id;
  sceneGeneration++;
  ruleQueue.clear();
  pm = Object.assign({}, rootPlayMode, scene);
  props = Array.isArray(pm.props) ? pm.props : [];
  visualLayers = Array.isArray(pm.visualLayers) ? pm.visualLayers : [];
  sceneLayers = visualLayers.filter(layer => layer && ["background", "foreground", "overlay"].includes(layer.role));
  ui = Object.assign({ dialogueBoxColor:"rgba(15,15,15,0.94)", dialogueInkColor:"#f7f0da", dialogueBorderColor:"#f7f0da", dialogueBorderWidth:4, dialogueFont:"system-ui, sans-serif", dialogueNameSize:16, dialogueTextSize:15, dialogueMargin:0.035, dialogueBoxHeight:0.28, dialoguePortrait:true, dialogueCounter:true }, GAME.playUi || pm.ui || {});
  canvas.width = Math.max(160, Math.min(Number(pm.sceneWidth) || GAME.exportWidth || 640, 4096));
  canvas.height = Math.max(120, Math.min(Number(pm.sceneHeight) || GAME.exportHeight || 360, 2160));
  syncStageSize();
  ctx.imageSmoothingEnabled = false;
  actor.x = 24;
  actor.y = groundY() - actorRect().h;
  actor.vx = 0;
  actor.vy = 0;
  actor.grounded = true;
  cameraX = 0;
  if (entry) {
    const metrics = actorMetrics();
    if (entry.x != null && Number.isFinite(Number(entry.x))) actor.x = Math.max(0, Math.min(worldWidth() - metrics.w, Number(entry.x)));
    if (entry.y != null && Number.isFinite(Number(entry.y))) actor.y = Math.max(0, Math.min(groundY() - metrics.h, Number(entry.y)));
    cameraX = Math.max(0, Math.min(worldWidth() - canvas.width, actor.x - Math.round(canvas.width * .3)));
  }
  dialogueActive = false;
  activeCharacterId = "";
  nodeEntered.clear();
  transitionCooldownUntil = performance.now() + 400;
  lastFrameTime = 0; CORE.resetSimulationClock(simulationClock); jumpHeld = false; CORE.resetJumpAssist(jumpAssist);
  startSceneAudio();
  if (gameStatus) gameStatus.textContent = "Scene: " + (scene.name || "Scene") + ".";
  if (announce) runNodeEvent("sceneStart", { sceneId:scene.id, sceneName:scene.name || "Scene" });
  return true;
}
function readGamepad() {
  return INPUT.readGamepad(navigator.getGamepads?.());
}
function loadImageRecord(src, target, id) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { target[id] = img; resolve(); };
    img.onerror = resolve;
    img.src = src;
  });
}
function loadImages() {
  const tasks = Object.entries(GAME.frames || {}).map(([id, src]) => loadImageRecord(src, images, id));
  ["actor", "object"].forEach(kind => Object.entries(spriteFrames[kind] || {}).forEach(([id, record]) => {
    if (record?.dataUrl) tasks.push(loadImageRecord(record.dataUrl, spriteImages[kind], id));
  }));
  return Promise.all(tasks);
}
function scale() { return Math.max(0.5, Math.min(Number(pm.actorScale) || 3, 32)); }
function worldWidth() { return Math.max(canvas.width, Math.min(Number(pm.worldWidth) || Math.max(1600, canvas.width), 20000)); }
function groundY() { return Math.max(32, Math.min(Number(pm.groundY) || canvas.height - 48, canvas.height - 8)); }
function screenX(x) { return Math.round(x - cameraX); }
function rectsOverlap(a, b) { return CORE.rectsOverlap(a, b); }
function expandedRect(rect, pad) { return { x:rect.x - pad, y:rect.y - pad, w:rect.w + pad * 2, h:rect.h + pad * 2 }; }
function spriteRecord(frame, actorOnly = false) {
  const kind = actorOnly ? "actor" : "object";
  return spriteFrames[kind]?.[String(frame)] || null;
}
function spriteMetrics(frame, spriteScale, actorOnly = false) {
  const record = spriteRecord(frame, actorOnly);
  const sourceWidth = Math.max(1, Number(record?.sw) || artW);
  const sourceHeight = Math.max(1, Number(record?.sh) || artH);
  const factor = actorOnly ? Math.max(0.01, Math.min(Number(record?.scaleFactor) || 1, 1)) : 1;
  const chosenScale = Math.max(0.5, Math.min(Number(spriteScale) || 1, 32));
  return {
    sx:Math.max(0, Number(record?.sx) || 0),
    sy:Math.max(0, Number(record?.sy) || 0),
    sw:sourceWidth,
    sh:sourceHeight,
    w:Math.max(1, Math.round(sourceWidth * chosenScale * factor)),
    h:Math.max(1, Math.round(sourceHeight * chosenScale * factor)),
    image:spriteImages[actorOnly ? "actor" : "object"]?.[String(frame)] || images[String(frame)] || null,
    cropped:Boolean(record)
  };
}
function actorMetrics(frame = pm.idleFrame, poseField = "voxelIdlePoseId") {
  if (pm.voxelActorAssetId) {
    const metrics = VOXEL.metrics(rootPlayMode.voxelAssets || [], { voxelAssetId: pm.voxelActorAssetId, voxelPoseId: VOXEL.selectActorPose(pm, poseField, tick), voxelYaw: 0, scale: scale() }, document);
    if (metrics) return { ...metrics, sx: 0, sy: 0, sw: metrics.canvas.width, sh: metrics.canvas.height, cropped: false, voxel: true };
  }
  return spriteMetrics(frame, scale(), true);
}
function objectMetrics(frame, spriteScale) { return spriteMetrics(frame, spriteScale, false); }
function actorRect(x = actor.x, y = actor.y) { const metrics = actorMetrics(); return { x, y, w:metrics.w, h:metrics.h }; }
function voxelPropMetrics(prop) { return VOXEL.metrics(rootPlayMode.voxelAssets || [], prop, document); }
function componentNavigationContext(prop) {
  return PIECE_CONTEXT.context(props,prop,item=>{
    const s=Math.max(1,Math.min(Number(item.scale)||scale(),16));
    return voxelPropMetrics(item)||objectMetrics(Number(item.frame)||0,s);
  },worldWidth(),canvas.height,groundY(),propOpen);
}
function propRect(prop) { const s = Math.max(1, Math.min(Number(prop.scale) || scale(), 16)); const metrics = voxelPropMetrics(prop) || objectMetrics(Number(prop.frame) || 0, s); const p = PIECES.position(prop, tick, worldWidth(), {actorX:actor.x + actorMetrics().w/2, actorY:actor.y, ...componentNavigationContext(prop)}); return { x:p.x, y:p.y, w:metrics.w, h:metrics.h }; }
function clampActor() { const ar = actorRect(); actor.x = Math.max(0, Math.min(worldWidth() - ar.w, actor.x)); actor.y = Math.max(0, Math.min(groundY() - ar.h, actor.y)); }
// Camera update
function updateCamera(seconds = 0, pushActor = false) {
  const rect = actorRect();
  const next = VIEWPORT.updateCamera({cameraX, actorX:actor.x, actorWidth:rect.w,
    canvasWidth:canvas.width, maxWorldWidth:worldWidth(), running:true, seconds,
    follow:pm.cameraFollow !== false, autoScroll:pm.autoScroll === true,
    scrollSpeed:CORE.physics(pm).scrollSpeed, smoothingAlpha:CORE.smoothingAlpha});
  cameraX = next.cameraX;
  if (pushActor && next.actorPush > 0) actor.x = Math.max(0, Math.min(worldWidth() - rect.w, actor.x + next.actorPush));
}
function drawImageFrame(frame, x, y, w, h, flip = false) {
  const img = images[String(frame)];
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
function drawSpriteFrame(frame, x, y, metrics, flip = false, actorOnly = false) {
  const img = metrics?.image;
  if (!img || !metrics) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(x + metrics.w, y);
    ctx.scale(-1, 1);
    if (metrics.cropped) ctx.drawImage(img, metrics.sx, metrics.sy, metrics.sw, metrics.sh, 0, 0, metrics.w, metrics.h);
    else ctx.drawImage(img, 0, 0, metrics.w, metrics.h);
  } else if (metrics.cropped) ctx.drawImage(img, metrics.sx, metrics.sy, metrics.sw, metrics.sh, x, y, metrics.w, metrics.h);
  else ctx.drawImage(img, x, y, metrics.w, metrics.h);
  ctx.restore();
}
function drawSceneBase() {
  ctx.fillStyle = GAME.sceneBackground || "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function parallaxCameraX() {
  return cameraX;
}
function drawLayer(layer) {
  if (!layer || layer.visible === false || layer.frame < 0 || !images[String(layer.frame)]) return;
  const img = images[String(layer.frame)];
  if (layer.role === "overlay") {
    const ratio = Math.max(canvas.width / img.width, canvas.height / img.height);
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const x = Math.round((canvas.width - w) / 2);
    const y = Math.round((canvas.height - h) / 2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(Number(layer.opacity ?? 1), 1));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return;
  }
  const sc = Math.max(0.5, Math.min(Number(layer.scale) || 3, 32));
  const parallax = Number.isFinite(Number(layer.parallax)) ? Number(layer.parallax) : 0;
  const opacity = Math.max(0, Math.min(Number(layer.opacity ?? 1), 1));
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = false;
  if (layer.repeatX !== false || layer.fit === "tile") {
    const w = Math.max(1, Math.round(img.width * sc));
    const h = Math.max(1, Math.round(img.height * sc));
    const y = Math.round(Number.isFinite(Number(layer.y)) ? Number(layer.y) : 0);
    const offset = ((parallaxCameraX() * parallax) % w + w) % w;
    for (let x = -offset - w; x < canvas.width + w; x += w) ctx.drawImage(img, Math.round(x), y, w, h);
    ctx.restore();
    return;
  }
  const fit = layer.fit || "cover";
  const ratio = fit === "stretch" ? null : fit === "contain" ? Math.min(canvas.width / img.width, canvas.height / img.height) : Math.max(canvas.width / img.width, canvas.height / img.height);
  const w = fit === "stretch" ? canvas.width : Math.max(1, Math.round(img.width * ratio));
  const h = fit === "stretch" ? canvas.height : Math.max(1, Math.round(img.height * ratio));
  const x = Math.round((canvas.width - w) / 2 - parallaxCameraX() * parallax);
  const y = Number.isFinite(Number(layer.y)) ? Math.round(Number(layer.y)) : (fit === "stretch" ? 0 : Math.round((canvas.height - h) / 2));
  const shouldRepeatCover = fit !== "stretch" && layer.repeatX === true;
  if (shouldRepeatCover) {
    const offset = ((parallaxCameraX() * parallax - (canvas.width - w) / 2) % w + w) % w;
    for (let drawX = -offset - w; drawX < canvas.width + w; drawX += w) ctx.drawImage(img, Math.round(drawX), y, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}
function drawTiledImage(img, y, sc, parallax, opacity = 1) {
  const w = Math.max(1, Math.round(img.width * sc));
  const h = Math.max(1, Math.round(img.height * sc));
  const offset = ((parallaxCameraX() * parallax) % w + w) % w;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(Number(opacity ?? 1), 1));
  ctx.imageSmoothingEnabled = false;
  for (let x = -offset - w; x < canvas.width + w; x += w) ctx.drawImage(img, Math.round(x), Math.round(y), w, h);
  ctx.restore();
}
function drawRepeatedImage(img, y, w, h, parallax, opacity = 1) {
  const offset = ((parallaxCameraX() * parallax) % w + w) % w;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(Number(opacity ?? 1), 1));
  ctx.imageSmoothingEnabled = false;
  for (let x = -offset - w; x < canvas.width + w; x += w) ctx.drawImage(img, Math.round(x), Math.round(y), w, h);
  ctx.restore();
}
function drawBackground() {
  drawSceneBase();
  const bg = Number(pm.backgroundFrame);
  const img = images[String(bg)];
  if (img) {
    const mode = pm.backgroundScale || "cover";
    if (mode === "stretch") ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    else if (mode === "tile") drawTiledImage(img, 0, Math.max(1, scale()), 0.22, 1);
    else {
      const ratio = mode === "contain" ? Math.min(canvas.width / img.width, canvas.height / img.height) : Math.max(canvas.width / img.width, canvas.height / img.height);
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const y = Math.round((canvas.height - h) / 2);
      drawRepeatedImage(img, y, w, h, 0.08, 1);
    }
  }
  const voxelBackdrop = VOXEL.findAsset(rootPlayMode.voxelAssets || [], { voxelAssetId: pm.voxelBackgroundAssetId });
  if (voxelBackdrop) VOXEL.drawBackdrop(ctx, VOXEL.getCanvas(voxelBackdrop, pm.voxelBackgroundYaw, document, "", "background"), canvas.width, canvas.height, pm.backgroundScale, cameraX);
  sceneLayers.filter(layer => (layer.role || "background") === "background").forEach(drawLayer);
  const scenery = images[String(pm.sceneryFrame)];
  if (scenery) drawTiledImage(scenery, Number(pm.sceneryY) || 0, Math.max(0.5, Math.min(Number(pm.sceneryScale) || 3, 32)), Math.max(-4, Math.min(Number(pm.scenerySpeed) || 0.45, 4)), 1);
}
function drawLayers(role) { sceneLayers.filter(layer => (layer.role || "background") === role).forEach(drawLayer); }
function characters() { return (pm.dialogue && pm.dialogue.characters) || []; }
function lines() { return (pm.dialogue && pm.dialogue.lines) || []; }
function characterById(id) { return characters().find(c => c.id === id) || characters()[0] || {}; }
function textLineMessage(index) { const line = lines()[Math.max(0, Number(index) || 0)] || {}; return String(line.text || ""); }
function showNodeMessage(message, duration) { nodeMessageText = String(message || "").slice(0, 180); nodeMessageUntil = performance.now() + Math.max(900, Math.min(Number(duration) || 3600, 10000)); if (gameStatus && nodeMessageText) gameStatus.textContent = nodeMessageText; }
function startDialogueAtLine(index, continuationId = "", seen = []) { dialogueContinuation = continuationId ? { id:String(continuationId), seen:[...seen] } : null; dialogueActive = true; activeCharacterId = "node-editor"; dialogueLine = Math.max(0, Math.min(Number(index) || 0, Math.max(0, lines().length - 1))); revealStart = performance.now(); revealChars = 0; }
function moveActorBy(dx, dy) { actor.x += Number(dx) || 0; actor.y += Number(dy) || 0; actor.vx = 0; actor.vy = 0; clampActor(); }
function setNodeCheckpoint() { nodeCheckpoint = { sceneId:currentSceneId, x:actor.x, y:actor.y }; showNodeMessage("Checkpoint set.", 1200); }
function resetActorToCheckpoint() { ruleRandom = RULES.createSeededRandom(ruleSeed); sceneGeneration++; ruleQueue.clear(); const cp = nodeCheckpoint; if (cp?.sceneId && cp.sceneId !== currentSceneId) loadRuntimeScene(cp.sceneId, false, cp); const ar = actorRect(); dialogueContinuation = null; dialogueActive = false; activeCharacterId = ""; actor.x = cp && Number.isFinite(Number(cp.x)) ? Number(cp.x) : 24; actor.y = cp && Number.isFinite(Number(cp.y)) ? Number(cp.y) : groundY() - ar.h; actor.vx = 0; actor.vy = 0; actor.grounded = true; gameFinished = false; lastFrameTime = 0; CORE.resetSimulationClock(simulationClock); jumpHeld = false; CORE.resetJumpAssist(jumpAssist); clampActor(); cameraX = cp ? Math.max(0, Math.min(worldWidth() - canvas.width, actor.x - Math.round(canvas.width * .3))) : 0; if (gameStatus) gameStatus.textContent = "Returned to checkpoint."; }
// Node runtime
function nodeById(id) { return (nodeGraph.nodes || []).find(node => String(node.id) === String(id)); }
function allowSceneRuleTransition() {
  const now = performance.now();
  sceneRuleTransitionTimes = sceneRuleTransitionTimes.filter(time => now - time < 1000);
  if (sceneRuleTransitionTimes.length >= 12) return false;
  sceneRuleTransitionTimes.push(now);
  return true;
}
function executeNode(id, seen, generation = sceneGeneration) {
  if (generation !== sceneGeneration) return;
  const node = nodeById(id);
  if (!node || seen.has(String(id)) || seen.size >= RULES.MAX_RULE_STEPS) return;
  seen.add(String(id));
  const result = RULES.evaluateNode(node, { variables:nodeVariables, inventory:nodeInventory }, { random:ruleRandom });
  if (!result) return;
  nodeVariables = result.state.variables;
  nodeInventory = result.state.inventory;
  let dialogueStarted = false;
  result.effects.forEach(effect => {
    if (effect.type === "message") showNodeMessage(Number(effect.textLine) >= 0 ? textLineMessage(effect.textLine) || effect.message || node.name : effect.message || node.name || "Message");
    if (effect.type === "dialogue") {
      dialogueStarted = true;
      startDialogueAtLine(effect.line, effect.continuationId, seen);
    }
    if (effect.type === "checkpoint") setNodeCheckpoint();
    if (effect.type === "moveActor") moveActorBy(effect.dx, effect.dy);
    if (effect.type === "finish") { showNodeMessage(effect.message || "Finished."); gameFinished = true; actor.vx = 0; actor.vy = 0; }
    if (effect.type === "scene") {
      if (effect.sceneId && allowSceneRuleTransition()) loadRuntimeScene(effect.sceneId, true);
      else if (effect.sceneId) showNodeMessage("Scene transition loop stopped.", 2200);
    }
    if (effect.type === "playSound") playRuntimeAudio(effect.assetId, effect.volume, effect.loop);
    if (effect.type === "stopSound") stopRuntimeAudio(effect.scope);
  });
  if (generation !== sceneGeneration) return;
  if (!dialogueStarted && result.nextId) {
    if (result.delayMs) ruleQueue.schedule(result.nextId, seen, generation, result.delayMs, tick);
    else executeNode(result.nextId, seen, generation);
  }
}
function runNodeEvent(type, payload) {
  const generation = sceneGeneration;
  const matches = (nodeGraph.nodes || []).filter(node => RULES.eventMatches(node, type, payload, currentSceneId));
  for (const node of matches) {
    if (generation !== sceneGeneration) break;
    executeNode(node.next || "", new Set([String(node.id)]), generation);
  }
}
function syncNodeTriggers() {
  const actorTouch = expandedRect(actorRect(), 8);
  const entered = new Set();
  const fired = new Set();
  props.forEach((prop, index) => {
    if (!rectsOverlap(actorTouch, propRect(prop))) return;
    const triggerId = String(prop.nodeTriggerId || "prop-" + (index + 1));
    const ids = [triggerId, "prop-" + (index + 1), "prop-" + index, "any"];
    ids.forEach(id => entered.add(id));
    if (!nodeEntered.has(triggerId) && !fired.has(triggerId)) {
      fired.add(triggerId);
      runNodeEvent("triggerEnter", { id:triggerId, name:triggerId, ids, prop });
    }
  });
  nodeEntered = entered;
}
function startDialogue(character) {
  if (!character) return;
  dialogueContinuation = null;
  dialogueActive = true;
  activeCharacterId = character.id || "";
  dialogueLine = Math.max(0, Math.min(Number(character.startLine) || 0, Math.max(0, lines().length - 1)));
  revealStart = performance.now();
  revealChars = 0;
}
function activeInteractionCharacter() {
  const box = actorRect();
  const reach = Math.max(28, box.w);
  const near = { x:box.x - reach, y:box.y - reach / 2, w:box.w + reach * 2, h:box.h + reach };
  let best = null;
  let bestDist = Infinity;
  props.forEach(prop => {
    if (!prop.dialogueCharacterId) return;
    const c = characterById(prop.dialogueCharacterId);
    const r = propRect(prop);
    if (!rectsOverlap(near, r)) return;
    const dist = Math.abs((r.x + r.w / 2) - (box.x + box.w / 2));
    if (dist < bestDist) { best = c; bestDist = dist; }
  });
  if (best) return best;
  const actorCenter = actor.x + box.w / 2;
  const slots = { left:0.24, center:0.5, right:0.76 };
  standaloneCharacters().forEach(character => {
    const worldX = worldWidth() * (slots[character.position] || 0.5);
    const dist = Math.abs(worldX - actorCenter);
    if (dist < bestDist) { best = character; bestDist = dist; }
  });
  return best && bestDist <= Math.max(96, canvas.width * .2) ? best : null;
}
function interactionCharacters() { return characters().filter(c => c && c.role !== "actor" && c.visible !== false); }
function standaloneCharacters() {
  const assigned = new Set(props.map(prop => prop.dialogueCharacterId).filter(Boolean));
  return interactionCharacters().filter(character => !assigned.has(character.id));
}
function drawSceneCharacters() {
  const slots = { left:0.24, center:0.5, right:0.76 };
  const ground = groundY();
  standaloneCharacters().forEach(character => {
    const sc = Math.max(1, Math.min(Number(character.scale) || 3, 16));
    const metrics = objectMetrics(character.frame, sc);
    if (!metrics.image) return;
    const worldX = worldWidth() * (slots[character.position] || 0.5) - metrics.w / 2;
    const x = screenX(worldX);
    const y = Math.round(ground - metrics.h);
    drawSpriteFrame(character.frame, x, y, metrics, Boolean(character.flip), false);
  });
}
function runCharacterInteraction() {
  const character = activeInteractionCharacter();
  if (!character) return;
  const matching = (nodeGraph.nodes || []).filter(node => RULES.eventMatches(node, "characterInteract", { id: character.id, name: character.name }, currentSceneId));
  if (matching.length) {
    matching.forEach(node => executeNode(node.next || "", new Set([String(node.id)])));
    return;
  }
  startDialogue(character);
}
function advanceDialogue() {
  if (!dialogueActive) { runCharacterInteraction(); return; }
  const line = lines()[dialogueLine] || {};
  const len = String(line.text || "").length;
  if (revealChars < len) { revealChars = len; return; }
  const nextLine = Number(line.nextLine);
  if (Number.isFinite(nextLine) && nextLine >= 0 && nextLine < lines().length) { dialogueLine = nextLine; revealStart = performance.now(); revealChars = 0; }
  else { const complete = dialogueContinuation; dialogueContinuation = null; dialogueActive = false; activeCharacterId = ""; if (complete?.id) window.setTimeout(() => executeNode(complete.id, new Set(complete.seen), sceneGeneration), 0); }
}
function drawDialogue() {
  if (!dialogueActive || !lines().length) return;
  const line = lines()[dialogueLine] || {};
  const ch = characterById(line.characterId || activeCharacterId);
  const text = String(line.text || "");
  if ((pm.dialogue || {}).typewriter === false) revealChars = text.length;
  else if (!sessionReplaying) revealChars = Math.min(text.length, Math.max(revealChars, Math.floor((performance.now() - revealStart) / 22)));
  const margin = Math.max(8, Math.round(canvas.width * (Number(ui.dialogueMargin) || .035)));
  const boxH = Math.max(72, Math.round(canvas.height * (Number(ui.dialogueBoxHeight) || .28)));
  const boxY = canvas.height - boxH - margin;
  const portrait = ui.dialoguePortrait !== false ? Math.max(44, Math.min(120, boxH - 28)) : 0;
  ctx.fillStyle = ui.dialogueBoxColor || "rgba(15,15,15,.94)";
  ctx.strokeStyle = ui.dialogueBorderColor || ui.dialogueInkColor || "#f7f0da";
  ctx.lineWidth = Math.max(0, Math.min(Number(ui.dialogueBorderWidth) || 4, 16));
  ctx.fillRect(margin, boxY, canvas.width - margin * 2, boxH);
  ctx.strokeRect(margin, boxY, canvas.width - margin * 2, boxH);
  if (ui.dialoguePortrait !== false) {
    const portraitFrame = line.frame ?? ch.frame ?? 0;
    const portraitMetrics = objectMetrics(portraitFrame, 1);
    drawSpriteFrame(portraitFrame, margin + 12, boxY + 14, Object.assign({}, portraitMetrics, { w:portrait, h:portrait }), false, false);
  }
  ctx.fillStyle = ui.dialogueInkColor || "#f7f0da";
  ctx.font = "900 " + Math.max(8, Math.min(Number(ui.dialogueNameSize) || 16, 32)) + "px " + (ui.dialogueFont || "system-ui, sans-serif");
  const textX = margin + (ui.dialoguePortrait !== false ? portrait + 28 : 16);
  ctx.fillText(line.speaker || ch.name || "Character", textX, boxY + 28);
  ctx.font = "800 " + Math.max(8, Math.min(Number(ui.dialogueTextSize) || 15, 30)) + "px " + (ui.dialogueFont || "system-ui, sans-serif");
  const maxTextWidth = canvas.width - textX - margin - 16;
  const wrapped = [];
  text.slice(0, revealChars).split(/\\r?\\n/).forEach(sourceLine => {
    const words = sourceLine.split(/\\s+/).filter(Boolean);
    let row = "";
    words.forEach(word => {
      const test = row ? row + " " + word : word;
      if (ctx.measureText(test).width <= maxTextWidth || !row) { row = test; return; }
      wrapped.push(row);
      row = word;
      while (ctx.measureText(row).width > maxTextWidth && row.length > 1) {
        let cut = row.length - 1;
        while (cut > 1 && ctx.measureText(row.slice(0, cut)).width > maxTextWidth) cut--;
        wrapped.push(row.slice(0, cut));
        row = row.slice(cut);
      }
    });
    wrapped.push(row);
  });
  ctx.textBaseline = "alphabetic";
  wrapped.slice(0, 4).forEach((part, i) => ctx.fillText(part || " ", textX, boxY + 56 + i * Math.round((Number(ui.dialogueTextSize) || 15) * 1.45)));
  if (ui.dialogueCounter !== false) {
    ctx.font = "900 12px " + (ui.dialogueFont || "system-ui, sans-serif");
    ctx.fillText((dialogueLine + 1) + "/" + lines().length, canvas.width - margin - 44, boxY + boxH - 14);
  }
}
function drawNodeMessage() {
  if (!nodeMessageText || performance.now() > nodeMessageUntil) return;
  const margin = 12;
  const y = 38;
  const boxH = 48;
  ctx.fillStyle = "rgba(15,15,15,.94)";
  ctx.strokeStyle = ui.dialogueBorderColor || ui.dialogueInkColor || "#f7f0da";
  ctx.lineWidth = 4;
  ctx.fillRect(margin, y, canvas.width - margin * 2, boxH);
  ctx.strokeRect(margin, y, canvas.width - margin * 2, boxH);
  ctx.fillStyle = ui.dialogueInkColor || "#f7f0da";
  ctx.font = "900 15px " + (ui.dialogueFont || "system-ui, sans-serif");
  const words = nodeMessageText.split(/\\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  words.forEach(word => {
    const test = row ? row + " " + word : word;
    if (ctx.measureText(test).width > canvas.width - margin * 2 - 20 && row) { rows.push(row); row = word; }
    else row = test;
  });
  if (row) rows.push(row);
  rows.slice(0, 2).forEach((part, index) => ctx.fillText(part, margin + 10, y + 21 + index * 17));
}
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  drawBackground();
  ctx.globalAlpha = 1;
  const drawObjectsAtDepth = front => props.forEach(prop => {
    if ((prop.voxelInFront === true) !== front || propCollected(prop)) return;
    const propScale = Math.max(1, Math.min(Number(prop.scale) || scale(), 16));
    const voxelMetrics = voxelPropMetrics(prop);
    const metrics = voxelMetrics || objectMetrics(Number(prop.frame) || 0, propScale);
    const p = PIECES.position(prop, tick, worldWidth(), {actorX:actor.x + actorMetrics().w/2, actorY:actor.y, ...componentNavigationContext(prop)});
    const x = screenX(p.x);
    if (x + metrics.w < -8 || x > canvas.width + 8) return;
    ctx.globalAlpha = propOpen(prop) ? 0.28 : 1;
    if (voxelMetrics) ctx.drawImage(voxelMetrics.canvas, x, Math.round(p.y), metrics.w, metrics.h);
    else { const alternate = PIECES.frame(prop, tick); const animated = alternate === prop.frame ? metrics : objectMetrics(alternate, propScale); drawSpriteFrame(alternate, x, Math.round(p.y), {...animated, w:metrics.w, h:metrics.h}, p.facing < 0, false); }
  });
  drawObjectsAtDepth(false);
  ctx.globalAlpha = 1;
  drawSceneCharacters();
  ctx.globalAlpha = 1;
  const moving = Math.abs(actor.vx) > .08;
  const selection = CORE.frameSelection(actor, pm, tick);
  const frame = selection.frame;
  const poseField = !actor.grounded ? "voxelJumpPoseId" : moving ? "voxelWalkPoseId" : "voxelIdlePoseId";
  const metrics = actorMetrics(frame, poseField);
  const baseMetrics = actorMetrics();
  const actorY = Math.round(actor.y + baseMetrics.h - metrics.h);
  if (metrics.voxel) {
    ctx.save();
    if (selection.flip) { ctx.translate(screenX(actor.x) + metrics.w, actorY); ctx.scale(-1, 1); ctx.drawImage(metrics.canvas, 0, 0, metrics.w, metrics.h); }
    else ctx.drawImage(metrics.canvas, screenX(actor.x), actorY, metrics.w, metrics.h);
    ctx.restore();
  } else drawSpriteFrame(frame, screenX(actor.x), actorY, metrics, selection.flip, true);
  drawObjectsAtDepth(true);
  ctx.globalAlpha = 1;
  drawLayers("foreground");
  drawLayers("overlay");
  drawDialogue();
  drawNodeMessage();
}
// Session bridge
function sessionCapture() {
  return { sceneId:currentSceneId, mode:"sidescroller", actor:{...actor}, camera:{x:cameraX},
    variables:nodeVariables, inventory:nodeInventory, checkpoint:nodeCheckpoint,
    randomState:ruleRandom.getState(), tick, queue:ruleQueue.snapshot(tick,sceneGeneration),
    entered:[...nodeEntered], finished:gameFinished,
    dialogue:{active:dialogueActive,line:dialogueLine,characterId:activeCharacterId,
      continuationId:dialogueContinuation?.id||"",continuationSeen:dialogueContinuation?.seen||[],revealChars},
    message:performance.now()<nodeMessageUntil?nodeMessageText:"" };
}
function sessionApply(value, replay = false) {
  if (!value || value.sceneId !== currentSceneId) return false;
  sessionReplaying = replay;
  nodeVariables = {...value.variables}; nodeInventory = [...value.inventory];
  nodeCheckpoint = value.checkpoint; ruleRandom.setState(value.randomState);
  Object.assign(actor, value.actor); clampActor(); cameraX = Math.max(0, Math.min(worldWidth()-canvas.width,Number(value.camera.x)||0));
  tick = value.tick; nodeEntered = new Set(value.entered||[]); gameFinished=Boolean(value.finished);
  dialogueActive=Boolean(value.dialogue.active); dialogueLine=value.dialogue.line;
  activeCharacterId=value.dialogue.characterId; revealChars=value.dialogue.revealChars||0; revealStart=performance.now();
  dialogueContinuation=value.dialogue.continuationId ?
    {id:value.dialogue.continuationId,seen:value.dialogue.continuationSeen||[]} : null;
  nodeMessageText=value.message||""; nodeMessageUntil=performance.now()+1500;
  ruleQueue.restore(replay?[]:value.queue,tick,sceneGeneration);
  CORE.resetSimulationClock(simulationClock); Object.keys(keys).forEach(k=>delete keys[k]);
  if (gameStatus) gameStatus.textContent=replay?"Replaying recording.":"Saved game restored.";
  return true;
}
function sessionRestore(value,replay=false) {
  const state=SESSION.snapshot(value,Object.fromEntries(runtimeScenes.map(scene=>[scene.id,"sidescroller"])));
  if(state.sceneId!==currentSceneId)loadRuntimeScene(state.sceneId,false);
  return sessionApply(state,replay);
}
function sessionStartStandalone() {
  if(window.__PB_HYBRID_STATE__)return;
  const modes=Object.fromEntries(runtimeScenes.map(scene=>[scene.id,"sidescroller"]));
  if(!Object.keys(modes).length)modes[currentSceneId]="sidescroller";
  const controller=SESSION_UI.mount({session:SESSION,document,window,capture:sessionCapture,
    restore:sessionRestore,recordEnabled:enabled=>{sessionRecording=enabled;},sceneModes:modes,
    gameId:[GAME.title,...Object.keys(modes)].join("|")});
  standaloneSessionHook=(type,details)=>controller.receive(type,details);
}
function sessionSend(type, details = {}) {
  if (window.__PB_HYBRID_STATE__) window.parent.postMessage({tag:"pixelbug-session-v1",type,...details},"*");
  else standaloneSessionHook?.(type,details);
}
window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.tag !== "pixelbug-session-v1") return;
  const request=event.data;
  if (request.type==="snapshot") sessionSend("snapshot",{requestId:request.requestId,state:sessionCapture()});
  if (request.type==="record") {sessionRecording=request.enabled===true; if(sessionRecording)sessionSend("frame",{state:sessionCapture()});}
  if (request.type==="replay" && request.state) sessionApply(request.state,true);
});
function simulateTick() {
  if (sessionReplaying) return;
  const seconds = CORE.FIXED_STEP_SECONDS;
  const now = performance.now();
  const baseMetrics = actorMetrics();
  const w = baseMetrics.w;
  const h = baseMetrics.h;
  const gamepad = readGamepad();
  const left = keys.ArrowLeft || keys.KeyA || gamepad.left;
  const right = keys.ArrowRight || keys.KeyD || gamepad.right;
  const jump = keys.Space || keys.ArrowUp || keys.KeyW || gamepad.jump || gamepad.up;
  if (gamepad.interact && !gamepadInteractPressed) advanceDialogue();
  gamepadInteractPressed = gamepad.interact;
  if (gameFinished) { actor.vx = 0; actor.vy = 0; return; }
  const physics = CORE.physics(pm);
  actor.vx = CORE.horizontalVelocity(actor.vx,
    dialogueActive ? 0 : (right && !left ? 1 : left && !right ? -1 : 0), physics.moveSpeed, seconds, pm);
  if (actor.vx) actor.facing = actor.vx > 0 ? 1 : -1;
  const justJumped = CORE.assistedJump(jumpAssist, jump, actor.grounded, dialogueActive);
  jumpHeld = Boolean(jump);
  if (justJumped && !dialogueActive) { actor.vy = -physics.jumpSpeed; actor.grounded = false; }
  actor.vy = CORE.advanceVelocity(CORE.releasedJumpVelocity(actor.vy, jump, pm), physics.gravity, seconds);
  actor.grounded = false;
  actor.x = Math.max(0, Math.min(worldWidth() - w, CORE.advanceAxis(actor.x, actor.vx, seconds)));
  let box = actorRect();
  const portal = now >= transitionCooldownUntil ? props.find(prop => prop?.targetSceneId && rectsOverlap(box, propRect(prop))) : null;
  if (portal && loadRuntimeScene(portal.targetSceneId, true,
      PORTAL.entry(portal, runtimeScenes.find(scene => scene.id === portal.targetSceneId)))) return;
  solidRuntimeProps().forEach(prop => { const r = propRect(prop); if (!rectsOverlap(box, r)) return; if (actor.vx > 0) actor.x = r.x - w; if (actor.vx < 0) actor.x = r.x + r.w; actor.vx = 0; box = actorRect(); });
  actor.y = CORE.advanceAxis(actor.y, actor.vy, seconds);
  box = actorRect();
  solidRuntimeProps().forEach(prop => { const r = propRect(prop); if (!rectsOverlap(box, r)) return; if (actor.vy > 0) { actor.y = r.y - h; actor.grounded = true; } if (actor.vy < 0) actor.y = r.y + r.h; actor.vy = 0; box = actorRect(); });
  if (actor.y + h >= groundY()) { actor.y = groundY() - h; actor.vy = 0; actor.grounded = true; }
  updateCamera(seconds, true);
  tick++;
  for (const ready of ruleQueue.takeReady(tick, sceneGeneration)) executeNode(ready.id, new Set(ready.seen), ready.generation);
  syncNodeTriggers();
  if (sessionRecording && tick % 2 === 0) sessionSend("frame",{state:sessionCapture()});
}
function step(now = performance.now()) {
  CORE.advanceSimulationClock(simulationClock, now, simulateTick);
  draw();
  requestAnimationFrame(step);
}
canvas.addEventListener("pointerdown", unlockRuntimeAudio);
window.addEventListener("keydown", event => { if(sessionReplaying)return; unlockRuntimeAudio(); if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault(); if (event.code === "KeyR") { event.preventDefault(); resetActorToCheckpoint(); return; } if (gameFinished) { if (event.code === "KeyE" || event.code === "Enter") event.preventDefault(); return; } if (event.code === "KeyE" || event.code === "Enter") { event.preventDefault(); advanceDialogue(); return; } keys[event.code] = true; });
window.addEventListener("keyup", event => { keys[event.code] = false; });
window.addEventListener("pagehide", () => stopRuntimeAudio("all"), { once:true });
loadImages().then(() => { if (runtimeScenes.length) loadRuntimeScene(currentSceneId, false, window.__PB_HYBRID_STATE__?.entry || null); else { startSceneAudio(); actor.y = groundY() - actorMetrics().h; } canvas.focus();
  const resume=window.__PB_HYBRID_STATE__?.resume;
  if (resume) sessionApply(resume,window.__PB_HYBRID_STATE__?.replay===true);
  else runNodeEvent("sceneStart", { sceneId:currentSceneId });
  sessionSend("ready",{sceneId:currentSceneId,state:sessionCapture()});
  sessionStartStandalone();
  requestAnimationFrame(step); });
</script>
</body>
</html>`;
}

// Hybrid exports
function buildHybridGameHtml(payload) {
  const pm = payload.playMode || {};
  const scenes = (Array.isArray(pm.scenes) ? pm.scenes : []).filter(scene => scene && typeof scene.id === "string");
  const modes = Object.fromEntries(scenes.map(scene => [scene.id, scene.worldType === "voxel3d" ? "voxel3d" : "sidescroller"]));
  const innerPayload = worldType => ({ ...payload, __hybridInner:true, playMode:{ ...pm, worldType } });
  const documents = {
    sidescroller:buildTinyGameHtml(innerPayload("sidescroller")),
    voxel3d:buildTinyGameHtml(innerPayload("voxel3d"))
  };
  const start = modes[pm.activeSceneId] ? pm.activeSceneId : scenes[0]?.id || "scene-main";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none';"/>
<title>${escapeHtml(payload.title || "PixelBug Hybrid Game")}</title>
<style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#182428;color:#f6f1e8;font-family:system-ui,sans-serif}main{max-width:980px;margin:0 auto;padding:16px}h1{font-size:clamp(20px,4vw,30px)}iframe{width:100%;min-height:560px;height:min(90vh,860px);border:3px solid #829aa0;background:#182428}#hybrid-status{font-weight:700;min-height:1.5em}small{color:#bdd2d6}.session-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.session-controls button,.session-controls select{padding:8px;background:#354952;color:#fff;border:2px solid #a5c6c8;border-radius:5px}.session-controls button:focus-visible,.session-controls select:focus-visible{outline:3px solid #ffe073;outline-offset:2px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>
</head><body><main><h1>${escapeHtml(payload.title || "PixelBug Hybrid Game")}</h1>
<iframe id="runtime" title="PixelBug playable scene" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
<p id="hybrid-status" role="status" aria-live="polite">Loading game…</p>
<div class="session-controls" role="group" aria-label="Game saves">
<label for="save-slot">Save slot</label><select id="save-slot" aria-label="Game save slot"><option value="1">Slot 1</option><option value="2">Slot 2</option><option value="3">Slot 3</option></select>
<button type="button" id="save-game">Save game</button><button type="button" id="load-game">Load game</button><button type="button" id="delete-save">Delete save</button>
<button type="button" id="download-save">Download save file</button><button type="button" id="import-save">Import save file</button>
<input id="save-file" type="file" accept=".pbsave,application/json" class="sr-only" aria-label="Select a saved game file"/>
</div>
<div class="session-controls" role="group" aria-label="Game recording and replay">
<button type="button" id="record-game" aria-pressed="false">Start recording</button><button type="button" id="stop-record">Stop recording</button>
<button type="button" id="play-record">Replay session</button><button type="button" id="stop-replay">Stop replay</button>
<button type="button" id="download-record">Download replay</button><button type="button" id="import-record">Import replay</button>
<input id="record-file" type="file" accept=".pbreplay,application/json" class="sr-only" aria-label="Select a recorded session"/>
</div><p id="session-status" role="status" aria-live="polite">Save slots and session recording are available. Replay records up to ten minutes at 30 frames per second.</p>
<button type="button" id="hybrid-restart">Restart game</button> <small>Click the game to focus controls. 2D and voxel scenes keep their own movement and camera controls. The game works offline.</small>
</main><script>
const SESSION = ${sessionState.standaloneSource};
const HYBRID_TEMPLATES = ${escapeScriptJson(documents)};
const HYBRID_MODES = ${escapeScriptJson(modes)};
const HYBRID_ROOT = ${escapeScriptJson({ variables:pm.variables || {}, inventory:pm.inventory || [], checkpoint:pm.checkpoint || null, ruleSeed:Number.isInteger(pm.ruleSeed) ? pm.ruleSeed : null })};
const runtime = document.getElementById("runtime");
const sessionStatus=document.getElementById("session-status");
const sessionModes=HYBRID_MODES;
const browserStorage=(()=>{try{return window.localStorage;}catch{return {getItem(){return null;},setItem(){throw new Error("Browser storage unavailable.");},removeItem(){}};}})();
const SESSION_PROJECT_ID=${escapeScriptJson([payload.title, ...scenes.map(scene => scene.id)].join("|"))};
const store=SESSION.createStorage(browserStorage,SESSION_PROJECT_ID);
const hybridStatus = document.getElementById("hybrid-status");
const initialSceneId = ${escapeScriptJson(start)};
let currentSceneId = initialSceneId;
let currentMode = "";
let randomState = null;
let handoffCount = 0;
let handoffHistory = [];
let childReady=false, snapshotRequest=0, recorder=null, recording=false, lastTape=null, replayTimer=null, playing=false;
let originalBeforeReplay=null, lastReplayFrame=null;
const snapshotWaiters=new Map();
let gameState = { variables:{...HYBRID_ROOT.variables}, inventory:[...HYBRID_ROOT.inventory], checkpoint:HYBRID_ROOT.checkpoint,
  ruleSeed:HYBRID_ROOT.ruleSeed == null ? Date.now() : HYBRID_ROOT.ruleSeed };
function openHybridScene(sceneId,options={}) {
  if (!Object.prototype.hasOwnProperty.call(HYBRID_MODES,sceneId)) {
    hybridStatus.textContent = "Unknown destination scene: " + String(sceneId).slice(0,60);
    return false;
  }
  for(const pending of snapshotWaiters.values()){
    clearTimeout(pending.timeout);
    pending.reject(new Error("Scene changed while saving."));
  }
  snapshotWaiters.clear();
  childReady=false;
  currentSceneId = sceneId;
  currentMode = HYBRID_MODES[sceneId];
  const boot = {playMode:{activeSceneId:sceneId,variables:{...gameState.variables},inventory:[...gameState.inventory],ruleSeed:gameState.ruleSeed},
    randomState,checkpoint:gameState.checkpoint,entry:gameState.entry||null,
    resume:options.resume||null,replay:options.replay===true};
  gameState.entry = null;
  const code = "window.__PB_HYBRID_STATE__="+JSON.stringify(boot).replace(/</g,String.fromCharCode(92)+"u003c")+";";
  const html = HYBRID_TEMPLATES[currentMode].replace("window.__PB_HYBRID_STATE__=null;",code);
  runtime.srcdoc = html;
  hybridStatus.textContent = "Scene: " + sceneId + (currentMode === "voxel3d" ? " (voxel)" : " (2D)");
  return true;
}
window.addEventListener("message", event => {
  if(event.source !== runtime.contentWindow || event.data?.tag !== "pixelbug-hybrid-v1" || event.data.type !== "scene" || playing)return;
  const target = event.data.sceneId;
  if(!Object.prototype.hasOwnProperty.call(HYBRID_MODES,target))return;
  const now = performance.now();
  handoffHistory = handoffHistory.filter(time => now-time<1000);
  if(handoffHistory.length>=12){hybridStatus.textContent="Scene transition loop stopped (12 per second).";return;}
  handoffHistory.push(now);
  handoffCount++;
  const data = event.data;
  if(recording && recorder && data.snapshot) {
    try { if(!recorder.push(data.snapshot))stopRecording("Recording capacity reached."); }
    catch {stopRecording("Invalid recording frame.");}
  }
  if(data.variables && typeof data.variables === "object" && !Array.isArray(data.variables)) {
    const valid = Object.entries(data.variables).filter(([key]) => key !== "__proto__" && key !== "constructor" && key !== "prototype").slice(0,128);
    gameState.variables = Object.fromEntries(valid);
  }
  if(Array.isArray(data.inventory))gameState.inventory = [...new Set(data.inventory.map(item=>String(item).slice(0,40)))].slice(0,64);
  gameState.checkpoint = data.checkpoint && typeof data.checkpoint === "object" ? data.checkpoint : null;
  gameState.entry = data.entry && typeof data.entry === "object" ? data.entry : null;
  if(Number.isInteger(data.randomState))randomState = data.randomState >>> 0;
  openHybridScene(target);
});
document.getElementById("hybrid-restart").addEventListener("click", () => {
  gameState = {variables:{...HYBRID_ROOT.variables},inventory:[...HYBRID_ROOT.inventory],checkpoint:HYBRID_ROOT.checkpoint,
    ruleSeed:HYBRID_ROOT.ruleSeed == null ? gameState.ruleSeed : HYBRID_ROOT.ruleSeed};
  randomState = null;handoffHistory=[];handoffCount=0;
  openHybridScene(initialSceneId);
});
// Session controls
function announceSession(text){sessionStatus.textContent=String(text).slice(0,200);}
function errorSession(error){announceSession(error instanceof Error?error.message:String(error));}
function selectedSlot(){return Number(document.getElementById("save-slot").value);}
function storageAvailable(){try{window.localStorage.getItem("pixelbug.session-check");return true;}catch{return false;}}
function requestSnapshot(){
  return new Promise((resolve,reject)=>{
    if(!childReady||playing){reject(new Error("Game is not ready for saving."));return;}
    const requestId=++snapshotRequest;
    const expectedSceneId=currentSceneId;
    const timeout=setTimeout(()=>{snapshotWaiters.delete(requestId);reject(new Error("Save request timed out."));},3000);
    snapshotWaiters.set(requestId,{expectedSceneId,timeout,resolve,reject});
    runtime.contentWindow.postMessage({tag:"pixelbug-session-v1",type:"snapshot",requestId},"*");
  });
}
function download(text,extension){
  const blob=new Blob([text],{type:"application/json"});const url=URL.createObjectURL(blob);
  const link=document.createElement("a");link.href=url;link.download="pixelbug-"+extension;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function applySave(value){
  const state=SESSION.snapshot(value,sessionModes);
  stopReplay(false);stopRecording();
  gameState.variables={...state.variables};gameState.inventory=[...state.inventory];
  gameState.checkpoint=state.checkpoint;gameState.entry=null;randomState=state.randomState;
  handoffHistory=[];handoffCount=0;
  openHybridScene(state.sceneId,{resume:state});announceSession("Saved game loaded from scene "+state.sceneId+".");
}
async function saveToSlot(){
  try{if(!storageAvailable())throw new Error("Browser storage unavailable. Use Download save file instead.");
    const state=await requestSnapshot();store.save(selectedSlot(),state,sessionModes);
    announceSession("Saved game to slot "+selectedSlot()+".");}catch(error){errorSession(error);}
}
function loadFromSlot(){
  try{if(!storageAvailable())throw new Error("Browser storage unavailable. Use Import save file instead.");
    const value=store.load(selectedSlot(),sessionModes);
    if(!value)throw new Error("That save slot is empty.");applySave(value);}catch(error){errorSession(error);}
}
function stopRecording(message="Recording stopped."){
  if(!recorder)return;
  lastTape=recorder.stop();recorder=null;recording=false;
  document.getElementById("record-game").setAttribute("aria-pressed","false");
  if(childReady)runtime.contentWindow.postMessage({tag:"pixelbug-session-v1",type:"record",enabled:false},"*");
  announceSession(message+" "+lastTape.frames.length+" recorded frames.");
}
function stopReplay(restore=true){
  if(replayTimer!==null){clearInterval(replayTimer);replayTimer=null;}
  if(!playing)return;
  playing=false;
  if(restore&&originalBeforeReplay)applySave(originalBeforeReplay);
  originalBeforeReplay=null;
}
function playTape(){
  if(!lastTape){announceSession("Record or import a session first.");return;}
  if(playing)stopReplay(false);
  if(recording)stopRecording();
  requestSnapshot().then(original=>{
    originalBeforeReplay=original;playing=true;
    const frames=lastTape.frames;let index=0;
    openHybridScene(frames[0].sceneId,{resume:frames[0],replay:true});
    replayTimer=setInterval(()=>{
      if(!childReady)return;
      index++;
      if(index>=frames.length){stopReplay(true);announceSession("Replay finished ("+frames.length+" frames).");return;}
      const frame=frames[index];lastReplayFrame=frame;
      if(frame.sceneId!==currentSceneId){openHybridScene(frame.sceneId,{resume:frame,replay:true});return;}
      runtime.contentWindow.postMessage({tag:"pixelbug-session-v1",type:"replay",state:frame},"*");
    },1000/30);
    announceSession("Replaying "+frames.length+" frames across scene boundaries.");
  }).catch(errorSession);
}
window.addEventListener("message",event=>{
  if(event.source!==runtime.contentWindow||event.data?.tag!=="pixelbug-session-v1")return;
  const data=event.data;
  if(data.type==="ready"&&data.sceneId===currentSceneId){
    childReady=true;
    if(recording)runtime.contentWindow.postMessage({tag:"pixelbug-session-v1",type:"record",enabled:true},"*");
  }
  if(data.type==="snapshot"&&snapshotWaiters.has(data.requestId)){
    const pending=snapshotWaiters.get(data.requestId);
    snapshotWaiters.delete(data.requestId);
    clearTimeout(pending.timeout);
    try{
      const state=SESSION.snapshot(data.state,sessionModes);
      if(state.sceneId!==pending.expectedSceneId)throw new Error("Save snapshot came from a different scene.");
      pending.resolve(state);
    }catch(error){pending.reject(error);}
  }
  if(data.type==="frame"&&recording&&recorder){
    try{if(!recorder.push(data.state))stopRecording("Recording capacity reached.");}
    catch(error){stopRecording("Invalid recording frame.");}
  }
});
document.getElementById("save-game").onclick=saveToSlot;
document.getElementById("load-game").onclick=loadFromSlot;
document.getElementById("delete-save").onclick=()=>{
  try{store.erase(selectedSlot());announceSession("Deleted slot "+selectedSlot()+".");}catch(error){errorSession(error);}
};
document.getElementById("download-save").onclick=async()=>{
  try{download(SESSION.packSave(await requestSnapshot(),sessionModes,SESSION_PROJECT_ID),"save.pbsave");announceSession("Save file downloaded.");}catch(error){errorSession(error);}
};
document.getElementById("import-save").onclick=()=>document.getElementById("save-file").click();
document.getElementById("save-file").onchange=async event=>{
  try{const file=event.target.files?.[0];if(!file)return;
    if(file.size>SESSION.MAX_TAPE_BYTES)throw new Error("Imported file exceeds limit.");
    applySave(SESSION.unpackSave(await file.text(),sessionModes,SESSION_PROJECT_ID));}catch(error){errorSession(error);}finally{event.target.value="";}
};
document.getElementById("record-game").onclick=()=>{
  if(playing){announceSession("Stop replay before recording.");return;}
  if(recording){stopRecording();return;}
  if(!childReady){announceSession("Game is not ready yet.");return;}
  recorder=SESSION.createRecorder(sessionModes);recording=true;
  document.getElementById("record-game").setAttribute("aria-pressed","true");
  runtime.contentWindow.postMessage({tag:"pixelbug-session-v1",type:"record",enabled:true},"*");
  announceSession("Recording started. Maximum ten minutes at 30 fps.");
};
document.getElementById("stop-record").onclick=()=>stopRecording();
document.getElementById("play-record").onclick=playTape;
document.getElementById("stop-replay").onclick=()=>{stopReplay(true);announceSession("Replay stopped.");};
document.getElementById("download-record").onclick=()=>{
  try{if(!lastTape)throw new Error("No recording available.");
    download(SESSION.packTape(lastTape,sessionModes,SESSION_PROJECT_ID),"replay.pbreplay");announceSession("Replay file downloaded.");}
  catch(error){errorSession(error);}
};
document.getElementById("import-record").onclick=()=>document.getElementById("record-file").click();
document.getElementById("record-file").onchange=async event=>{
  try{const file=event.target.files?.[0];if(!file)return;
    if(file.size>SESSION.MAX_TAPE_BYTES+256)throw new Error("Imported replay exceeds limit.");
    lastTape=SESSION.unpackTape(await file.text(),sessionModes,SESSION_PROJECT_ID);
    announceSession("Loaded replay with "+lastTape.frames.length+" frames.");}
  catch(error){errorSession(error);}finally{event.target.value="";}
};
openHybridScene(currentSceneId);
</script></body></html>`;
}

function buildVoxelGameHtml(payload) {
  if (!voxelWorld?.standaloneSource || !ruleRuntime?.standaloneSource) throw new Error("Voxel and rule runtimes are required.");
  const gameJson = escapeScriptJson(payload);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"/>
<title>${escapeHtml(payload.title)}</title>
<style>
*{box-sizing:border-box}body{background:#162529;color:#f7f2e9;font:16px system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:14px}
main{width:min(100%,900px)}h1{font-size:clamp(18px,4vw,28px);margin:0 0 12px}canvas{display:block;width:100%;height:auto;image-rendering:pixelated;border:4px solid #27333c;background:#aacbcc;outline:none;touch-action:none}
p{line-height:1.5}kbd{border:1px solid #eee;border-radius:3px;padding:1px 5px}button{padding:9px 14px;border:2px solid #f7f2e9;border-radius:4px;background:#354952;color:#fff;font-weight:700;cursor:pointer}
.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px}.hint{font-size:13px;color:#cbd9db}#status{min-height:1.5em}
</style></head><body><main><h1>${escapeHtml(payload.title)}</h1>
<canvas id="game" width="${Math.max(160, Math.min(Number(payload.exportWidth)||640,4096))}" height="${Math.max(120,Math.min(Number(payload.exportHeight)||360,2160))}" tabindex="0" aria-label="Playable voxel-world game"></canvas>
<div class="controls"><button type="button" id="left">Rotate left</button><button type="button" id="right">Rotate right</button><button type="button" id="turntable" aria-pressed="false">Turntable: Off</button><button type="button" id="reset">Reset</button><button type="button" id="interact">Interact</button></div>
<p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows move; <kbd>Space</kbd> jumps; <kbd>E</kbd> interacts or advances dialogue; <kbd>R</kbd> resets. Drag to orbit and tilt, scroll to zoom.</p>
<p class="hint" id="status" role="status" aria-live="polite">Voxel world ready.</p>
<script>
window.__PB_HYBRID_STATE__=null;
const SESSION = ${sessionState.standaloneSource};
const SESSION_UI = ${sessionControls.standaloneSource};
const CORE = ${runtimeCore.standaloneSource};
const INPUT = ${playInput.standaloneSource};
const WORLD = ${voxelWorld.standaloneSource};
const VOXEL = ${voxelAssets.standaloneSource};
const RULES = ${ruleRuntime.standaloneSource};
const GAME = ${gameJson};
const rootPm = Object.assign({}, GAME.playMode || {}, window.__PB_HYBRID_STATE__?.playMode || {});
const scenes = Array.isArray(rootPm.scenes) ? rootPm.scenes : [];
let currentSceneId = rootPm.activeSceneId || scenes[0]?.id || "scene-main";
let pm = Object.assign({},rootPm,scenes.find(s=>s.id===currentSceneId)||{});
let world = WORLD.normalize(pm.voxelWorld);
const canvas = document.getElementById("game"),ctx = canvas.getContext("2d",{alpha:false}),status = document.getElementById("status");
const keys = Object.create(null),images = Object.create(null);
const records = GAME.spriteFrames?.actor || {};
let actor = WORLD.initialActor(world),lastTime=0,finished=false;
let voxelGamepadInteractPressed = false;
const simulationClock = CORE.createSimulationClock();
const ruleSeed = Number.isInteger(rootPm.ruleSeed) ? rootPm.ruleSeed : Date.now();
let ruleRandom = RULES.createSeededRandom(ruleSeed);
if (window.__PB_HYBRID_STATE__?.randomState != null) ruleRandom.setState(window.__PB_HYBRID_STATE__.randomState);
let variables = {...(rootPm.variables||{})},inventory = [...(rootPm.inventory||[])];
let dialogueLine = -1,dialogueContinuation = "",message = "",messageUntil = 0;
let checkpoint = window.__PB_HYBRID_STATE__?.checkpoint || null,entered = new Set(),drag = null, sceneAudio = null;
const activeEffects = new Set(), audioAssets = rootPm.audioLibrary || [];
let sceneTransitions = [];
let sceneGeneration = 0;
const ruleQueue = RULES.createRuleQueue();
let ruleTick = 0;
let sessionReplaying = false, sessionRecording = false;
let standaloneSessionHook=null;
for(const [name,record] of Object.entries(records)) {
  if(!record?.dataUrl)continue;
  const image = new Image();image.src=record.dataUrl;images[name]=image;
}
function tell(text,duration=3300) {message=String(text||"").slice(0,240);messageUntil=performance.now()+duration;status.textContent=message;}
function stopAudio(scope="all") {
  if(scope!=="sfx"&&sceneAudio){sceneAudio.pause();sceneAudio=null;}
  if(scope!=="music")for(const audio of activeEffects){audio.pause();activeEffects.delete(audio);}
}
function playSound(id,volume=1,loop=false) {
  const asset=audioAssets.find(a=>a.id===id);
  if(!asset?.dataUrl)return;
  const audio = new Audio(asset.dataUrl);
  audio.volume=Math.max(0,Math.min(1,(Number(volume)||0)*(Number(asset.volume??1)||0)));
  audio.loop=loop===true;activeEffects.add(audio);
  audio.addEventListener("ended",()=>activeEffects.delete(audio),{once:true});
  audio.play().catch(()=>{});
}
function startSceneAudio() {
  if(sceneAudio){sceneAudio.pause();sceneAudio=null;}
  const record=pm.audio||{};
  const asset=audioAssets.find(a=>a.id===record.assetId);
  const src=asset?.dataUrl||record.dataUrl;
  if(!src)return;
  sceneAudio=new Audio(src);sceneAudio.loop=record.loop!==false;
  sceneAudio.volume=Math.max(0,Math.min(1,(Number(record.volume??.7)||0)*(Number(rootPm.audioMixer?.master??1)||0)));
  sceneAudio.play().catch(()=>{});
}
function sprite() {
  const selection = CORE.frameSelection({vx:actor.moving?1:0,vy:-actor.vy,grounded:actor.grounded,direction:actor.direction,facing:actor.facing},pm,ruleTick);
  const index = selection.frame;
  const record=records[String(index)]||records[String(pm.idleFrame)],image=images[String(index)]||images[String(pm.idleFrame)];
  if(!image?.complete||!image.naturalWidth||!record)return null;
  const scale=Math.max(.5,Math.min(Number(pm.actorScale)||3,32));
  const sw=Math.max(1,Number(record.sw)||image.width),sh=Math.max(1,Number(record.sh)||image.height),factor=Math.max(.01,Math.min(Number(record.scaleFactor)||1,1));
  return {canvas:image,sx:0,sy:0,sw,sh,w:Math.round(sw*scale*factor),h:Math.round(sh*scale*factor),flip:selection.flip};
}
function ruleEvent(type,payload={}) {
  const generation=sceneGeneration;
  const nodes=(rootPm.nodeEditor?.nodes||[]).filter(node=>RULES.eventMatches(node,type,payload,currentSceneId));
  for(const node of nodes){
    if(generation!==sceneGeneration)break;
    if(node.next)executeNode(node.next,new Set([node.id]),generation);
  }
}
function updateTurntableButton() {const button=document.getElementById("turntable");button.textContent=world.turntable?"Turntable: On":"Turntable: Off";button.setAttribute("aria-pressed",String(world.turntable===true));}
function loadScene(id,announce=true,entry=null,skipStart=false) {
  const scene=scenes.find(s=>s.id===id);
  if(!scene)return false;
  if(window.__PB_HYBRID_STATE__ && scene.worldType!=="voxel3d"){
    sceneGeneration++;ruleQueue.clear();
    window.parent.postMessage({tag:"pixelbug-hybrid-v1",type:"scene",sceneId:id,
      variables,inventory,randomState:ruleRandom.getState(),checkpoint,entry,snapshot:sessionCapture()},"*");
    return true;
  }
  const now=performance.now();sceneTransitions=sceneTransitions.filter(t=>now-t<1000);
  if(sceneTransitions.length>=12){tell("Scene transition loop stopped.");return false;}
  sceneTransitions.push(now);currentSceneId=id;sceneGeneration++;ruleQueue.clear();pm=Object.assign({},rootPm,scene);
  world=WORLD.normalize(pm.voxelWorld);actor=WORLD.initialActor(world);updateTurntableButton();
  entered.clear();dialogueLine=-1;dialogueContinuation="";finished=false;lastTime=0;
  CORE.resetSimulationClock(simulationClock);
  startSceneAudio();if(announce)tell("Scene: "+(scene.name||id),1800);
  if(!skipStart)ruleEvent("sceneStart",{sceneId:id,sceneName:scene.name});return true;
}
function resetActor() {
  ruleRandom = RULES.createSeededRandom(ruleSeed);
  sceneGeneration++;
  ruleQueue.clear();
  CORE.resetSimulationClock(simulationClock);
  dialogueLine=-1;dialogueContinuation="";finished=false;entered.clear();
  if(checkpoint?.sceneId&&checkpoint.sceneId!==currentSceneId)loadScene(checkpoint.sceneId,false,checkpoint);
  actor=WORLD.initialActor(world);
  if(checkpoint&&checkpoint.sceneId===currentSceneId){
    actor.x=Math.max(.3,Math.min(world.width-.3,Number(checkpoint.x)||0));
    actor.y=Math.max(0,Math.min(world.height,Number(checkpoint.y)||0));
    actor.z=Math.max(.3,Math.min(world.depth-.3,Number(checkpoint.z??world.start.z)||0));
  }
  tell("Returned to checkpoint.",1200);
}
function executeNode(id,seen=new Set(),generation=sceneGeneration) {
  if(generation!==sceneGeneration)return;
  const nodes=rootPm.nodeEditor?.nodes||[];
  const node=nodes.find(item=>item.id===id);
  if(!node||seen.has(id)||seen.size>=RULES.MAX_RULE_STEPS)return;
  seen.add(id);
  const result=RULES.evaluateNode(node,{variables,inventory},{random:ruleRandom});
  if(!result)return;
  variables=result.state.variables;inventory=result.state.inventory;
  for(const effect of result.effects) {
    if(effect.type==="message"){
      const line=pm.dialogue?.lines?.[effect.textLine];tell(line?.text||effect.message||"Message");
    }else if(effect.type==="dialogue"){
      dialogueLine=Math.max(0,Math.min((pm.dialogue?.lines||[]).length-1,effect.line));
      dialogueContinuation=effect.continuationId||"";
    }else if(effect.type==="checkpoint"){
      checkpoint={sceneId:currentSceneId,x:actor.x,y:actor.y,z:actor.z};tell("Checkpoint saved.",1200);
    }else if(effect.type==="moveActor"){
      actor.x=Math.max(.3,Math.min(world.width-.3,actor.x+effect.dx));
      actor.z=Math.max(.3,Math.min(world.depth-.3,actor.z+effect.dy));
    }else if(effect.type==="scene"){
      loadScene(effect.sceneId);return;
    }else if(effect.type==="finish"){
      finished=true;tell(effect.message||"Finished.",10000);return;
    }else if(effect.type==="playSound")playSound(effect.assetId,effect.volume,effect.loop);
    else if(effect.type==="stopSound")stopAudio(effect.scope);
  }
  if(result.continuationId)return;
  if(result.nextId){
    // Message delay
    if(result.delayMs)ruleQueue.schedule(result.nextId,seen,generation,result.delayMs,ruleTick);
    else executeNode(result.nextId,seen,generation);
  }
}
function advanceDialogue() {
  if(dialogueLine<0){
    const marker=WORLD.markerNear(world,actor,"npc");
    if(!marker){tell("Move near an NPC to interact.",1400);return;}
    const character=pm.dialogue?.characters?.find(c=>c.id===marker.characterId);
    const nodes=rootPm.nodeEditor?.nodes||[];
    const matching=nodes.filter(n=>RULES.eventMatches(n,"characterInteract",{id:marker.characterId,name:character?.name||marker.name},currentSceneId));
    if(matching.length){for(const node of matching)if(node.next)executeNode(node.next,new Set([node.id]));}
    else if(character)dialogueLine=Math.max(0,Number(character.startLine)||0);
    return;
  }
  const line=pm.dialogue?.lines?.[dialogueLine]||{};
  const next=Number(line.nextLine);
  if(Number.isInteger(next)&&next>=0&&next<(pm.dialogue?.lines||[]).length){dialogueLine=next;return;}
  dialogueLine=-1;
  if(dialogueContinuation){const id=dialogueContinuation;dialogueContinuation="";executeNode(id);}
}
function triggerMarkers() {
  const next=new Set();
  for(const marker of world.markers||[]) {
    if(marker.kind!=="trigger")continue;
    const position=WORLD.markerPosition(world,marker,ruleTick,actor);
    if(Math.hypot(actor.x-position.x,actor.z-position.z)>=.9||Math.abs(actor.y-position.y)>=1.6)continue;
    next.add(marker.id);
    if(!entered.has(marker.id))ruleEvent("triggerEnter",{id:marker.triggerId||marker.id,name:marker.triggerId||marker.id,ids:[marker.id,marker.triggerId||marker.id],sceneId:currentSceneId});
  }
  entered=next;
}
function renderOverlay() {
  ctx.save();
  if(dialogueLine>=0){
    const line=pm.dialogue?.lines?.[dialogueLine]||{},characters=pm.dialogue?.characters||[];
    const speaker=line.speaker||characters.find(c=>c.id===line.characterId)?.name||"Character";
    const h=Math.max(88,Math.round(canvas.height*.27)),y=canvas.height-h-12;
    ctx.fillStyle="rgba(15,15,15,.94)";ctx.fillRect(12,y,canvas.width-24,h);
    ctx.strokeStyle="#f7f0da";ctx.lineWidth=3;ctx.strokeRect(12,y,canvas.width-24,h);
    ctx.font="bold 15px system-ui";ctx.fillStyle="#ffd447";ctx.fillText(String(speaker).slice(0,32),26,y+25);
    ctx.font="14px system-ui";ctx.fillStyle="#f7f0da";
    const words=String(line.text||"").split(/\s+/),rows=[],limit=canvas.width-60;
    let row="";for(const word of words){const next=row?row+" "+word:word;if(ctx.measureText(next).width>limit&&row){rows.push(row);row=word;}else row=next;}
    if(row)rows.push(row);rows.slice(0,3).forEach((text,i)=>ctx.fillText(text,26,y+49+i*18));
  }else if(message&&performance.now()<messageUntil){
    ctx.fillStyle="rgba(12,25,33,.9)";ctx.fillRect(10,canvas.height-48,canvas.width-20,38);
    ctx.fillStyle="#fff";ctx.font="bold 13px system-ui";ctx.fillText(message.slice(0,120),19,canvas.height-24);
  }
  if(finished){ctx.fillStyle="#ffd447";ctx.font="900 18px system-ui";ctx.fillText("FINISHED",16,26);}
  ctx.restore();
}
// Session bridge
function sessionCapture() {
  return {sceneId:currentSceneId,mode:"voxel3d",actor:{...actor},
    camera:{yaw:world.cameraAngle,pitch:world.cameraTilt,cellSize:world.cellSize,turntable:world.turntable},
    variables,inventory,checkpoint,randomState:ruleRandom.getState(),tick:ruleTick,
    queue:ruleQueue.snapshot(ruleTick,sceneGeneration),entered:[...entered],finished,
    dialogue:{active:dialogueLine>=0,line:dialogueLine,continuationId:dialogueContinuation},message:performance.now()<messageUntil?message:""};
}
function sessionApply(value,replay=false) {
  if(!value||value.sceneId!==currentSceneId)return false;
  sessionReplaying=replay;
  variables={...value.variables};inventory=[...value.inventory];checkpoint=value.checkpoint;
  ruleRandom.setState(value.randomState);actor=Object.assign(actor,value.actor);
  actor.x=Math.max(.3,Math.min(world.width-.3,actor.x));
  actor.y=Math.max(0,Math.min(world.height,actor.y));
  actor.z=Math.max(.3,Math.min(world.depth-.3,actor.z));
  world.cameraAngle=((value.camera.yaw%(Math.PI*2))+(Math.PI*2))%(Math.PI*2);
  world.cameraTilt=Math.max(.22,Math.min(1.05,value.camera.pitch));
  world.cellSize=Math.max(16,Math.min(64,value.camera.cellSize));world.turntable=value.camera.turntable;
  ruleTick=value.tick;entered=new Set(value.entered||[]);finished=Boolean(value.finished);
  dialogueLine=value.dialogue.active?value.dialogue.line:-1;
  dialogueContinuation=value.dialogue.continuationId||"";message=value.message||"";
  messageUntil=performance.now()+1500;
  ruleQueue.restore(replay?[]:value.queue,ruleTick,sceneGeneration);
  CORE.resetSimulationClock(simulationClock);Object.keys(keys).forEach(k=>delete keys[k]);
  updateTurntableButton();status.textContent=replay?"Replaying recording.":"Saved game restored.";
  return true;
}
function sessionRestore(value,replay=false) {
  const modes=Object.fromEntries(scenes.map(scene=>[scene.id,"voxel3d"]));
  if(!Object.keys(modes).length)modes[currentSceneId]="voxel3d";
  const state=SESSION.snapshot(value,modes);
  if(state.sceneId!==currentSceneId)loadScene(state.sceneId,false,null,true);
  return sessionApply(state,replay);
}
function sessionStartStandalone(){
  if(window.__PB_HYBRID_STATE__)return;
  const modes=Object.fromEntries(scenes.map(scene=>[scene.id,"voxel3d"]));
  if(!Object.keys(modes).length)modes[currentSceneId]="voxel3d";
  const controller=SESSION_UI.mount({session:SESSION,document,window,capture:sessionCapture,
    restore:sessionRestore,recordEnabled:enabled=>{sessionRecording=enabled;},sceneModes:modes,
    gameId:[GAME.title,...Object.keys(modes)].join("|")});
  standaloneSessionHook=(type,details)=>controller.receive(type,details);
}
function sessionSend(type,details={}) {
  if(window.__PB_HYBRID_STATE__)window.parent.postMessage({tag:"pixelbug-session-v1",type,...details},"*");
  else standaloneSessionHook?.(type,details);
}
window.addEventListener("message",event=>{
  if(event.source!==window.parent||event.data?.tag!=="pixelbug-session-v1")return;
  const request=event.data;
  if(request.type==="snapshot")sessionSend("snapshot",{requestId:request.requestId,state:sessionCapture()});
  if(request.type==="record"){sessionRecording=request.enabled===true;if(sessionRecording)sessionSend("frame",{state:sessionCapture()});}
  if(request.type==="replay"&&request.state)sessionApply(request.state,true);
});
function simulateTick(dt) {
  if(sessionReplaying)return;
  if(world.turntable)WORLD.orbit(world,dt*.5);
  const gamepad = INPUT.readGamepad(navigator.getGamepads?.());
  if (gamepad.interact && !voxelGamepadInteractPressed) advanceDialogue();
  voxelGamepadInteractPressed = gamepad.interact;
  if(!finished&&dialogueLine<0){
    WORLD.step(world,actor,INPUT.directions(keys,gamepad),dt);
    triggerMarkers();
  }
  ruleTick++;
  for(const ready of ruleQueue.takeReady(ruleTick,sceneGeneration))if(!finished)executeNode(ready.id,new Set(ready.seen),ready.generation);
  if(sessionRecording&&ruleTick%2===0)sessionSend("frame",{state:sessionCapture()});
}
function tick(time) {
  CORE.advanceSimulationClock(simulationClock,time,simulateTick);
  WORLD.draw(ctx,world,actor,VOXEL.actorVolume(rootPm.voxelAssets,pm,actor,ruleTick) || sprite(),{follow:true,background:"#aacbcc",tick:ruleTick});
  renderOverlay();requestAnimationFrame(tick);
}
window.addEventListener("keydown",event=>{
  if(sessionReplaying)return;
  if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space"].includes(event.code))event.preventDefault();
  if(event.repeat&&(event.code==="KeyE"||event.code==="Enter"||event.code==="KeyR"))return;
  if(event.code==="KeyR"){resetActor();event.preventDefault();return;}
  if(event.code==="KeyE"||event.code==="Enter"){advanceDialogue();event.preventDefault();return;}
  keys[event.code]=true;
});
window.addEventListener("keyup",event=>{keys[event.code]=false;});
window.addEventListener("blur",()=>{Object.keys(keys).forEach(key=>delete keys[key]);});
window.addEventListener("pagehide",()=>stopAudio(),{once:true});
canvas.addEventListener("pointerdown",event=>{drag={id:event.pointerId,x:event.clientX,y:event.clientY};canvas.setPointerCapture?.(event.pointerId);});
canvas.addEventListener("pointermove",event=>{
  if(!drag||drag.id!==event.pointerId)return;
  WORLD.orbit(world,(event.clientX-drag.x)*.012,(event.clientY-drag.y)*.008);
  drag.x=event.clientX;drag.y=event.clientY;
});
canvas.addEventListener("pointerup",event=>{if(drag?.id===event.pointerId){drag=null;canvas.releasePointerCapture?.(event.pointerId);}});
canvas.addEventListener("pointercancel",()=>{drag=null;});
canvas.addEventListener("wheel",event=>{event.preventDefault();world.cellSize=Math.max(16,Math.min(64,Math.round(world.cellSize*(event.deltaY>0?.9:1.1))));},{passive:false});
document.getElementById("left").onclick=()=>{WORLD.orbit(world,-Math.PI/6);canvas.focus();};
document.getElementById("right").onclick=()=>{WORLD.orbit(world,Math.PI/6);canvas.focus();};
document.getElementById("turntable").onclick=()=>{world.turntable=!world.turntable;updateTurntableButton();canvas.focus();};
document.getElementById("reset").onclick=()=>{resetActor();canvas.focus();};
document.getElementById("interact").onclick=()=>{advanceDialogue();canvas.focus();};
if(window.__PB_HYBRID_STATE__?.entry){
  const entry=window.__PB_HYBRID_STATE__.entry;
  if(Number.isFinite(Number(entry.x)))actor.x=Math.max(.3,Math.min(world.width-.3,Number(entry.x)));
  if(Number.isFinite(Number(entry.y)))actor.y=Math.max(0,Math.min(world.height,Number(entry.y)));
  if(Number.isFinite(Number(entry.z)))actor.z=Math.max(.3,Math.min(world.depth-.3,Number(entry.z)));
}
canvas.focus();updateTurntableButton();startSceneAudio();
const resume=window.__PB_HYBRID_STATE__?.resume;
if(resume)sessionApply(resume,window.__PB_HYBRID_STATE__?.replay===true);
else ruleEvent("sceneStart",{sceneId:currentSceneId});
sessionSend("ready",{sceneId:currentSceneId,state:sessionCapture()});
sessionStartStandalone();
requestAnimationFrame(tick);
</script></main></body></html>`;
}

  return Object.freeze({
    escapeScriptJson,
    buildTinyGameHtml
  });
});
