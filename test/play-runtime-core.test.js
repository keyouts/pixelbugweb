"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../src/modules/play-runtime-core.js");
const tinyGameExport = require("../src/modules/tiny-game-export.js");

// Runtime defaults
test("play runtime preserves legacy sixty hertz tuning", () => {
  const legacyDefaults = core.physics({});
  assert.equal(legacyDefaults.moveSpeed / core.REFERENCE_FPS, 3);
  assert.equal(legacyDefaults.jumpSpeed / core.REFERENCE_FPS, 8);
  assert.equal(legacyDefaults.gravity / (core.REFERENCE_FPS * core.REFERENCE_FPS), .45);
  const physics = core.physics({ moveSpeed:3, jumpStrength:8, gravity:.45, scrollSpeed:.35 });
  assert.equal(physics.moveSpeed / core.REFERENCE_FPS, 3);
  assert.equal(physics.jumpSpeed / core.REFERENCE_FPS, 8);
  assert.equal(physics.gravity / (core.REFERENCE_FPS * core.REFERENCE_FPS), .45);
  assert.equal(physics.scrollSpeed / core.REFERENCE_FPS, .35);
});

test("play runtime movement is display rate independent", () => {
  const physics = core.physics({ moveSpeed:3, jumpStrength:8, gravity:.45, scrollSpeed:.5 });
  function travel(rate) {
    let position = 0;
    let camera = 0;
    for (let index = 0; index < rate; index++) {
      position = core.advanceAxis(position, physics.moveSpeed, 1 / rate);
      camera = core.autoScroll(camera, 9999, physics.scrollSpeed, 1 / rate);
    }
    return { position, camera };
  }
  const at60 = travel(60);
  const at120 = travel(120);
  const at360 = travel(360);
  assert.ok(Math.abs(at60.position - at120.position) < 1e-9);
  assert.ok(Math.abs(at60.position - at360.position) < 1e-9);
  assert.ok(Math.abs(at60.camera - at120.camera) < 1e-9);
  assert.ok(Math.abs(at60.camera - at360.camera) < 1e-9);
  assert.ok(Math.abs(core.frameDelta(1002.78, 1000) - .00278) < 1e-9);
});

test("tiny game export embeds shared timing and cropped sprite runtime", () => {
  const html = tinyGameExport.buildTinyGameHtml({
    title:"Parity",
    exportWidth:320,
    exportHeight:240,
    artWidth:128,
    artHeight:128,
    sceneBackground:"#000",
    frames:{},
    spriteFrames:{ actor:{ 0:{ dataUrl:"data:image/png;base64,AAAA", sx:4, sy:6, sw:16, sh:24, scaleFactor:1 } }, object:{} },
    playMode:{ sceneWidth:320, sceneHeight:240, worldWidth:640, groundY:210, actorScale:2, idleFrame:0, walkFrame:0, jumpFrame:0, props:[], visualLayers:[], dialogue:{ characters:[], lines:[] }, nodeEditor:{ nodes:[] } },
    playUi:{}
  });
  assert.match(html, /CORE\.frameDelta/);
  assert.match(html, /CORE\.physics/);
  assert.match(html, /function spriteMetrics/);
  assert.match(html, /sourceWidth \* chosenScale \* factor/);
  assert.match(html, /function drawSpriteFrame/);
  assert.match(html, /transitionCooldownUntil/);
  assert.match(html, /portal\.targetX/);
  assert.match(html, /portal\.targetY/);
});
