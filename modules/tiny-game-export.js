"use strict";

// Module bridge
(function attachTinyGameExport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugTinyGameExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTinyGameExport() {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[character]);
  }

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

// Game html
function buildTinyGameHtml(payload) {
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
</style>
</head>
<body>
<main class="wrap">
<h1>${escapeHtml(payload.title)}</h1>
<div class="stage"><canvas id="game" width="${payload.exportWidth}" height="${payload.exportHeight}" tabindex="0" aria-label="Tiny exported Pixel Bug game"></canvas></div>
<p class="help"><kbd>A</kbd>/<kbd>D</kbd> or arrows move. <kbd>W</kbd>/<kbd>Space</kbd> jumps. <kbd>E</kbd>/<kbd>Enter</kbd> advances dialogue. <kbd>R</kbd> returns to the latest checkpoint.</p>
</main>
<script>
const GAME = ${payloadJson};
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d", { alpha:false });
const rootPlayMode = GAME.playMode || {};
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
const keys = {};
const actor = { x:24, y:96, vx:0, vy:0, grounded:false, facing:1 };
let cameraX = 0;
let tick = 0;
let dialogueActive = false;
let dialogueContinuation = null;
let dialogueLine = 0;
let revealStart = 0;
let revealChars = 0;
let activeCharacterId = "";
let nodeMessageText = "";
let nodeMessageUntil = 0;
let nodeCheckpoint = rootPlayMode.checkpoint || null;
let sceneAudio = null;
let sceneAudioPending = false;
let sceneAudioGeneration = 0;
let runtimeAudioUnlocked = false;
let pendingEffectAudio = [];
let sceneRuleTransitionTimes = [];
const effectAudios = new Set();
const runtimeAudioAssets = Array.isArray(rootPlayMode.audioLibrary) ? rootPlayMode.audioLibrary : [];
const runtimeAudioMixer = Object.assign({ master:1, music:.85, sfx:1, muteMusic:false, muteSfx:false }, rootPlayMode.audioMixer || {});
let transitionCooldown = 0;
let gamepadInteractPressed = false;
let gameFinished = false;
let nodeEntered = new Set();
const nodeGraph = rootPlayMode.nodeEditor && Array.isArray(rootPlayMode.nodeEditor.nodes) ? rootPlayMode.nodeEditor : { nodes: [] };
const nodeVariables = { ...(rootPlayMode.variables || {}) };
let nodeInventory = [...new Set((rootPlayMode.inventory || []).map(item => String(item || "").trim()).filter(Boolean))].slice(0, 64);
function propOpen(prop) {
  const variable = String(prop && prop.openVariable || "");
  if (!variable) return false;
  const value = String(nodeVariables[variable] == null ? "" : nodeVariables[variable]).toLowerCase();
  return ["yes", "true", "open", "1"].includes(value);
}
function solidRuntimeProps() { return props.filter(prop => prop && prop.solid !== false && !prop.targetSceneId && !propOpen(prop)); }
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
function loadRuntimeScene(sceneId, announce = true) {
  const scene = runtimeScenes.find(item => item.id === sceneId);
  if (!scene) return false;
  currentSceneId = scene.id;
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
  dialogueActive = false;
  activeCharacterId = "";
  nodeEntered.clear();
  transitionCooldown = 24;
  startSceneAudio();
  if (announce) runNodeEvent("sceneStart", { sceneId:scene.id, sceneName:scene.name || "Scene" });
  return true;
}
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads || []).find(Boolean);
  if (!pad) return { left:false, right:false, jump:false, interact:false };
  return {
    left:Number(pad.axes?.[0] || 0) < -.35 || pad.buttons?.[14]?.pressed === true,
    right:Number(pad.axes?.[0] || 0) > .35 || pad.buttons?.[15]?.pressed === true,
    jump:pad.buttons?.[0]?.pressed === true || pad.buttons?.[12]?.pressed === true,
    interact:pad.buttons?.[1]?.pressed === true || pad.buttons?.[2]?.pressed === true
  };
}
function loadImages() {
  return Promise.all(Object.entries(GAME.frames || {}).map(([id, src]) => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { images[id] = img; resolve(); };
    img.onerror = resolve;
    img.src = src;
  })));
}
function scale() { return Math.max(0.5, Math.min(Number(pm.actorScale) || 3, 32)); }
function worldWidth() { return Math.max(canvas.width, Math.min(Number(pm.worldWidth) || Math.max(1600, canvas.width), 20000)); }
function groundY() { return Math.max(32, Math.min(Number(pm.groundY) || canvas.height - 48, canvas.height - 8)); }
function screenX(x) { return Math.round(x - cameraX); }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function expandedRect(rect, pad) { return { x:rect.x - pad, y:rect.y - pad, w:rect.w + pad * 2, h:rect.h + pad * 2 }; }
function clampActor() { const ar = actorRect(); actor.x = Math.max(0, Math.min(worldWidth() - ar.w, actor.x)); actor.y = Math.max(0, Math.min(groundY() - ar.h, actor.y)); }
// Camera update
function updateCamera() {
  const maxCameraX = Math.max(0, worldWidth() - canvas.width);
  const actorW = artW * scale();
  const actorCenter = actor.x + actorW / 2;
  const previousCameraX = cameraX;
  let target = cameraX;
  if (pm.cameraFollow !== false) {
    const viewLeft = cameraX;
    const viewRight = cameraX + canvas.width;
    const leftSafe = viewLeft + Math.max(44, canvas.width * 0.28);
    const rightSafe = viewRight - Math.max(44, canvas.width * 0.34);
    if (actorCenter < leftSafe) target = actorCenter - Math.max(44, canvas.width * 0.28);
    if (actorCenter > rightSafe) target = actorCenter - canvas.width + Math.max(44, canvas.width * 0.34);
    target = Math.max(0, Math.min(maxCameraX, target));
    cameraX += (target - cameraX) * 0.22;
  }
  if (pm.autoScroll === true) {
    const speed = Math.max(0, Number(pm.scrollSpeed) || 0);
    cameraX = Math.max(cameraX, Math.min(maxCameraX, cameraX + speed));
  }
  cameraX = Math.round(Math.max(0, Math.min(maxCameraX, cameraX)));
  if (pm.autoScroll === true) {
    const cameraDelta = cameraX - previousCameraX;
    if (cameraDelta > 0) actor.x = Math.max(0, Math.min(worldWidth() - actorW, actor.x + cameraDelta));
  }
}
function actorRect(x = actor.x, y = actor.y) { const s = scale(); return { x, y, w:artW * s, h:artH * s }; }
function propRect(prop) { const s = Math.max(1, Math.min(Number(prop.scale) || scale(), 16)); return { x:Number(prop.x) || 0, y:Number(prop.y) || 0, w:artW * s, h:artH * s }; }
function drawImageFrame(frame, x, y, w, h, flip = false) {
  const img = images[String(frame)];
  if (!img) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
  else ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}
function drawSceneBase() {
  ctx.fillStyle = GAME.sceneBackground || "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
function parallaxCameraX() {
  const speed = pm.autoScroll === true ? Math.max(0, Number(pm.scrollSpeed) || 0) : 0;
  return cameraX + tick * speed;
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
  sceneLayers.filter(layer => (layer.role || "background") === "background").forEach(drawLayer);
  const scenery = images[String(pm.sceneryFrame)];
  if (scenery) drawTiledImage(scenery, Number(pm.sceneryY) || 0, Math.max(0.5, Math.min(Number(pm.sceneryScale) || 3, 32)), Math.max(-4, Math.min(Number(pm.scenerySpeed) || 0.45, 4)), 1);
}
function drawLayers(role) { sceneLayers.filter(layer => (layer.role || "background") === role).forEach(drawLayer); }
function characters() { return (pm.dialogue && pm.dialogue.characters) || []; }
function lines() { return (pm.dialogue && pm.dialogue.lines) || []; }
function characterById(id) { return characters().find(c => c.id === id) || characters()[0] || {}; }
function textLineMessage(index) { const line = lines()[Math.max(0, Number(index) || 0)] || {}; return String(line.text || ""); }
function showNodeMessage(message, duration) { nodeMessageText = String(message || "").slice(0, 180); nodeMessageUntil = performance.now() + Math.max(800, Math.min(Number(duration) || 3600, 10000)); }
function startDialogueAtLine(index, onComplete) { dialogueContinuation = typeof onComplete === "function" ? onComplete : null; dialogueActive = true; activeCharacterId = "node-editor"; dialogueLine = Math.max(0, Math.min(Number(index) || 0, Math.max(0, lines().length - 1))); revealStart = performance.now(); revealChars = 0; }
function moveActorBy(dx, dy) { actor.x += Number(dx) || 0; actor.y += Number(dy) || 0; actor.vx = 0; actor.vy = 0; clampActor(); }
function setNodeCheckpoint() { nodeCheckpoint = { sceneId:currentSceneId, x:actor.x, y:actor.y }; showNodeMessage("Checkpoint set.", 1200); }
function resetActorToCheckpoint() { const cp = nodeCheckpoint; if (cp?.sceneId && cp.sceneId !== currentSceneId) loadRuntimeScene(cp.sceneId, false); const ar = actorRect(); dialogueContinuation = null; dialogueActive = false; activeCharacterId = ""; actor.x = cp && Number.isFinite(Number(cp.x)) ? Number(cp.x) : 24; actor.y = cp && Number.isFinite(Number(cp.y)) ? Number(cp.y) : groundY() - ar.h; actor.vx = 0; actor.vy = 0; actor.grounded = true; gameFinished = false; clampActor(); updateCamera(); }
// Node runtime
function nodeById(id) { return (nodeGraph.nodes || []).find(node => String(node.id) === String(id)); }
function compareNodeNumbers(left, operator, right) {
  if (operator === "=") return left === right;
  if (operator === "!=") return left !== right;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === ">") return left > right;
  return left >= right;
}
function allowSceneRuleTransition() {
  const now = performance.now();
  sceneRuleTransitionTimes = sceneRuleTransitionTimes.filter(time => now - time < 1000);
  if (sceneRuleTransitionTimes.length >= 12) return false;
  sceneRuleTransitionTimes.push(now);
  return true;
}
function executeNode(id, seen) {
  const node = nodeById(id);
  if (!node || seen.has(String(id)) || seen.size > 40) return;
  seen.add(String(id));
  const data = node.data || {};
  let nextId = node.next || "";
  let nextDelay = 0;
  if (node.type === "actionMessage") { showNodeMessage(Number(data.textLine) >= 0 ? textLineMessage(data.textLine) || data.message || node.name : data.message || node.name || "Message"); if (nextId) nextDelay = 1100; }
  if (node.type === "actionDialogue") { const dialogueNext = nextId; nextId = ""; startDialogueAtLine(data.line, dialogueNext ? () => executeNode(dialogueNext, seen) : null); }
  if (node.type === "actionCheckpoint") setNodeCheckpoint();
  if (node.type === "actionMoveActor") moveActorBy(data.dx, data.dy);
  if (node.type === "actionFinish") { showNodeMessage(data.message || "Finished."); gameFinished = true; nextId = ""; }
  if (node.type === "actionAddItem") {
    const item = String(data.item || "").trim().slice(0, 40);
    if (item && !nodeInventory.includes(item)) nodeInventory.push(item);
  }
  if (node.type === "actionRemoveItem") {
    const item = String(data.item || "").trim();
    nodeInventory = nodeInventory.filter(entry => entry !== item);
  }
  if (node.type === "actionScene") {
    nextId = "";
    if (data.sceneId && allowSceneRuleTransition()) loadRuntimeScene(data.sceneId, true);
    else if (data.sceneId) showNodeMessage("Scene transition loop stopped.", 2200);
  }
  if (node.type === "actionPlaySound") playRuntimeAudio(data.audioAssetId, data.audioVolume, data.audioLoop);
  if (node.type === "actionStopSound") stopRuntimeAudio(["all", "music", "sfx"].includes(data.audioStopScope) ? data.audioStopScope : "all");
  if (node.type === "actionSetVariable") nodeVariables[data.variable || "flag"] = String(data.value ?? "true");
  if (node.type === "actionChangeNumber") {
    const key = data.variable || "score";
    nodeVariables[key] = String((Number(nodeVariables[key]) || 0) + (Number(data.amount) || 0));
  }
  if (node.type === "logicVariable") nextId = String(nodeVariables[data.variable || "flag"] ?? "") === String(data.equals ?? "true") ? node.next : node.alt;
  if (node.type === "logicHasItem") nextId = nodeInventory.includes(String(data.item || "").trim()) ? node.next : node.alt;
  if (node.type === "logicCompareNumber") {
    const current = Number(nodeVariables[data.variable || "score"]) || 0;
    nextId = compareNodeNumbers(current, data.operator || ">=", Number(data.compare) || 0) ? node.next : node.alt;
  }
  if (nextId) window.setTimeout(() => executeNode(nextId, seen), nextDelay);
}
function runNodeEvent(type, payload) {
  (nodeGraph.nodes || []).filter(node => {
    if (type === "sceneStart") return node.type === "eventStart" && (!(node.data || {}).sceneId || String((node.data || {}).sceneId) === String(payload.sceneId || ""));
    if (type === "triggerEnter") {
      const choices = new Set(["any", payload.name, payload.id].concat(Array.isArray(payload.ids) ? payload.ids : []).map(item => String(item || "")));
      return node.type === "eventTrigger" && choices.has(String((node.data || {}).trigger || "any"));
    }
    if (type === "characterInteract") {
      const choices = new Set(["any", payload.name, payload.id].map(item => String(item || "")));
      return node.type === "eventInteract" && choices.has(String((node.data || {}).character || "any"));
    }
    return false;
  }).forEach(node => executeNode(node.next || "", new Set([String(node.id)])));
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
  const reach = Math.max(28, artW * scale());
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
  const slots = { left:0.24, center:0.5, right:0.76 };
  standaloneCharacters().forEach(character => {
    const sc = Math.max(1, Math.min(Number(character.scale) || 3, 16));
    const r = { x: worldWidth() * (slots[character.position] || 0.5) - (artW * sc) / 2, y: groundY() - artH * sc, w: artW * sc, h: artH * sc };
    if (!rectsOverlap(near, r)) return;
    const dist = Math.abs((r.x + r.w / 2) - (box.x + box.w / 2));
    if (dist < bestDist) { best = character; bestDist = dist; }
  });
  return best;
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
    const img = images[String(character.frame)];
    if (!img) return;
    const sc = Math.max(1, Math.min(Number(character.scale) || 3, 16));
    const w = artW * sc;
    const h = artH * sc;
    const worldX = worldWidth() * (slots[character.position] || 0.5) - w / 2;
    const x = screenX(worldX);
    const y = Math.round(ground - h);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (character.flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); }
    else ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  });
}
function runCharacterInteraction() {
  const character = activeInteractionCharacter();
  if (!character) return;
  const matching = (nodeGraph.nodes || []).filter(node => {
    if (node.type !== "eventInteract") return false;
    const target = String((node.data || {}).character || "any");
    return target === "any" || target === String(character.id) || target === String(character.name);
  });
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
  else { const complete = dialogueContinuation; dialogueContinuation = null; dialogueActive = false; activeCharacterId = ""; if (typeof complete === "function") window.setTimeout(complete, 0); }
}
function drawDialogue() {
  if (!dialogueActive || !lines().length) return;
  const line = lines()[dialogueLine] || {};
  const ch = characterById(line.characterId || activeCharacterId);
  const text = String(line.text || "");
  if ((pm.dialogue || {}).typewriter === false) revealChars = text.length;
  else revealChars = Math.min(text.length, Math.max(revealChars, Math.floor((performance.now() - revealStart) / 12)));
  const margin = Math.max(8, Math.round(canvas.width * (Number(ui.dialogueMargin) || .035)));
  const boxH = Math.max(72, Math.round(canvas.height * (Number(ui.dialogueBoxHeight) || .28)));
  const boxY = canvas.height - boxH - margin;
  const portrait = ui.dialoguePortrait !== false ? Math.max(44, Math.min(120, boxH - 28)) : 0;
  ctx.fillStyle = ui.dialogueBoxColor || "rgba(15,15,15,.94)";
  ctx.strokeStyle = ui.dialogueBorderColor || ui.dialogueInkColor || "#f7f0da";
  ctx.lineWidth = Math.max(0, Math.min(Number(ui.dialogueBorderWidth) || 4, 16));
  ctx.fillRect(margin, boxY, canvas.width - margin * 2, boxH);
  ctx.strokeRect(margin, boxY, canvas.width - margin * 2, boxH);
  if (ui.dialoguePortrait !== false) drawImageFrame(line.frame ?? ch.frame ?? 0, margin + 12, boxY + 14, portrait, portrait, false);
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
  props.forEach(prop => {
    ctx.globalAlpha = propOpen(prop) ? 0.28 : 1;
    drawImageFrame(prop.frame, screenX(Number(prop.x) || 0), Math.round(Number(prop.y) || 0), propRect(prop).w, propRect(prop).h);
  });
  ctx.globalAlpha = 1;
  drawSceneCharacters();
  ctx.globalAlpha = 1;
  const moving = Math.abs(actor.vx) > .08;
  const frame = !actor.grounded ? pm.jumpFrame : moving ? pm.walkFrame : pm.idleFrame;
  const ar = actorRect();
  drawImageFrame(frame, screenX(actor.x), Math.round(actor.y), ar.w, ar.h, actor.facing < 0);
  drawLayers("foreground");
  drawLayers("overlay");
  drawDialogue();
  drawNodeMessage();
}
function step() {
  const s = scale();
  const w = artW * s;
  const h = artH * s;
  const gamepad = readGamepad();
  const left = keys.ArrowLeft || keys.KeyA || gamepad.left;
  const right = keys.ArrowRight || keys.KeyD || gamepad.right;
  const jump = keys.Space || keys.ArrowUp || keys.KeyW || gamepad.jump;
  if (gamepad.interact && !gamepadInteractPressed) advanceDialogue();
  gamepadInteractPressed = gamepad.interact;
  if (gameFinished) { updateCamera(); draw(); requestAnimationFrame(step); return; }
  actor.vx = dialogueActive ? 0 : right && !left ? 3 : left && !right ? -3 : 0;
  if (actor.vx) actor.facing = actor.vx > 0 ? 1 : -1;
  if (jump && actor.grounded && !dialogueActive) { actor.vy = -8; actor.grounded = false; }
  actor.vy += .45;
  actor.grounded = false;
  actor.x = Math.max(0, Math.min(worldWidth() - w, actor.x + actor.vx));
  let box = actorRect();
  if (transitionCooldown > 0) transitionCooldown--;
  const portal = transitionCooldown <= 0 ? props.find(prop => prop?.targetSceneId && rectsOverlap(box, propRect(prop))) : null;
  if (portal && loadRuntimeScene(portal.targetSceneId, true)) { requestAnimationFrame(step); return; }
  solidRuntimeProps().forEach(prop => { const r = propRect(prop); if (!rectsOverlap(box, r)) return; if (actor.vx > 0) actor.x = r.x - w; if (actor.vx < 0) actor.x = r.x + r.w; actor.vx = 0; box = actorRect(); });
  actor.y += actor.vy;
  box = actorRect();
  solidRuntimeProps().forEach(prop => { const r = propRect(prop); if (!rectsOverlap(box, r)) return; if (actor.vy > 0) { actor.y = r.y - h; actor.grounded = true; } if (actor.vy < 0) actor.y = r.y + r.h; actor.vy = 0; box = actorRect(); });
  if (actor.y + h >= groundY()) { actor.y = groundY() - h; actor.vy = 0; actor.grounded = true; }
  updateCamera();
  tick++;
  syncNodeTriggers();
  draw();
  requestAnimationFrame(step);
}
canvas.addEventListener("pointerdown", unlockRuntimeAudio);
window.addEventListener("keydown", event => { unlockRuntimeAudio(); if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault(); if (event.code === "KeyR") { event.preventDefault(); resetActorToCheckpoint(); return; } if (event.code === "KeyE" || event.code === "Enter") { event.preventDefault(); advanceDialogue(); return; } keys[event.code] = true; });
window.addEventListener("keyup", event => { keys[event.code] = false; });
window.addEventListener("pagehide", () => stopRuntimeAudio("all"), { once:true });
loadImages().then(() => { if (runtimeScenes.length) loadRuntimeScene(currentSceneId, false); else startSceneAudio(); const h = artH * scale(); actor.y = groundY() - h; canvas.focus(); runNodeEvent("sceneStart", { sceneId:currentSceneId }); step(); });
</script>
</body>
</html>`;
}

  return Object.freeze({
    escapeScriptJson,
    buildTinyGameHtml
  });
});
