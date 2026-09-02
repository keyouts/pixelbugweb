"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const audio = require("../src/modules/audio-studio");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src", "renderer.js"), "utf8");
const recoveryWorkflow = fs.readFileSync(path.join(root, "src", "modules", "renderer", "recovery-workflow.js"), "utf8");
const exportRuntime = fs.readFileSync(path.join(root, "src", "modules", "tiny-game-export.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "src", "modules", "node-editor.js"), "utf8");
const styles = (fs.readFileSync(path.join(root, "src", "styles.css"), "utf8") + fs.readFileSync(path.join(root, "src", "styles-workspaces.css"), "utf8"));

// Audio helpers
test("audio helpers expose larger bounded storage", () => {
  assert.equal(audio.MAX_FILE_BYTES, 12 * 1024 * 1024);
  assert.equal(audio.MAX_PROJECT_AUDIO_BYTES, 48 * 1024 * 1024);
  assert.equal(audio.dataUrlByteLength("data:audio/wav;base64,AAAA"), 3);
});

test("audio helpers generate and edit bounded PCM", () => {
  const tone = audio.makeToneSamples({ waveform: "square", frequency: 440, duration: 0.1, sampleRate: 8000 });
  assert.equal(tone.sampleRate, 8000);
  assert.equal(tone.channels.length, 1);
  assert.equal(tone.channels[0].length, 800);
  const edited = audio.processPcm(tone, { start: 0.02, end: 0.08, rate: 2, reverse: true, fadeIn: 0.01, fadeOut: 0.01, normalize: true });
  assert.equal(edited.channels[0].length, 240);
  assert.ok(edited.channels[0].every(sample => Number.isFinite(sample) && sample >= -1 && sample <= 1));
});


// Waveform controls
test("waveform helpers map seeking and stretch handles", () => {
  assert.equal(audio.waveformTimeFromX(50, 100, 10), 5);
  assert.ok(Math.abs(audio.playbackRateFromX(50, 100) - 1) < 0.0001);
  assert.ok(Math.abs(audio.playbackRateFromX(0, 100) - 4) < 0.0001);
  assert.ok(Math.abs(audio.playbackRateFromX(100, 100) - 0.25) < 0.0001);
  const range = audio.normalizeEditorRange({ start: -2, end: 20, fadeIn: 8, fadeOut: 8, rate: 10 }, 5);
  assert.equal(range.start, 0);
  assert.equal(range.end, 5);
  assert.equal(range.rate, 4);
});

// Cue routing
test("Audio Studio exposes interactive transport and game cues", () => {
  const studio = fs.readFileSync(path.join(root, "src", "modules", "audio-studio.js"), "utf8");
  assert.match(studio, /waveformPointerDown/);
  assert.match(studio, /audio-preview-loop/);
  assert.match(studio, /audio-seek-range/);
  assert.match(studio, /audio-cue-scene-select/);
  assert.match(studio, /addEventListener\("click", \(\) => assignSceneAsset\(\)\)/);
  assert.match(studio, /createAudioAssignment/);
  assert.match(rules, /function createAudioAssignment/);
  assert.match(rules, /getAudioAssignments/);
});

// Wav encoding
test("audio edits encode as valid PCM WAV", () => {
  const tone = audio.makeToneSamples({ duration: 0.05, sampleRate: 8000 });
  const wav = audio.encodeWav(tone);
  const view = new DataView(wav);
  const text = offset => String.fromCharCode(...new Uint8Array(wav, offset, 4));
  assert.equal(text(0), "RIFF");
  assert.equal(text(8), "WAVE");
  assert.equal(text(36), "data");
  assert.equal(view.getUint16(20, true), 1);
});

// Studio layout
test("Audio Studio stays in a focused Play Mode workspace", () => {
  assert.ok(html.indexOf("audio-studio.js") < html.indexOf("renderer.js"));
  assert.match(renderer, /PixelBugAudioStudio\?\.mount/);
  assert.match(styles, /audio-studio-tabs/);
  assert.match(styles, /audio-studio-launcher-card/);
  assert.match(styles, /audio-waveform-frame/);
  assert.match(styles, /box-shadow: 7px 7px 0 var\(--ink\)/);
  assert.match(renderer, /projectAudioLimit/);
  assert.match(renderer, /MAX_LOCAL_AUTOSAVE_CHARS/);
  assert.match(recoveryWorkflow, /queueMirror\(payload\)/);
  assert.match(rules, /actionPlaySound/);
  assert.match(rules, /actionStopSound/);
  assert.match(exportRuntime, /playRuntimeAudio\(data\.audioAssetId/);
  assert.match(exportRuntime, /runtimeAudioMixer/);
});
