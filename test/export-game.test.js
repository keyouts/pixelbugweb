"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const root = path.join(__dirname, "..");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const playRuntimeCore = fs.readFileSync(path.join(root, "src", "modules", "play-runtime-core.js"), "utf8");
const exportRuntime = fs.readFileSync(path.join(root, "src", "modules", "tiny-game-export.js"), "utf8");
const tinyGameExport = require(path.join(root, "src", "modules", "tiny-game-export.js"));
const rules = fs.readFileSync(path.join(root, "src", "modules", "node-editor.js"), "utf8");
const styles = (fs.readFileSync(path.join(root, "src", "styles.css"), "utf8") + fs.readFileSync(path.join(root, "src", "styles-workspaces.css"), "utf8"));

function exportBuilder() {
  return tinyGameExport.buildTinyGameHtml;
}

function samplePayload() {
  return {
    title: "Audio <Test>",
    exportWidth: 640,
    exportHeight: 360,
    artWidth: 16,
    artHeight: 16,
    sceneBackground: "#000000",
    playUi: {},
    frames: {},
    playMode: {
      activeSceneId: "scene-one",
      sceneWidth: 640,
      sceneHeight: 360,
      worldWidth: 960,
      groundY: 320,
      actorScale: 2,
      idleFrame: 0,
      walkFrame: 0,
      jumpFrame: 0,
      props: [],
      visualLayers: [],
      dialogue: { characters: [], lines: [] },
      inventory: ["key"],
      variables: { door: "closed" },
      audioLibrary: [
        { id: "theme", name: "Theme", kind: "music", dataUrl: "data:audio/wav;base64,AAAA", volume: 0.8 },
        { id: "bell", name: "Bell", kind: "sfx", dataUrl: "data:audio/wav;base64,AQID", volume: 0.5 }
      ],
      audioMixer: { master: 0.8, music: 0.75, sfx: 0.5, muteMusic: false, muteSfx: false },
      audio: { assetId: "theme", volume: 0.7, loop: true },
      scenes: [
        { id: "scene-one", name: "One", sceneWidth: 640, sceneHeight: 360, worldWidth: 960, groundY: 320, actorScale: 2, props: [], visualLayers: [], dialogue: { characters: [], lines: [] }, audio: { assetId: "theme", volume: 0.7, loop: true } },
        { id: "scene-two", name: "Two", sceneWidth: 320, sceneHeight: 240, worldWidth: 640, groundY: 210, actorScale: 2, props: [], visualLayers: [], dialogue: { characters: [], lines: [] }, audio: { assetId: "", volume: 1, loop: false } }
      ],
      nodeEditor: {
        nodes: [
          { id: "start", type: "eventStart", name: "Begin", next: "play", alt: "", data: { sceneId: "scene-one" } },
          { id: "play", type: "actionPlaySound", name: "Bell", next: "stop", alt: "", data: { audioAssetId: "bell", audioVolume: 0.6, audioLoop: false } },
          { id: "stop", type: "actionStopSound", name: "Stop", next: "", alt: "", data: { audioStopScope: "sfx" } }
        ]
      }
    }
  };
}


test("tiny game builder is isolated without output drift", () => {
  const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
  assert.ok(html.indexOf("tiny-game-export.js") < html.indexOf("renderer.js"));
  assert.match(renderer, /PixelBugTinyGameExport\?\.buildTinyGameHtml/);
  assert.match(renderer, /Tiny game export module is unavailable/);
  assert.doesNotMatch(renderer, /function escapeScriptJson/);
  const browserContext = {};
  vm.runInNewContext(playRuntimeCore, browserContext);
  vm.runInNewContext(exportRuntime, browserContext);
  assert.equal(typeof browserContext.PixelBugTinyGameExport?.buildTinyGameHtml, "function");
  const first = crypto.createHash("sha256").update(exportBuilder()(samplePayload())).digest("hex");
  const secondPayload = { ...samplePayload(), title: "A < B & \"C\"", exportWidth: 320, exportHeight: 240 };
  const second = crypto.createHash("sha256").update(exportBuilder()(secondPayload)).digest("hex");
  assert.equal(first, "b2cdde5bd284e1fe210cbe4a5bbc55bc1d41c974a946f181a3eb384a635a7cad");
  assert.equal(second, "3fd9f6b02385c92f0893f479451388f3c9c1974134db3a23a90a91f788151d57");
});

test("node map makes audio paths visible", () => {
  assert.match(rules, /function audioReachability/);
  assert.match(rules, /function audioRouteSignalElement/);
  assert.match(rules, /const leadsToAudio = audioPaths\.get\(target\.id\) === true/);
  assert.match(rules, /audioPath \? "audio-path-route"/);
  assert.match(rules, /line\.dataset\.audioPath = String\(audioPath\)/);
  assert.match(rules, /Leads to Audio/);
  assert.match(rules, /Waveform markers show the exact branches that lead to audio/);
  assert.match(styles, /\.node-editor-node\.audio-action/);
  assert.match(styles, /\.node-editor-node\.audio-path/);
  assert.match(styles, /\.node-editor-link-line\.audio-path-route/);
  assert.match(styles, /\.node-editor-link-audio-signal/);
  assert.match(styles, /--audio-route-height/);
});

test("audio path reachability distinguishes decision branches", () => {
  const start = rules.indexOf("function isAudioNode");
  const end = rules.indexOf("function audioWaveElement");
  assert.ok(start >= 0 && end > start);
  const context = {};
  vm.runInNewContext(`${rules.slice(start, end)}; this.audioReachability = audioReachability;`, context);
  const data = {
    nodes: [
      { id: "start", type: "eventStart", next: "check", alt: "" },
      { id: "check", type: "logicVariable", next: "sound", alt: "message" },
      { id: "sound", type: "actionPlaySound", next: "", alt: "" },
      { id: "message", type: "actionMessage", next: "", alt: "" }
    ]
  };
  const paths = context.audioReachability(data);
  assert.equal(paths.get("start"), true);
  assert.equal(paths.get("check"), true);
  assert.equal(paths.get("sound"), true);
  assert.equal(paths.get("message"), false);
  const check = data.nodes.find(node => node.id === "check");
  assert.equal(paths.get(check.next), true);
  assert.equal(paths.get(check.alt), false);
});

test("audio path reachability handles cycles consistently", () => {
  const start = rules.indexOf("function isAudioNode");
  const end = rules.indexOf("function audioWaveElement");
  const context = {};
  vm.runInNewContext(`${rules.slice(start, end)}; this.audioReachability = audioReachability;`, context);
  const data = {
    nodes: [
      { id: "a", type: "logicVariable", next: "b", alt: "sound" },
      { id: "b", type: "actionMessage", next: "a", alt: "" },
      { id: "sound", type: "actionPlaySound", next: "", alt: "" },
      { id: "quiet", type: "actionMessage", next: "", alt: "" }
    ]
  };
  const paths = context.audioReachability(data);
  assert.equal(paths.get("a"), true);
  assert.equal(paths.get("b"), true);
  assert.equal(paths.get("sound"), true);
  assert.equal(paths.get("quiet"), false);
  assert.match(rules, /signal\.style\.transform = `translate\(-50%, -50%\) rotate\(\$\{-angle\}deg\)`/);
});

test("tiny game export embeds a complete parseable runtime", () => {
  const html = exportBuilder()(samplePayload());
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /media-src data:/);
  assert.match(html, /function syncStageSize/);
  assert.match(html, /function unlockRuntimeAudio/);
  assert.match(html, /pendingEffectAudio/);
  assert.match(html, /width:min\(100%, 640px\)/);
  assert.match(html, /aspect-ratio:640 \/ 360/);
  assert.equal((html.match(/data:audio\/wav;base64,AAAA/g) || []).length, 1);
  assert.equal((html.match(/data:audio\/wav;base64,AQID/g) || []).length, 1);
  assert.match(html, /Audio &lt;Test&gt;/);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || "";
  assert.ok(script.length > 1000);
  assert.doesNotThrow(() => new vm.Script(script));
});

test("every rule type has an exported runtime path", () => {
  const typeBlock = rules.slice(rules.indexOf("const TYPES ="), rules.indexOf("const CONCEPTS ="));
  const types = [...typeBlock.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]+):/gm)].map(match => match[1]);
  assert.ok(types.length >= 18);
  types.forEach(type => {
    if (type === "eventStart") assert.match(exportRuntime, /node\.type === "eventStart"/);
    else if (type === "eventTrigger") assert.match(exportRuntime, /node\.type === "eventTrigger"/);
    else if (type === "eventInteract") assert.match(exportRuntime, /node\.type === "eventInteract"/);
    else assert.match(exportRuntime, new RegExp(`node\\.type === ["']${type}["']`), `${type} is missing from the exported runtime`);
  });
  assert.match(exportRuntime, /function allowSceneRuleTransition/);
  assert.match(exportRuntime, /effectAudios\.size >= 32/);
  ["loadRuntimeScene", "readGamepad", "resetActorToCheckpoint", "startDialogueAtLine", "stopRuntimeAudio", "playRuntimeAudio"].forEach(name => {
    assert.match(exportRuntime, new RegExp(`function ${name}\\(`));
  });
});


test("exported runtime survives blocked audio and scene changes", async () => {
  const payload = samplePayload();
  payload.playMode.nodeEditor.nodes.find(node => node.id === "play").next = "";
  payload.playMode.nodeEditor.nodes.push({ id: "item", type: "actionAddItem", name: "Coin", next: "", alt: "", data: { item: "coin" } });
  const html = exportBuilder()(payload);
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || "";
  const eventHandlers = {};
  const stage = { style: {} };
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    parentElement: stage,
    focus() {},
    addEventListener(type, handler) {
      (eventHandlers[type] ||= []).push(handler);
    },
    getContext() {
      return {
        imageSmoothingEnabled: false,
        setTransform() {},
        fillRect() {},
        strokeRect() {},
        drawImage() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        fillText() {},
        measureText(value) {
          return { width: String(value).length * 8 };
        }
      };
    }
  };
  class FakeAudio {
    static blocked = true;
    static instances = [];
    constructor(source) {
      this.src = source;
      this.paused = true;
      this.loop = false;
      this.volume = 1;
      this.dataset = {};
      this.listeners = {};
      this.playCalls = 0;
      FakeAudio.instances.push(this);
    }
    play() {
      this.playCalls += 1;
      if (FakeAudio.blocked) {
        this.paused = true;
        return Promise.reject(new Error("blocked"));
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute(name) {
      if (name === "src") this.src = "";
    }
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  }
  const context = {
    console,
    performance,
    setTimeout,
    clearTimeout,
    Promise,
    Set,
    Map,
    Math,
    Number,
    String,
    Array,
    Object,
    JSON,
    Date,
    Audio: FakeAudio,
    navigator: { getGamepads: () => [] },
    requestAnimationFrame: () => 0,
    Image: class {},
    document: { getElementById: id => id === "game" ? canvas : null },
    window: null
  };
  context.window = context;
  context.addEventListener = (type, handler) => {
    (eventHandlers[type] ||= []).push(handler);
  };
  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const before = JSON.parse(vm.runInContext("JSON.stringify({ sceneAudioPending, pending:pendingEffectAudio.length })", context));
  assert.equal(before.sceneAudioPending, true);
  assert.equal(before.pending, 1);
  FakeAudio.blocked = false;
  vm.runInContext("unlockRuntimeAudio(); executeNode('item', new Set())", context);
  await new Promise(resolve => setImmediate(resolve));
  const playing = JSON.parse(vm.runInContext("JSON.stringify({ unlocked:runtimeAudioUnlocked, effects:effectAudios.size, inventory:nodeInventory, scenePaused:sceneAudio && sceneAudio.paused })", context));
  assert.equal(playing.unlocked, true);
  assert.equal(playing.effects, 1);
  assert.deepEqual(playing.inventory, ["key", "coin"]);
  assert.equal(playing.scenePaused, false);
  vm.runInContext("stopRuntimeAudio('sfx'); loadRuntimeScene('scene-two', true)", context);
  const changed = JSON.parse(vm.runInContext("JSON.stringify({ effects:effectAudios.size, scene:currentSceneId, width:canvas.width, height:canvas.height, stageWidth:canvas.parentElement.style.width, ratio:canvas.parentElement.style.aspectRatio })", context));
  assert.equal(changed.effects, 0);
  assert.equal(changed.scene, "scene-two");
  assert.deepEqual([changed.width, changed.height], [320, 240]);
  assert.equal(changed.stageWidth, "min(100%, 320px)");
  assert.equal(changed.ratio, "320 / 240");
  FakeAudio.blocked = true;
  vm.runInContext("runtimeAudioUnlocked = false; playRuntimeAudio('bell', 1, false); stopRuntimeAudio('sfx'); loadRuntimeScene('scene-one', false); stopRuntimeAudio('music')", context);
  await new Promise(resolve => setImmediate(resolve));
  const cancelled = JSON.parse(vm.runInContext("JSON.stringify({ effects:effectAudios.size, pending:pendingEffectAudio.length, scenePending:sceneAudioPending })", context));
  assert.deepEqual(cancelled, { effects: 0, pending: 0, scenePending: false });
});
