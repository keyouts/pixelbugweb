// Audio studio
(() => {
  const MAX_ASSETS = 48;
  const MAX_FILE_BYTES = 12 * 1024 * 1024;
  const MAX_PROJECT_AUDIO_BYTES = 48 * 1024 * 1024;
  const MAX_AUDIO_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 256;
  const VALID_AUDIO_DATA = /^data:audio\/(?:wav|wave|x-wav|mpeg|mp3|ogg|webm|mp4|x-m4a);base64,[a-z0-9+/=]+$/i;
  const AUDIO_TYPES = /^(audio\/(?:mpeg|wav|x-wav|wave|ogg|webm|mp4|x-m4a))$/i;
  const AUDIO_EXTENSIONS = /\.(?:mp3|wav|wave|ogg|webm|m4a|mp4)$/i;

  function clamp(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(number, max)) : fallback;
  }

  function cleanId(value, fallback = "audio") {
    const clean = String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return clean || fallback;
  }

  function dataUrlByteLength(dataUrl) {
    const source = String(dataUrl || "");
    const comma = source.indexOf(",");
    if (comma < 0) return 0;
    const base64 = source.slice(comma + 1).replace(/\s+/g, "");
    if (!base64) return 0;
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
  }

  function normalizeAsset(asset = {}, index = 0) {
    const source = String(asset.dataUrl || "");
    const dataUrl = VALID_AUDIO_DATA.test(source) && source.length <= MAX_AUDIO_CHARS && dataUrlByteLength(source) <= MAX_FILE_BYTES ? source : "";
    return {
      id: cleanId(asset.id, `audio-${index + 1}`),
      name: String(asset.name || `Audio ${index + 1}`).replace(/\s+/g, " ").trim().slice(0, 64) || `Audio ${index + 1}`,
      kind: asset.kind === "music" ? "music" : "sfx",
      dataUrl,
      duration: clamp(asset.duration, 0, 0, 600),
      volume: clamp(asset.volume, 1, 0, 1),
      loop: asset.loop === true
    };
  }

  function normalizeMixer(mixer = {}) {
    return {
      master: clamp(mixer.master, 1, 0, 1),
      music: clamp(mixer.music, 0.85, 0, 1),
      sfx: clamp(mixer.sfx, 1, 0, 1),
      muteMusic: mixer.muteMusic === true,
      muteSfx: mixer.muteSfx === true
    };
  }

  function makeToneSamples(options = {}) {
    const sampleRate = Math.max(8000, Math.min(Number(options.sampleRate) || 44100, 96000));
    const duration = clamp(options.duration, 0.25, 0.05, 10);
    const frequency = clamp(options.frequency, 440, 20, 12000);
    const volume = clamp(options.volume, 0.45, 0, 1);
    const waveform = ["sine", "square", "triangle", "sawtooth", "noise"].includes(options.waveform) ? options.waveform : "sine";
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const output = new Float32Array(length);
    for (let index = 0; index < length; index++) {
      const phase = index / sampleRate * frequency;
      let sample = Math.sin(Math.PI * 2 * phase);
      if (waveform === "square") sample = sample >= 0 ? 1 : -1;
      if (waveform === "triangle") sample = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
      if (waveform === "sawtooth") sample = 2 * (phase - Math.floor(phase + 0.5));
      if (waveform === "noise") sample = Math.random() * 2 - 1;
      const attack = Math.min(1, index / Math.max(1, sampleRate * 0.008));
      const release = Math.min(1, (length - index - 1) / Math.max(1, sampleRate * 0.02));
      output[index] = sample * volume * Math.min(attack, release);
    }
    return { sampleRate, channels: [output] };
  }

  function processPcm(input = {}, options = {}) {
    const sampleRate = Math.max(8000, Math.min(Number(input.sampleRate) || 44100, 192000));
    const channels = Array.isArray(input.channels) && input.channels.length ? input.channels.map(channel => channel instanceof Float32Array ? channel : Float32Array.from(channel || [])) : [new Float32Array(1)];
    const sourceLength = Math.max(1, Math.min(...channels.map(channel => channel.length || 1)));
    const duration = sourceLength / sampleRate;
    const start = clamp(options.start, 0, 0, duration);
    const end = clamp(options.end, duration, start + 1 / sampleRate, duration);
    const gain = clamp(options.gain, 1, 0, 4);
    const rate = clamp(options.rate, 1, 0.25, 4);
    const reverse = options.reverse === true;
    const normalize = options.normalize === true;
    const startIndex = Math.max(0, Math.min(sourceLength - 1, Math.floor(start * sampleRate)));
    const endIndex = Math.max(startIndex + 1, Math.min(sourceLength, Math.ceil(end * sampleRate)));
    const trimmedLength = Math.max(1, endIndex - startIndex);
    const outputLength = Math.max(1, Math.round(trimmedLength / rate));
    const output = channels.map(channel => {
      const result = new Float32Array(outputLength);
      for (let index = 0; index < outputLength; index++) {
        const sourcePosition = startIndex + Math.min(trimmedLength - 1, index * rate);
        const low = Math.floor(sourcePosition);
        const high = Math.min(endIndex - 1, low + 1);
        const mix = sourcePosition - low;
        result[index] = (channel[low] || 0) * (1 - mix) + (channel[high] || 0) * mix;
      }
      if (reverse) result.reverse();
      return result;
    });
    let peak = 0;
    output.forEach(channel => channel.forEach(sample => { peak = Math.max(peak, Math.abs(sample)); }));
    const normalizedGain = normalize && peak > 0 ? Math.min(8, 0.96 / peak) : 1;
    const fadeIn = Math.floor(clamp(options.fadeIn, 0, 0, outputLength / sampleRate) * sampleRate);
    const fadeOut = Math.floor(clamp(options.fadeOut, 0, 0, outputLength / sampleRate) * sampleRate);
    output.forEach(channel => {
      for (let index = 0; index < channel.length; index++) {
        let envelope = 1;
        if (fadeIn > 0 && index < fadeIn) envelope = Math.min(envelope, index / fadeIn);
        if (fadeOut > 0 && index >= channel.length - fadeOut) envelope = Math.min(envelope, (channel.length - index - 1) / fadeOut);
        channel[index] = Math.max(-1, Math.min(1, channel[index] * gain * normalizedGain * Math.max(0, envelope)));
      }
    });
    return { sampleRate, channels: output, duration: outputLength / sampleRate };
  }

  function encodeWav(input = {}) {
    const sampleRate = Math.max(8000, Math.min(Number(input.sampleRate) || 44100, 192000));
    const channels = Array.isArray(input.channels) && input.channels.length ? input.channels.slice(0, 2) : [new Float32Array(1)];
    const length = Math.max(1, Math.min(...channels.map(channel => channel.length || 1)));
    const bytesPerSample = 2;
    const blockAlign = channels.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + length * blockAlign);
    const view = new DataView(buffer);
    const write = (offset, value) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
    write(0, "RIFF");
    view.setUint32(4, 36 + length * blockAlign, true);
    write(8, "WAVE");
    write(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels.length, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    write(36, "data");
    view.setUint32(40, length * blockAlign, true);
    let offset = 44;
    for (let index = 0; index < length; index++) {
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
        const sample = Math.max(-1, Math.min(1, Number(channels[channelIndex][index]) || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return buffer;
  }

  function arrayBufferToDataUrl(buffer, mime = "audio/wav") {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
    return `data:${mime};base64,${btoa(binary)}`;
  }

  function waveformTimeFromX(x, width, duration) {
    return clamp(Number(x) / Math.max(1, Number(width) || 1) * Math.max(0, Number(duration) || 0), 0, 0, Math.max(0, Number(duration) || 0));
  }

  function playbackRateFromDrag(initialRate, deltaX, referenceWidth) {
    const width = Math.max(24, Math.abs(Number(referenceWidth) || 160));
    const scale = Math.max(0.25, Math.min(4, 1 + Number(deltaX || 0) / width));
    return clamp(Number(initialRate) / scale, 1, 0.25, 4);
  }

  function playbackRateFromX(x, width) {
    const progress = Math.max(0, Math.min(1, Number(x) / Math.max(1, Number(width) || 1)));
    return clamp(2 ** (2 - progress * 4), 1, 0.25, 4);
  }

  function normalizeEditorRange(options = {}, duration = 1) {
    const length = Math.max(0.001, Number(duration) || 1);
    const start = clamp(options.start, 0, 0, Math.max(0, length - 0.001));
    const end = clamp(options.end, length, start + 0.001, length);
    const kept = Math.max(0.001, end - start);
    return {
      start,
      end,
      fadeIn: clamp(options.fadeIn, 0, 0, kept),
      fadeOut: clamp(options.fadeOut, 0, 0, kept),
      gain: clamp(options.gain, 1, 0, 4),
      rate: clamp(options.rate, 1, 0.25, 4),
      reverse: options.reverse === true,
      normalize: options.normalize !== false
    };
  }

  const helpers = Object.freeze({ MAX_ASSETS, MAX_FILE_BYTES, MAX_PROJECT_AUDIO_BYTES, MAX_AUDIO_CHARS, dataUrlByteLength, normalizeAsset, normalizeMixer, makeToneSamples, processPcm, encodeWav, cleanId, waveformTimeFromX, playbackRateFromDrag, playbackRateFromX, normalizeEditorRange });
  if (typeof module !== "undefined" && module.exports) module.exports = helpers;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let api = null;
  let selectedId = "";
  let audioContext = null;
  let previewSource = null;
  let previewGain = null;
  let previewBuffer = null;
  let previewSignature = "";
  let previewOffset = 0;
  let previewStartedAt = 0;
  let previewPlaying = false;
  let previewLoop = false;
  let previewFrame = 0;
  let previewLastDraw = 0;
  let waveformDrawToken = 0;
  let waveformMetrics = null;
  let waveformDrag = null;
  let editorAssetId = "";
  let effectPlayers = new Set();
  let overlayReturnFocus = null;
  let decodedCache = new Map();

  function state() {
    const appState = api?.getState?.();
    if (!appState?.playMode) return null;
    if (!Array.isArray(appState.playMode.audioLibrary)) appState.playMode.audioLibrary = [];
    appState.playMode.audioLibrary = appState.playMode.audioLibrary.slice(0, MAX_ASSETS).map(normalizeAsset);
    appState.playMode.audioMixer = normalizeMixer(appState.playMode.audioMixer);
    return appState.playMode;
  }

  function assets() {
    return state()?.audioLibrary || [];
  }

  function selectedAsset() {
    const list = assets();
    if (!list.some(asset => asset.id === selectedId)) selectedId = list[0]?.id || "";
    return list.find(asset => asset.id === selectedId) || null;
  }

  function uniqueId(name = "audio") {
    const base = cleanId(name, "audio");
    let id = base;
    let index = 2;
    const used = new Set(assets().map(asset => asset.id));
    while (used.has(id)) id = `${base}-${index++}`;
    return id;
  }

  function totalAudioBytes() {
    return assets().reduce((sum, asset) => sum + dataUrlByteLength(asset.dataUrl), 0);
  }

  function formatBytes(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value === 0) return "0 KB";
    if (value < 1024 * 1024) return `${Math.max(0.1, value / 1024).toFixed(value < 10240 ? 1 : 0)} KB`;
    return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }

  function projectHasRoom(dataUrl, replacedDataUrl = "") {
    return totalAudioBytes() - dataUrlByteLength(replacedDataUrl) + dataUrlByteLength(dataUrl) <= MAX_PROJECT_AUDIO_BYTES;
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const remainder = value - minutes * 60;
    return `${minutes}:${remainder.toFixed(value < 60 ? 1 : 0).padStart(value < 60 ? 4 : 2, "0")}`;
  }

  function themeColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function shell() {
    let overlay = document.getElementById("audio-studio-overlay");
    if (overlay) return overlay;
    const toolbar = document.querySelector(".play-stage-rail .play-toolbar");
    if (toolbar) {
      const launcher = document.createElement("section");
      launcher.id = "audio-studio-card";
      launcher.className = "play-toolbar-group audio-studio-launcher-card";
      launcher.innerHTML = `<div class="audio-studio-launch-head"><div><span class="play-mode-eyebrow">Sound Workspace</span><strong>Audio Studio</strong></div><span data-audio-status>Empty</span></div><p class="control-hint">Manage clips, waveform edits, mixer levels, and game cues.</p><div class="audio-studio-launch-stats" aria-live="polite"><div><strong data-audio-count>0</strong><span>Clips</span></div><div><strong data-audio-scene>—</strong><span>Scene</span></div></div><button id="open-audio-studio-btn" type="button">Open Audio Studio <span aria-hidden="true">→</span></button>`;
      toolbar.appendChild(launcher);
    }
    overlay = document.createElement("div");
    overlay.id = "audio-studio-overlay";
    overlay.className = "modal-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="modal-card audio-studio-large" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="audio-studio-title" aria-describedby="audio-studio-help"><div class="modal-head"><div><span class="play-mode-eyebrow">Play Mode</span><h2 id="audio-studio-title">Audio Studio</h2></div><button class="audio-studio-close" type="button" aria-label="Close Audio Studio">Close</button></div><p class="control-hint" id="audio-studio-help">Manage clips, edit waveforms, set mixer levels, and assign audio to scenes or events.</p><div class="audio-studio-tabs" role="tablist" aria-label="Audio Studio sections"><button aria-selected="true" data-audio-tab="library" role="tab" type="button">Library</button><button aria-selected="false" data-audio-tab="editor" role="tab" type="button">Waveform</button><button aria-selected="false" data-audio-tab="mixer" role="tab" type="button">Mixer</button><button aria-selected="false" data-audio-tab="scene" role="tab" type="button">Game Cues</button></div><div class="audio-studio-pages"><section data-audio-page="library"><div class="audio-studio-two-column"><div><div class="audio-studio-section-head"><h3>Sound Library</h3><span id="audio-storage-summary">0 MB of 48 MB used</span></div><p class="control-hint audio-import-limit">Up to 12 MB per clip · 48 MB per project</p><div class="stack-list audio-library-list" id="audio-library-list"></div><div class="button-row action-row"><label class="button-like" for="play-audio-file">Import Audio</label><input accept="audio/*" id="play-audio-file" type="file"/><button id="audio-duplicate-btn" type="button">Duplicate</button><button id="audio-delete-btn" type="button">Delete</button></div></div><div><div class="audio-studio-section-head"><h3>Create Tone</h3><span>Useful for pickups, buttons, and alerts</span></div><div class="play-grid"><label for="audio-tone-name">Name</label><input id="audio-tone-name" maxlength="64" type="text" value="Pickup"/><label for="audio-tone-wave">Wave</label><select id="audio-tone-wave"><option value="sine">Soft</option><option value="square">Retro</option><option value="triangle">Rounded</option><option value="sawtooth">Bright</option><option value="noise">Noise</option></select><label for="audio-tone-frequency">Pitch</label><input id="audio-tone-frequency" max="12000" min="20" step="1" type="number" value="660"/><label for="audio-tone-duration">Length</label><input id="audio-tone-duration" max="10" min="0.05" step="0.05" type="number" value="0.2"/></div><button id="audio-tone-create-btn" type="button">Create Tone</button></div></div></section><section data-audio-page="editor" hidden><div class="audio-studio-section-head"><h3>Interactive Waveform</h3><span>Drag handles, click to seek, then play</span></div><div class="audio-editor-layout"><div><div class="audio-waveform-frame"><div class="audio-waveform-head"><strong>Waveform</strong><span id="audio-waveform-meta">No clip selected</span></div><div class="audio-waveform-stage"><canvas id="audio-waveform" width="760" height="248" tabindex="0" aria-label="Interactive block waveform editor" aria-describedby="audio-waveform-description"></canvas><span class="sr-only" id="audio-waveform-description">Click to move the playhead. Drag IN and OUT to trim, FADE handles to shape volume, and STRETCH to change playback length. Press Space to play or pause.</span></div><div class="audio-waveform-ruler" aria-hidden="true"><span id="audio-waveform-start-label">0:00</span><span id="audio-waveform-result-label">Result 0:00</span><span id="audio-waveform-end-label">0:00</span></div></div><div class="audio-waveform-help"><span><b>IN / OUT</b> trim</span><span><b>FADE</b> soften edges</span><span><b>STRETCH</b> change length</span><span><b>CLICK</b> seek</span></div><div class="audio-transport" role="group" aria-label="Audio playback controls"><button id="audio-jump-start-btn" type="button" aria-label="Return to clip start">|◀</button><button id="audio-preview-btn" type="button" aria-label="Play clip">Play</button><button id="audio-stop-btn" type="button">Stop</button><label class="play-check"><input id="audio-preview-loop" type="checkbox"/> Loop</label><output id="audio-transport-time" aria-live="polite">0:00 / 0:00</output></div><input id="audio-seek-range" type="range" min="0" max="1" step="0.001" value="0" aria-label="Audio playhead position"/><div class="button-row action-row"><button id="audio-render-copy-btn" type="button">Save Edited Copy</button><button id="audio-reset-edit-btn" type="button">Reset Edits</button></div></div><div class="audio-editor-controls"><div class="play-grid"><label for="audio-asset-name">Clip Name</label><input id="audio-asset-name" maxlength="64" type="text"/><label for="audio-asset-kind">Type</label><select id="audio-asset-kind"><option value="sfx">Sound Effect</option><option value="music">Music</option></select><label for="audio-trim-start">Start</label><input id="audio-trim-start" min="0" step="0.01" type="number" value="0"/><label for="audio-trim-end">End</label><input id="audio-trim-end" min="0.01" step="0.01" type="number" value="1"/><label for="audio-fade-in">Fade In</label><input id="audio-fade-in" max="10" min="0" step="0.01" type="number" value="0"/><label for="audio-fade-out">Fade Out</label><input id="audio-fade-out" max="10" min="0" step="0.01" type="number" value="0"/><label for="audio-edit-gain">Gain</label><input id="audio-edit-gain" max="4" min="0" step="0.05" type="number" value="1"/><label for="audio-playback-rate">Stretch</label><input id="audio-playback-rate" max="4" min="0.25" step="0.05" type="number" value="1"/></div><label class="play-check"><input id="audio-reverse" type="checkbox"/> Reverse</label><label class="play-check"><input id="audio-normalize" checked type="checkbox"/> Normalize</label><p class="control-hint">Stretch below 1× makes the clip longer. Above 1× makes it shorter.</p></div></div></section><section data-audio-page="mixer" hidden><div class="audio-studio-section-head"><h3>Game Mixer</h3><span>Set master, music, and effects levels</span></div><div class="audio-mixer-grid"><label><span>Master</span><input id="audio-mixer-master" max="1" min="0" step="0.05" type="range"/><output id="audio-mixer-master-output"></output></label><label><span>Music</span><input id="audio-mixer-music" max="1" min="0" step="0.05" type="range"/><output id="audio-mixer-music-output"></output></label><label><span>Effects</span><input id="audio-mixer-sfx" max="1" min="0" step="0.05" type="range"/><output id="audio-mixer-sfx-output"></output></label></div><div class="button-row action-row"><label class="play-check"><input id="audio-mute-music" type="checkbox"/> Mute Music</label><label class="play-check"><input id="audio-mute-sfx" type="checkbox"/> Mute Effects</label></div></section><section data-audio-page="scene" hidden><div class="audio-cue-grid"><div class="audio-cue-panel"><div class="audio-studio-section-head"><h3>Scene Music</h3><span>Assign background audio to a scene</span></div><div class="play-grid"><label for="audio-cue-scene-select">Scene</label><select id="audio-cue-scene-select"></select><label for="play-audio-asset-select">Soundtrack</label><select id="play-audio-asset-select"></select><label for="play-audio-volume">Volume</label><input id="play-audio-volume" max="1" min="0" step="0.05" type="number" value="0.7"/><label for="play-audio-loop">Loop</label><label class="play-check"><input checked id="play-audio-loop" type="checkbox"/> Repeat soundtrack</label></div><div class="button-row action-row"><button id="audio-scene-apply-btn" type="button">Assign to Scene</button><button id="audio-scene-preview-btn" type="button">Preview</button><button id="play-audio-clear-btn" type="button">Clear</button></div></div><div class="audio-cue-panel"><div class="audio-studio-section-head"><h3>Event Sound</h3><span>Assign a clip to a rule event</span></div><div class="play-grid"><label for="audio-cue-event-type">When</label><select id="audio-cue-event-type"><option value="sceneStart">Scene Starts</option><option value="objectTouch">Player Touches Object</option><option value="characterInteract">Player Interacts</option></select><label id="audio-cue-target-label" for="audio-cue-target-select">Scene</label><select id="audio-cue-target-select"></select><label for="audio-cue-asset-select">Clip</label><select id="audio-cue-asset-select"></select><label for="audio-cue-volume">Volume</label><input id="audio-cue-volume" max="1" min="0" step="0.05" type="number" value="1"/><label for="audio-cue-loop">Loop</label><label class="play-check"><input id="audio-cue-loop" type="checkbox"/> Continue until Stop Audio</label></div><div class="button-row action-row"><button id="audio-cue-create-btn" type="button">Create Cue Rule</button><button id="audio-cue-preview-btn" type="button">Preview Clip</button><button id="audio-cue-open-rules-btn" type="button">Open Rules</button></div><p class="control-hint">Cue rules appear in the beginner rule outline and work in exported games.</p></div></div><div class="audio-cue-summary" id="audio-cue-summary" aria-live="polite"></div></section></div><div aria-live="polite" class="status-box audio-studio-status" id="audio-studio-status">Audio Studio ready.</div></div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function setStudioStatus(message) {
    const box = document.getElementById("audio-studio-status");
    if (box) box.textContent = String(message || "Audio Studio ready.");
    api?.setStatus?.(String(message || "Audio Studio ready."));
  }

  function setTab(name) {
    document.querySelectorAll("[data-audio-tab]").forEach(button => button.setAttribute("aria-selected", String(button.dataset.audioTab === name)));
    document.querySelectorAll("[data-audio-page]").forEach(page => { page.hidden = page.dataset.audioPage !== name; });
    if (name === "editor") drawWaveform();
  }

  function openStudio(tab = "library") {
    const overlay = shell();
    overlayReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    setTab(tab);
    render();
    overlay.querySelector(".audio-studio-large")?.focus();
  }

  function closeStudio() {
    stopPreview();
    const overlay = shell();
    overlay.hidden = true;
    overlayReturnFocus?.focus?.();
    overlayReturnFocus = null;
  }

  function getAudioContext() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function dataUrlBuffer(dataUrl) {
    const base64 = String(dataUrl || "").split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  }

  async function decodeAsset(asset) {
    if (!asset?.dataUrl) throw new Error("No audio data");
    if (decodedCache.has(asset.id) && decodedCache.get(asset.id).dataUrl === asset.dataUrl) return decodedCache.get(asset.id).buffer;
    const buffer = await getAudioContext().decodeAudioData(dataUrlBuffer(asset.dataUrl).slice(0));
    decodedCache.set(asset.id, { dataUrl: asset.dataUrl, buffer });
    return buffer;
  }

  function bufferToPcm(buffer) {
    const channels = [];
    for (let index = 0; index < Math.min(2, buffer.numberOfChannels); index++) channels.push(Float32Array.from(buffer.getChannelData(index)));
    return { sampleRate: buffer.sampleRate, channels };
  }

  function editorOptions(buffer) {
    const duration = buffer?.duration || selectedAsset()?.duration || 1;
    const value = id => document.getElementById(id)?.value;
    return normalizeEditorRange({
      start: value("audio-trim-start"),
      end: value("audio-trim-end"),
      fadeIn: value("audio-fade-in"),
      fadeOut: value("audio-fade-out"),
      gain: value("audio-edit-gain"),
      rate: value("audio-playback-rate"),
      reverse: document.getElementById("audio-reverse")?.checked === true,
      normalize: document.getElementById("audio-normalize")?.checked !== false
    }, duration);
  }

  function previewDuration() {
    return Math.max(0, Number(previewBuffer?.duration) || Number(waveformMetrics?.resultDuration) || 0);
  }

  function previewCurrentOffset() {
    const duration = previewDuration();
    if (!previewPlaying || !audioContext) return Math.max(0, Math.min(previewOffset, duration));
    const elapsed = Math.max(0, audioContext.currentTime - previewStartedAt);
    if (previewLoop && duration > 0) return elapsed % duration;
    return Math.max(0, Math.min(elapsed, duration));
  }

  function releasePreviewSource() {
    if (previewSource) {
      previewSource.onended = null;
      try { previewSource.stop(); } catch (_error) {}
      try { previewSource.disconnect(); } catch (_error) {}
      previewSource = null;
    }
    if (previewGain) {
      try { previewGain.disconnect(); } catch (_error) {}
      previewGain = null;
    }
  }

  function updateTransport(redraw = true) {
    const duration = previewDuration();
    const current = previewCurrentOffset();
    const time = document.getElementById("audio-transport-time");
    const seek = document.getElementById("audio-seek-range");
    const play = document.getElementById("audio-preview-btn");
    if (time) time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (seek) {
      seek.max = String(Math.max(0.001, duration));
      seek.value = String(Math.max(0, Math.min(current, duration)));
    }
    if (play) {
      play.textContent = previewPlaying ? "Pause" : "Play";
      play.setAttribute("aria-label", previewPlaying ? "Pause clip" : "Play clip");
      play.setAttribute("aria-pressed", String(previewPlaying));
    }
    if (redraw) drawWaveform();
  }

  function stopPreview(reset = true) {
    releasePreviewSource();
    previewPlaying = false;
    if (reset) previewOffset = 0;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    updateTransport();
  }

  function pausePreview() {
    if (!previewPlaying) return;
    previewOffset = previewCurrentOffset();
    releasePreviewSource();
    previewPlaying = false;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    updateTransport();
    setStudioStatus("Preview paused.");
  }

  function animatePreview(timestamp = 0) {
    if (!previewPlaying) return;
    const duration = previewDuration();
    const current = previewCurrentOffset();
    if (!previewLoop && duration > 0 && current >= duration) {
      stopPreview(false);
      previewOffset = duration;
      updateTransport();
      return;
    }
    const redraw = timestamp - previewLastDraw >= 40;
    if (redraw) previewLastDraw = timestamp;
    updateTransport(redraw);
    previewFrame = requestAnimationFrame(animatePreview);
  }

  async function preparePreviewBuffer() {
    const asset = selectedAsset();
    if (!asset) throw new Error("No clip");
    const buffer = await decodeAsset(asset);
    const options = editorOptions(buffer);
    const signature = `${asset.id}:${asset.dataUrl.length}:${JSON.stringify(options)}`;
    if (previewBuffer && previewSignature === signature) return previewBuffer;
    const processed = processPcm(bufferToPcm(buffer), options);
    const context = getAudioContext();
    const nextBuffer = context.createBuffer(processed.channels.length, processed.channels[0].length, processed.sampleRate);
    processed.channels.forEach((channel, index) => nextBuffer.copyToChannel(channel, index));
    previewBuffer = nextBuffer;
    previewSignature = signature;
    previewOffset = Math.min(previewOffset, nextBuffer.duration);
    updateTransport(false);
    return nextBuffer;
  }

  async function playPreviewFrom(offset = previewOffset) {
    const asset = selectedAsset();
    if (!asset) { setStudioStatus("Choose or create a clip first."); return false; }
    try {
      const buffer = await preparePreviewBuffer();
      const duration = Math.max(0.001, buffer.duration);
      const startOffset = Math.max(0, Math.min(Number(offset) || 0, Math.max(0, duration - 0.001)));
      releasePreviewSource();
      const context = getAudioContext();
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = document.getElementById("audio-preview-loop")?.checked === true;
      previewLoop = source.loop;
      source.connect(gain).connect(context.destination);
      const mixer = normalizeMixer(state()?.audioMixer);
      const bus = asset.kind === "music" ? (mixer.muteMusic ? 0 : mixer.music) : (mixer.muteSfx ? 0 : mixer.sfx);
      gain.gain.setValueAtTime(clamp(asset.volume, 1, 0, 1) * mixer.master * bus, context.currentTime);
      previewOffset = startOffset;
      previewStartedAt = context.currentTime - startOffset;
      previewPlaying = true;
      previewSource = source;
      previewGain = gain;
      source.onended = () => {
        if (previewSource !== source || previewLoop) return;
        previewOffset = duration;
        previewPlaying = false;
        releasePreviewSource();
        updateTransport();
      };
      source.start(context.currentTime, startOffset);
      if (previewFrame) cancelAnimationFrame(previewFrame);
      previewFrame = requestAnimationFrame(animatePreview);
      updateTransport();
      setStudioStatus(`Playing ${asset.name}.`);
      return true;
    } catch (_error) {
      setStudioStatus("This clip could not be played.");
      return false;
    }
  }

  async function previewSelected() {
    if (previewPlaying) { pausePreview(); return true; }
    const duration = previewDuration();
    if (duration && previewOffset >= duration - 0.001) previewOffset = 0;
    return playPreviewFrom(previewOffset);
  }

  async function seekPreview(offset) {
    const wasPlaying = previewPlaying;
    previewOffset = Math.max(0, Math.min(Number(offset) || 0, previewDuration()));
    if (wasPlaying) await playPreviewFrom(previewOffset);
    else updateTransport();
  }

  async function renderEditedCopy() {
    const asset = selectedAsset();
    if (!asset) { setStudioStatus("Choose a clip first."); return; }
    if (assets().length >= MAX_ASSETS) { setStudioStatus("The audio library is full."); return; }
    try {
      const buffer = await decodeAsset(asset);
      const processed = processPcm(bufferToPcm(buffer), editorOptions(buffer));
      const dataUrl = arrayBufferToDataUrl(encodeWav(processed));
      if (dataUrlByteLength(dataUrl) > MAX_FILE_BYTES) { setStudioStatus("The edited WAV is larger than the 12 MB clip limit. Shorten it or increase its speed."); return; }
      if (!projectHasRoom(dataUrl)) { setStudioStatus("The 48 MB project audio limit would be exceeded."); return; }
      const nameInput = document.getElementById("audio-asset-name");
      const copy = normalizeAsset({ id: uniqueId(`${nameInput?.value || asset.name}-edit`), name: `${nameInput?.value || asset.name} Edit`, kind: document.getElementById("audio-asset-kind")?.value || asset.kind, dataUrl, duration: processed.duration, volume: asset.volume, loop: asset.loop }, assets().length);
      state().audioLibrary.push(copy);
      selectedId = copy.id;
      decodedCache.delete(copy.id);
      api?.saveLocal?.();
      render();
      setStudioStatus(`Saved ${copy.name}.`);
    } catch (_error) {
      setStudioStatus("The edited copy could not be created.");
    }
  }

  async function addDataAsset(dataUrl, name, kind = "auto", assignToScene = false) {
    const pm = state();
    if (!pm) return false;
    if (pm.audioLibrary.length >= MAX_ASSETS) { setStudioStatus("The audio library is full."); return false; }
    if (!VALID_AUDIO_DATA.test(String(dataUrl || ""))) { setStudioStatus("That audio format is not supported."); return false; }
    if (dataUrlByteLength(dataUrl) > MAX_FILE_BYTES) { setStudioStatus("Audio clips must be 12 MB or smaller."); return false; }
    if (!projectHasRoom(dataUrl)) { setStudioStatus("The 48 MB project audio limit would be exceeded."); return false; }
    const asset = normalizeAsset({ id: uniqueId(name), name, kind, dataUrl }, pm.audioLibrary.length);
    try {
      const buffer = await decodeAsset(asset);
      asset.duration = clamp(buffer.duration, 0, 0, 600);
      if (kind === "auto") asset.kind = asset.duration > 8 ? "music" : "sfx";
    } catch (_error) {
      setStudioStatus("That audio file could not be decoded.");
      return false;
    }
    pm.audioLibrary.push(asset);
    selectedId = asset.id;
    if (assignToScene) assignSceneAsset(asset.id);
    api?.saveLocal?.();
    render();
    window.PixelBugNodeEditor?.render?.();
    setStudioStatus(`${asset.name} added to the project.`);
    return true;
  }

  function importFile(file, options = {}) {
    if (!file) return false;
    if (file.size > MAX_FILE_BYTES) { setStudioStatus("Audio files must be 12 MB or smaller."); return false; }
    if (!(AUDIO_TYPES.test(String(file.type || "")) || AUDIO_EXTENSIONS.test(String(file.name || "")))) { setStudioStatus("Choose a WAV, MP3, OGG, WebM, M4A, or MP4 audio file."); return false; }
    const reader = new FileReader();
    reader.onload = () => addDataAsset(String(reader.result || ""), String(file.name || "Audio").replace(/\.[^.]+$/, "").slice(0, 64), options.kind || "auto", options.assignToScene === true);
    reader.onerror = () => setStudioStatus("The audio file could not be read.");
    reader.readAsDataURL(file);
    return true;
  }

  function createTone() {
    const name = String(document.getElementById("audio-tone-name")?.value || "Tone").trim().slice(0, 64) || "Tone";
    const pcm = makeToneSamples({ waveform: document.getElementById("audio-tone-wave")?.value, frequency: document.getElementById("audio-tone-frequency")?.value, duration: document.getElementById("audio-tone-duration")?.value });
    addDataAsset(arrayBufferToDataUrl(encodeWav(pcm)), name, "sfx", false);
  }

  function duplicateAsset() {
    const asset = selectedAsset();
    if (!asset) return;
    if (assets().length >= MAX_ASSETS) { setStudioStatus("The audio library is full."); return; }
    if (!projectHasRoom(asset.dataUrl)) { setStudioStatus("The 48 MB project audio limit would be exceeded."); return; }
    const copy = normalizeAsset({ ...asset, id: uniqueId(`${asset.name}-copy`), name: `${asset.name} Copy` }, assets().length);
    state().audioLibrary.push(copy);
    selectedId = copy.id;
    api?.saveLocal?.();
    render();
    setStudioStatus(`${copy.name} created.`);
  }

  function deleteAsset() {
    const asset = selectedAsset();
    if (!asset) return;
    stopPreview();
    const pm = state();
    pm.audioLibrary = pm.audioLibrary.filter(item => item.id !== asset.id);
    if (pm.audio?.assetId === asset.id) pm.audio = { assetId: "", name: "", dataUrl: "", volume: pm.audio.volume ?? 0.7, loop: true };
    (pm.scenes || []).forEach(scene => { if (scene.audio?.assetId === asset.id) scene.audio = { assetId: "", name: "", dataUrl: "", volume: scene.audio.volume ?? 0.7, loop: true }; });
    selectedId = pm.audioLibrary[0]?.id || "";
    decodedCache.delete(asset.id);
    api?.saveLocal?.();
    render();
    window.PixelBugNodeEditor?.render?.();
    setStudioStatus(`${asset.name} deleted.`);
  }

  function sceneOptions() {
    const list = api?.getSceneOptions?.() || [];
    return list.length ? list : [{ id: state()?.activeSceneId || "scene-main", name: "Current Scene" }];
  }

  function sceneAudioRecord(sceneId) {
    const pm = state();
    if (!pm) return { assetId: "", name: "", dataUrl: "", volume: 0.7, loop: true };
    if (String(sceneId) === String(pm.activeSceneId)) return pm.audio || { assetId: "", name: "", dataUrl: "", volume: 0.7, loop: true };
    return (pm.scenes || []).find(scene => String(scene.id) === String(sceneId))?.audio || { assetId: "", name: "", dataUrl: "", volume: 0.7, loop: true };
  }

  function writeSceneAudio(sceneId, record) {
    const pm = state();
    if (!pm) return false;
    if (String(sceneId) === String(pm.activeSceneId)) {
      pm.audio = record;
      api?.capturePlayScene?.();
      api?.syncSceneAudio?.();
      return true;
    }
    const scene = (pm.scenes || []).find(item => String(item.id) === String(sceneId));
    if (!scene) return false;
    scene.audio = record;
    return true;
  }

  function assignSceneAsset(assetOverride = null, sceneOverride = null) {
    const sceneId = sceneOverride || document.getElementById("audio-cue-scene-select")?.value || state()?.activeSceneId;
    const assetId = assetOverride == null ? document.getElementById("play-audio-asset-select")?.value || "" : String(assetOverride || "");
    const asset = assets().find(item => item.id === assetId);
    const volume = clamp(document.getElementById("play-audio-volume")?.value, 0.7, 0, 1);
    const loop = document.getElementById("play-audio-loop")?.checked !== false;
    const record = asset ? { assetId: asset.id, name: asset.name, dataUrl: "", volume, loop } : { assetId: "", name: "", dataUrl: "", volume, loop };
    if (!writeSceneAudio(sceneId, record)) { setStudioStatus("That scene is no longer available."); return; }
    api?.saveLocal?.();
    render();
    const sceneName = sceneOptions().find(scene => scene.id === sceneId)?.name || "scene";
    setStudioStatus(asset ? `${asset.name} assigned to ${sceneName}.` : `${sceneName} soundtrack cleared.`);
  }

  function clearSceneAudio() {
    const sceneId = document.getElementById("audio-cue-scene-select")?.value || state()?.activeSceneId;
    const record = sceneAudioRecord(sceneId);
    writeSceneAudio(sceneId, { assetId: "", name: "", dataUrl: "", volume: clamp(record.volume, 0.7, 0, 1), loop: true });
    api?.saveLocal?.();
    render();
    setStudioStatus("Scene audio cleared.");
  }

  function cueTargetOptions(eventType) {
    if (eventType === "objectTouch") return (api?.getNodeTriggerOptions?.() || []).map(item => ({ id: item.id, label: item.label || item.id }));
    if (eventType === "characterInteract") return (api?.getInteractionCharacterOptions?.() || []).map(item => ({ id: item.id, label: item.label || item.name || item.id }));
    return sceneOptions().map(item => ({ id: item.id, label: item.name || item.id }));
  }

  function renderCueTargets() {
    const eventType = document.getElementById("audio-cue-event-type")?.value || "sceneStart";
    const target = document.getElementById("audio-cue-target-select");
    const label = document.getElementById("audio-cue-target-label");
    if (label) label.textContent = eventType === "objectTouch" ? "Object" : eventType === "characterInteract" ? "Character" : "Scene";
    if (!target) return;
    const previous = target.value;
    target.innerHTML = "";
    const options = cueTargetOptions(eventType);
    options.forEach(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      target.appendChild(option);
    });
    if (options.some(item => item.id === previous)) target.value = previous;
    if (!options.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = eventType === "objectTouch" ? "Place an object first" : eventType === "characterInteract" ? "Add a character first" : "No scenes available";
      target.appendChild(option);
    }
  }

  function createCueRule() {
    const eventType = document.getElementById("audio-cue-event-type")?.value || "sceneStart";
    const targetSelect = document.getElementById("audio-cue-target-select");
    const audioSelect = document.getElementById("audio-cue-asset-select");
    const target = targetSelect?.value || "";
    const audioAssetId = audioSelect?.value || "";
    const targetLabel = targetSelect?.selectedOptions?.[0]?.textContent || target;
    const audioLabel = audioSelect?.selectedOptions?.[0]?.textContent || "Sound";
    if (!target) { setStudioStatus("Choose a scene, object, or character first."); return; }
    if (!audioAssetId) { setStudioStatus("Choose a clip first."); return; }
    const options = {
      eventType,
      target,
      targetLabel,
      audioAssetId,
      audioLabel,
      volume: clamp(document.getElementById("audio-cue-volume")?.value, 1, 0, 1),
      loop: document.getElementById("audio-cue-loop")?.checked === true
    };
    closeStudio();
    window.setTimeout(() => window.PixelBugNodeEditor?.createAudioAssignment?.(options), 0);
  }

  function renderCueSummary() {
    const summary = document.getElementById("audio-cue-summary");
    if (!summary) return;
    summary.innerHTML = "";
    const assignments = window.PixelBugNodeEditor?.getAudioAssignments?.() || [];
    const heading = document.createElement("div");
    heading.className = "audio-studio-section-head";
    const title = document.createElement("h3");
    title.textContent = "Cue Rules";
    const count = document.createElement("span");
    count.textContent = `${assignments.length} assigned`;
    heading.append(title, count);
    summary.appendChild(heading);
    if (!assignments.length) {
      const empty = document.createElement("p");
      empty.className = "control-hint";
      empty.textContent = "No event sounds yet. Create one above or use Play Sound in the Rule Editor.";
      summary.appendChild(empty);
      return;
    }
    const list = document.createElement("div");
    list.className = "stack-list audio-cue-list";
    assignments.slice(0, 24).forEach(item => {
      const asset = assets().find(entry => entry.id === item.audioAssetId);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "audio-cue-row";
      row.textContent = `${item.eventName || "Game event"} → ${asset?.name || "Missing clip"}${item.loop ? " · Loop" : ""}`;
      row.addEventListener("click", () => { closeStudio(); window.setTimeout(() => window.PixelBugNodeEditor?.openOverlay?.(), 0); });
      list.appendChild(row);
    });
    summary.appendChild(list);
  }

  function effectiveVolume(asset, volume = 1) {
    const mixer = normalizeMixer(state()?.audioMixer);
    const bus = asset.kind === "music" ? (mixer.muteMusic ? 0 : mixer.music) : (mixer.muteSfx ? 0 : mixer.sfx);
    return clamp(volume, 1, 0, 1) * clamp(asset.volume, 1, 0, 1) * mixer.master * bus;
  }

  function playAsset(assetId, options = {}) {
    const asset = assets().find(item => item.id === assetId);
    if (!asset?.dataUrl) return false;
    const element = new Audio(asset.dataUrl);
    element.loop = options.loop === true || (options.loop == null && asset.loop === true);
    element.volume = Math.max(0, Math.min(effectiveVolume(asset, options.volume), 1));
    element.dataset.audioKind = asset.kind === "music" ? "music" : "sfx";
    effectPlayers.add(element);
    const cleanup = () => effectPlayers.delete(element);
    element.addEventListener("ended", cleanup, { once: true });
    element.addEventListener("error", cleanup, { once: true });
    element.play().catch(cleanup);
    return true;
  }

  function stopGameAudio(scope = "all") {
    effectPlayers.forEach(element => {
      if (scope !== "all" && element.dataset.audioKind !== scope) return;
      element.pause();
      element.removeAttribute("src");
      effectPlayers.delete(element);
    });
    if (scope === "all" || scope === "music") api?.stopSceneAudio?.();
    return true;
  }

  function renderLibrary() {
    const list = document.getElementById("audio-library-list");
    const storage = document.getElementById("audio-storage-summary");
    if (storage) storage.textContent = `${formatBytes(totalAudioBytes())} of 48 MB used`;
    if (!list) return;
    list.innerHTML = "";
    assets().forEach(asset => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `audio-library-item${asset.id === selectedId ? " active" : ""}`;
      button.setAttribute("aria-pressed", String(asset.id === selectedId));
      button.innerHTML = `<span><strong>${String(asset.name).replace(/[&<>]/g, match => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" }[match]))}</strong><small>${asset.kind === "music" ? "Music" : "Sound Effect"} · ${asset.duration ? `${asset.duration.toFixed(2)}s` : "Unknown length"}</small></span><span aria-hidden="true">${asset.kind === "music" ? "♫" : "♪"}</span>`;
      button.onclick = () => { selectedId = asset.id; render(); };
      list.appendChild(button);
    });
    if (!assets().length) list.innerHTML = `<p class="control-hint">Import audio or create a tone to begin.</p>`;
  }

  function setEditorValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function invalidatePreview(reset = true) {
    releasePreviewSource();
    previewPlaying = false;
    previewBuffer = null;
    previewSignature = "";
    if (reset) previewOffset = 0;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = 0;
    updateTransport(false);
  }

  function resetEditor() {
    const asset = selectedAsset();
    if (!asset) return;
    setEditorValue("audio-trim-start", 0);
    setEditorValue("audio-trim-end", Math.max(0.01, asset.duration || 1));
    setEditorValue("audio-fade-in", 0);
    setEditorValue("audio-fade-out", 0);
    setEditorValue("audio-edit-gain", 1);
    setEditorValue("audio-playback-rate", 1);
    const reverse = document.getElementById("audio-reverse");
    const normalize = document.getElementById("audio-normalize");
    if (reverse) reverse.checked = false;
    if (normalize) normalize.checked = true;
    invalidatePreview();
    drawWaveform();
    setStudioStatus("Clip edits reset.");
  }

  function editorInputChanged() {
    invalidatePreview();
    drawWaveform();
  }

  function canvasPoint(event) {
    const canvas = document.getElementById("audio-waveform");
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / Math.max(1, rect.height)))
    };
  }

  function sourceTimeToPreview(sourceTime, metrics = waveformMetrics) {
    if (!metrics) return 0;
    const kept = Math.max(0.001, metrics.trimEnd - metrics.trimStart);
    const progress = metrics.reverse ? (metrics.trimEnd - sourceTime) / kept : (sourceTime - metrics.trimStart) / kept;
    return Math.max(0, Math.min(metrics.resultDuration, progress * metrics.resultDuration));
  }

  function previewTimeToSource(previewTime, metrics = waveformMetrics) {
    if (!metrics) return 0;
    const progress = Math.max(0, Math.min(1, Number(previewTime) / Math.max(0.001, metrics.resultDuration)));
    const kept = metrics.trimEnd - metrics.trimStart;
    return metrics.reverse ? metrics.trimEnd - kept * progress : metrics.trimStart + kept * progress;
  }

  async function seekFromCanvasX(x) {
    if (!waveformMetrics) return;
    const sourceTime = Math.max(waveformMetrics.trimStart, Math.min(waveformTimeFromX(x, waveformMetrics.width, waveformMetrics.duration), waveformMetrics.trimEnd));
    await seekPreview(sourceTimeToPreview(sourceTime));
  }

  function applyWaveformDrag(point) {
    const metrics = waveformMetrics;
    const drag = waveformDrag;
    if (!metrics || !drag) return;
    const time = waveformTimeFromX(point.x, metrics.width, metrics.duration);
    if (drag.mode === "trimStart") {
      const next = Math.max(0, Math.min(time, drag.initialEnd - 0.01));
      setEditorValue("audio-trim-start", next);
      const kept = drag.initialEnd - next;
      setEditorValue("audio-fade-in", Math.min(drag.initialFadeIn, kept));
      setEditorValue("audio-fade-out", Math.min(drag.initialFadeOut, kept));
    }
    if (drag.mode === "trimEnd") {
      const next = Math.max(drag.initialStart + 0.01, Math.min(time, metrics.duration));
      setEditorValue("audio-trim-end", next);
      const kept = next - drag.initialStart;
      setEditorValue("audio-fade-in", Math.min(drag.initialFadeIn, kept));
      setEditorValue("audio-fade-out", Math.min(drag.initialFadeOut, kept));
    }
    if (drag.mode === "fadeIn") setEditorValue("audio-fade-in", Math.max(0, Math.min(time - drag.initialStart, drag.initialEnd - drag.initialStart)));
    if (drag.mode === "fadeOut") setEditorValue("audio-fade-out", Math.max(0, Math.min(drag.initialEnd - time, drag.initialEnd - drag.initialStart)));
    if (drag.mode === "stretch") setEditorValue("audio-playback-rate", playbackRateFromX(point.x, metrics.width));
    if (drag.mode === "region") {
      const delta = waveformTimeFromX(point.x - drag.startX, metrics.width, metrics.duration);
      const rawDelta = point.x >= drag.startX ? delta : -waveformTimeFromX(drag.startX - point.x, metrics.width, metrics.duration);
      const length = drag.initialEnd - drag.initialStart;
      const nextStart = Math.max(0, Math.min(metrics.duration - length, drag.initialStart + rawDelta));
      setEditorValue("audio-trim-start", nextStart);
      setEditorValue("audio-trim-end", nextStart + length);
      drag.moved = drag.moved || Math.abs(point.x - drag.startX) > 4;
    }
    invalidatePreview();
    drawWaveform();
  }

  function waveformPointerDown(event) {
    if (!waveformMetrics || event.button !== 0) return;
    const point = canvasPoint(event);
    const metrics = waveformMetrics;
    const near = (value, distance = 14) => Math.abs(point.x - value) <= distance;
    let mode = "seek";
    if (point.y >= metrics.waveHeight && near(metrics.stretchX, 24)) mode = "stretch";
    else if (point.y >= 28 && point.y <= 76 && near(metrics.fadeInX, 16)) mode = "fadeIn";
    else if (point.y >= 28 && point.y <= 76 && near(metrics.fadeOutX, 16)) mode = "fadeOut";
    else if (near(metrics.startX, 12)) mode = "trimStart";
    else if (near(metrics.endX, 12)) mode = "trimEnd";
    else if (point.x >= metrics.startX && point.x <= metrics.endX && point.y > 78 && point.y < metrics.waveHeight - 10) mode = "region";
    waveformDrag = {
      mode,
      startX: point.x,
      initialStart: metrics.trimStart,
      initialEnd: metrics.trimEnd,
      initialFadeIn: metrics.fadeIn,
      initialFadeOut: metrics.fadeOut,
      initialRate: metrics.rate,
      selectionWidth: metrics.endX - metrics.startX,
      moved: false
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mode === "seek") seekFromCanvasX(point.x);
    event.preventDefault();
  }

  function waveformPointerMove(event) {
    if (!waveformDrag || waveformDrag.mode === "seek") return;
    applyWaveformDrag(canvasPoint(event));
    event.preventDefault();
  }

  function waveformPointerUp(event) {
    if (!waveformDrag) return;
    const drag = waveformDrag;
    const point = canvasPoint(event);
    waveformDrag = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (drag.mode === "region" && !drag.moved) seekFromCanvasX(point.x);
    setStudioStatus(drag.mode === "stretch" ? "Playback length changed." : drag.mode === "region" ? "Kept audio moved." : drag.mode === "seek" ? "Playhead moved." : "Waveform edit updated.");
  }

  function waveformKeyDown(event) {
    if (event.code === "Space") {
      event.preventDefault();
      previewSelected();
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const duration = previewDuration();
    let next = previewCurrentOffset();
    if (event.key === "ArrowLeft") next -= event.shiftKey ? 1 : 0.1;
    if (event.key === "ArrowRight") next += event.shiftKey ? 1 : 0.1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = duration;
    seekPreview(Math.max(0, Math.min(duration, next)));
  }

  async function drawWaveform() {
    const drawToken = ++waveformDrawToken;
    const canvas = document.getElementById("audio-waveform");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const waveHeight = height - 38;
    const center = Math.round(waveHeight / 2);
    const ink = themeColor("--ink", "#000");
    const panel = themeColor("--panel", "#fff");
    const soft = themeColor("--soft", "#f2f2f2");
    const checker = themeColor("--checker", "#ddd");
    const warn = themeColor("--warn", "#ffef99");
    const accent = themeColor("--accent", "#ff5ca8");
    const meta = document.getElementById("audio-waveform-meta");
    const startLabel = document.getElementById("audio-waveform-start-label");
    const endLabel = document.getElementById("audio-waveform-end-label");
    const resultLabel = document.getElementById("audio-waveform-result-label");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = soft;
    ctx.fillRect(0, 0, width, height);
    const tile = 28;
    ctx.fillStyle = checker;
    for (let y = 0; y < waveHeight; y += tile) {
      for (let x = 0; x < width; x += tile) {
        if ((x / tile + y / tile) % 2 === 0) ctx.fillRect(x, y, tile, tile);
      }
    }
    const asset = selectedAsset();
    if (!asset) {
      waveformMetrics = null;
      ctx.fillStyle = panel;
      ctx.fillRect(0, center - 3, width, 6);
      ctx.fillStyle = ink;
      ctx.font = "900 18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("NO CLIP", width / 2, center);
      if (meta) meta.textContent = "No clip selected";
      if (startLabel) startLabel.textContent = "0:00";
      if (endLabel) endLabel.textContent = "0:00";
      if (resultLabel) resultLabel.textContent = "Result 0:00";
      updateTransport(false);
      return;
    }
    try {
      const buffer = await decodeAsset(asset);
      if (drawToken !== waveformDrawToken || selectedAsset()?.id !== asset.id) return;
      const data = buffer.getChannelData(0);
      const duration = Math.max(0.001, Number(buffer.duration) || data.length / buffer.sampleRate);
      const options = editorOptions(buffer);
      const keptDuration = Math.max(0.001, options.end - options.start);
      const resultDuration = keptDuration / options.rate;
      const startX = Math.round(options.start / duration * width);
      const endX = Math.max(startX + 1, Math.round(options.end / duration * width));
      const fadeInX = Math.round((options.start + options.fadeIn) / duration * width);
      const fadeOutX = Math.round((options.end - options.fadeOut) / duration * width);
      const stretchProgress = (2 - Math.log2(options.rate)) / 4;
      const stretchX = Math.max(14, Math.min(width - 14, Math.round(stretchProgress * width)));
      waveformMetrics = { width, height, waveHeight, duration, trimStart: options.start, trimEnd: options.end, fadeIn: options.fadeIn, fadeOut: options.fadeOut, startX, endX, fadeInX, fadeOutX, stretchX, rate: options.rate, reverse: options.reverse, resultDuration };
      if (meta) meta.textContent = `${asset.name} · ${formatBytes(dataUrlByteLength(asset.dataUrl))} · ${formatTime(duration)}`;
      if (startLabel) startLabel.textContent = "0:00";
      if (endLabel) endLabel.textContent = formatTime(duration);
      if (resultLabel) resultLabel.textContent = `Result ${formatTime(resultDuration)} · ${options.rate.toFixed(2)}×`;
      ctx.fillStyle = warn;
      ctx.fillRect(startX, 0, endX - startX, waveHeight);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.28;
      for (let index = 1; index < 4; index++) {
        const x = Math.round(width * index / 4);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, waveHeight);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const stride = 10;
      const barWidth = 6;
      const bars = Math.ceil(width / stride);
      const samplesPerBar = Math.max(1, Math.floor(data.length / bars));
      for (let bar = 0; bar < bars; bar++) {
        const displayedBar = options.reverse ? bars - bar - 1 : bar;
        const sampleStart = Math.min(data.length - 1, displayedBar * samplesPerBar);
        const sampleEnd = Math.min(data.length, sampleStart + samplesPerBar);
        let peak = 0;
        for (let index = sampleStart; index < sampleEnd; index++) peak = Math.max(peak, Math.abs(data[index] || 0));
        const barHeight = Math.max(4, Math.round(peak * (center - 15)));
        const x = bar * stride + 2;
        ctx.globalAlpha = x + barWidth < startX || x > endX ? 0.25 : 1;
        ctx.fillStyle = ink;
        ctx.fillRect(x, center - barHeight, barWidth, barHeight * 2);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillRect(0, center - 2, width, 4);
      ctx.save();
      ctx.beginPath();
      ctx.rect(startX, 0, Math.max(0, fadeInX - startX), waveHeight);
      ctx.rect(fadeOutX, 0, Math.max(0, endX - fadeOutX), waveHeight);
      ctx.clip();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      for (let x = -waveHeight; x < width + waveHeight; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, waveHeight);
        ctx.lineTo(x + waveHeight, 0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = ink;
      ctx.fillRect(Math.max(0, startX - 3), 0, 6, waveHeight);
      ctx.fillRect(Math.min(width - 6, endX - 3), 0, 6, waveHeight);
      const drawMarker = (x, label, alignRight) => {
        const badgeWidth = 44;
        const badgeX = alignRight ? Math.max(0, x - badgeWidth) : Math.min(width - badgeWidth, x);
        ctx.fillStyle = ink;
        ctx.fillRect(badgeX, 0, badgeWidth, 25);
        ctx.fillStyle = panel;
        ctx.font = "900 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, badgeX + badgeWidth / 2, 12);
      };
      const drawFade = (x, label) => {
        ctx.fillStyle = ink;
        ctx.fillRect(Math.max(0, x - 12), 34, 24, 24);
        ctx.fillStyle = panel;
        ctx.font = "900 9px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, 46);
      };
      drawMarker(startX, "IN", false);
      drawMarker(endX, "OUT", true);
      drawFade(fadeInX, "FI");
      drawFade(fadeOutX, "FO");
      ctx.fillStyle = panel;
      ctx.fillRect(0, waveHeight, width, height - waveHeight);
      ctx.fillStyle = ink;
      ctx.fillRect(0, waveHeight, width, 4);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(16, waveHeight + 19);
      ctx.lineTo(width - 16, waveHeight + 19);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = "900 8px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText("FASTER", 18, waveHeight + 10);
      ctx.textAlign = "right";
      ctx.fillText("LONGER", width - 18, waveHeight + 10);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = accent;
      ctx.fillRect(Math.min(width / 2, stretchX), waveHeight + 12, Math.max(2, Math.abs(stretchX - width / 2)), 14);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillRect(stretchX - 12, waveHeight + 5, 24, 28);
      ctx.fillStyle = panel;
      ctx.font = "900 8px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("↔", stretchX, waveHeight + 19);
      const current = previewCurrentOffset();
      const sourceTime = previewTimeToSource(current, waveformMetrics);
      const playheadX = Math.round(sourceTime / duration * width);
      waveformMetrics.playheadX = playheadX;
      ctx.fillStyle = accent;
      ctx.fillRect(Math.max(0, playheadX - 2), 0, 5, waveHeight);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(playheadX - 8, waveHeight - 1);
      ctx.lineTo(playheadX + 8, waveHeight - 1);
      ctx.lineTo(playheadX, waveHeight - 12);
      ctx.closePath();
      ctx.fill();
      updateTransport(false);
    } catch (_error) {
      waveformMetrics = null;
      if (meta) meta.textContent = "Waveform unavailable";
    }
  }

  function renderEditor() {
    const asset = selectedAsset();
    const set = (id, value) => { const element = document.getElementById(id); if (element) element.value = String(value); };
    set("audio-asset-name", asset?.name || "");
    set("audio-asset-kind", asset?.kind || "sfx");
    if (asset?.id !== editorAssetId) {
      editorAssetId = asset?.id || "";
      set("audio-trim-start", 0);
      set("audio-trim-end", asset?.duration || 1);
      set("audio-fade-in", 0);
      set("audio-fade-out", 0);
      set("audio-edit-gain", 1);
      set("audio-playback-rate", 1);
      const reverse = document.getElementById("audio-reverse");
      const normalize = document.getElementById("audio-normalize");
      if (reverse) reverse.checked = false;
      if (normalize) normalize.checked = true;
      invalidatePreview();
    }
    drawWaveform();
  }

  function renderMixer() {
    const mixer = normalizeMixer(state()?.audioMixer);
    [["audio-mixer-master", "audio-mixer-master-output", mixer.master], ["audio-mixer-music", "audio-mixer-music-output", mixer.music], ["audio-mixer-sfx", "audio-mixer-sfx-output", mixer.sfx]].forEach(([inputId, outputId, value]) => {
      const input = document.getElementById(inputId);
      const output = document.getElementById(outputId);
      if (input) input.value = String(value);
      if (output) output.textContent = `${Math.round(value * 100)}%`;
    });
    const muteMusic = document.getElementById("audio-mute-music");
    const muteSfx = document.getElementById("audio-mute-sfx");
    if (muteMusic) muteMusic.checked = mixer.muteMusic;
    if (muteSfx) muteSfx.checked = mixer.muteSfx;
  }

  function renderScene() {
    const pm = state();
    const sceneSelect = document.getElementById("audio-cue-scene-select");
    const previousScene = sceneSelect?.value || pm.activeSceneId;
    if (sceneSelect) {
      sceneSelect.innerHTML = "";
      sceneOptions().forEach(scene => {
        const option = document.createElement("option");
        option.value = scene.id;
        option.textContent = scene.name || scene.id;
        sceneSelect.appendChild(option);
      });
      sceneSelect.value = sceneOptions().some(scene => scene.id === previousScene) ? previousScene : pm.activeSceneId;
    }
    const targetSceneId = sceneSelect?.value || pm.activeSceneId;
    const record = sceneAudioRecord(targetSceneId);
    const fillAudioSelect = (select, emptyLabel) => {
      if (!select) return;
      const previous = select.value;
      select.innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = emptyLabel;
      select.appendChild(empty);
      pm.audioLibrary.forEach(asset => {
        const option = document.createElement("option");
        option.value = asset.id;
        option.textContent = `${asset.name} · ${asset.kind === "music" ? "Music" : "Effect"}`;
        select.appendChild(option);
      });
      if (pm.audioLibrary.some(asset => asset.id === previous)) select.value = previous;
    };
    const soundtrack = document.getElementById("play-audio-asset-select");
    fillAudioSelect(soundtrack, "No soundtrack");
    if (soundtrack) soundtrack.value = record.assetId || "";
    const cueAsset = document.getElementById("audio-cue-asset-select");
    fillAudioSelect(cueAsset, "Choose a clip");
    const volume = document.getElementById("play-audio-volume");
    const loop = document.getElementById("play-audio-loop");
    if (volume) volume.value = String(record.volume ?? 0.7);
    if (loop) loop.checked = record.loop !== false;
    renderCueTargets();
    renderCueSummary();
  }

  function renderLauncher() {
    const pm = state();
    const count = document.querySelector("[data-audio-count]");
    const scene = document.querySelector("[data-audio-scene]");
    const status = document.querySelector("[data-audio-status]");
    if (count) count.textContent = String(pm.audioLibrary.length);
    if (scene) scene.textContent = pm.audio?.name ? String(pm.audio.name).slice(0, 14) : "None";
    if (status) status.textContent = pm.audioLibrary.length ? "Ready" : "Empty";
  }

  function render() {
    if (!api) return;
    state();
    selectedAsset();
    renderLauncher();
    renderLibrary();
    renderEditor();
    renderMixer();
    renderScene();
  }

  function wire() {
    const overlay = shell();
    document.getElementById("open-audio-studio-btn")?.addEventListener("click", () => openStudio("library"));
    overlay.querySelector(".audio-studio-close")?.addEventListener("click", closeStudio);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeStudio(); });
    document.querySelectorAll("[data-audio-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.audioTab)));
    document.getElementById("play-audio-file")?.addEventListener("change", event => { importFile(event.target.files?.[0]); event.target.value = ""; });
    document.getElementById("audio-tone-create-btn")?.addEventListener("click", createTone);
    document.getElementById("audio-duplicate-btn")?.addEventListener("click", duplicateAsset);
    document.getElementById("audio-delete-btn")?.addEventListener("click", deleteAsset);
    document.getElementById("audio-preview-btn")?.addEventListener("click", previewSelected);
    document.getElementById("audio-jump-start-btn")?.addEventListener("click", () => seekPreview(0));
    document.getElementById("audio-stop-btn")?.addEventListener("click", () => { stopPreview(); setStudioStatus("Preview stopped."); });
    document.getElementById("audio-preview-loop")?.addEventListener("change", event => { previewLoop = event.target.checked; if (previewPlaying) playPreviewFrom(previewCurrentOffset()); });
    document.getElementById("audio-seek-range")?.addEventListener("input", event => seekPreview(event.target.value));
    document.getElementById("audio-render-copy-btn")?.addEventListener("click", renderEditedCopy);
    document.getElementById("audio-reset-edit-btn")?.addEventListener("click", resetEditor);
    ["audio-trim-start", "audio-trim-end", "audio-fade-in", "audio-fade-out", "audio-edit-gain", "audio-playback-rate"].forEach(id => document.getElementById(id)?.addEventListener("input", editorInputChanged));
    ["audio-reverse", "audio-normalize"].forEach(id => document.getElementById(id)?.addEventListener("change", editorInputChanged));
    const waveform = document.getElementById("audio-waveform");
    waveform?.addEventListener("pointerdown", waveformPointerDown);
    waveform?.addEventListener("pointermove", waveformPointerMove);
    waveform?.addEventListener("pointerup", waveformPointerUp);
    waveform?.addEventListener("pointercancel", waveformPointerUp);
    waveform?.addEventListener("keydown", waveformKeyDown);
    document.getElementById("audio-asset-name")?.addEventListener("change", event => { const asset = selectedAsset(); if (!asset) return; asset.name = String(event.target.value || asset.name).trim().slice(0, 64) || asset.name; const pm = state(); if (pm.audio?.assetId === asset.id) pm.audio.name = asset.name; (pm.scenes || []).forEach(scene => { if (scene.audio?.assetId === asset.id) scene.audio.name = asset.name; }); api.saveLocal?.(); render(); window.PixelBugNodeEditor?.render?.(); });
    document.getElementById("audio-asset-kind")?.addEventListener("change", event => { const asset = selectedAsset(); if (!asset) return; asset.kind = event.target.value === "music" ? "music" : "sfx"; api.saveLocal?.(); render(); });
    document.getElementById("audio-cue-scene-select")?.addEventListener("change", renderScene);
    document.getElementById("audio-scene-apply-btn")?.addEventListener("click", () => assignSceneAsset());
    document.getElementById("play-audio-clear-btn")?.addEventListener("click", clearSceneAudio);
    document.getElementById("audio-scene-preview-btn")?.addEventListener("click", () => { const assetId = document.getElementById("play-audio-asset-select")?.value; if (!assetId) { setStudioStatus("Choose a soundtrack first."); return; } playAsset(assetId, { volume: document.getElementById("play-audio-volume")?.value, loop: false }); });
    document.getElementById("audio-cue-event-type")?.addEventListener("change", renderCueTargets);
    document.getElementById("audio-cue-create-btn")?.addEventListener("click", createCueRule);
    document.getElementById("audio-cue-preview-btn")?.addEventListener("click", () => { const assetId = document.getElementById("audio-cue-asset-select")?.value; if (!assetId) { setStudioStatus("Choose a clip first."); return; } playAsset(assetId, { volume: document.getElementById("audio-cue-volume")?.value, loop: false }); });
    document.getElementById("audio-cue-open-rules-btn")?.addEventListener("click", () => { closeStudio(); window.setTimeout(() => window.PixelBugNodeEditor?.openOverlay?.(), 0); });
    [["audio-mixer-master", "master"], ["audio-mixer-music", "music"], ["audio-mixer-sfx", "sfx"]].forEach(([id, key]) => document.getElementById(id)?.addEventListener("input", event => { state().audioMixer[key] = clamp(event.target.value, 1, 0, 1); api.syncSceneAudio?.(); api.saveLocal?.(); renderMixer(); }));
    document.getElementById("audio-mute-music")?.addEventListener("change", event => { state().audioMixer.muteMusic = event.target.checked; api.syncSceneAudio?.(); api.saveLocal?.(); });
    document.getElementById("audio-mute-sfx")?.addEventListener("change", event => { state().audioMixer.muteSfx = event.target.checked; api.saveLocal?.(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !overlay.hidden) closeStudio(); });
  }

  function mount(nextApi) {
    api = nextApi;
    shell();
    wire();
    render();
  }

  shell();
  window.PixelBugAudioStudio = { mount, render, open: openStudio, importFile, playAsset, stopGameAudio, getOptions: () => assets().map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind })), helpers };
})();
