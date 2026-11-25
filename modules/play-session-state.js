"use strict";

// Session state
(function attachPlaySessionState(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlaySessionState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaySessionState() {
  const VERSION = 1;
  const MAX_SAVE_BYTES = 262144;
  const MAX_TAPE_BYTES = 8388608;
  const MAX_TAPE_FRAMES = 18000;
  const DENIED = new Set(["__proto__", "prototype", "constructor"]);
  function text(value, limit = 96) { return String(value == null ? "" : value).slice(0, limit); }
  function finite(value, fallback = 0, limit = 100000) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value)) : fallback;
  }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function variables(value) {
    return Object.fromEntries(Object.entries(object(value))
      .filter(([key]) => key.length > 0 && key.length <= 32 && !DENIED.has(key))
      .slice(0, 128).map(([key, entry]) => [key, text(entry, 256)]));
  }
  function inventory(value) {
    return [...new Set((Array.isArray(value) ? value : []).slice(0, 128)
      .map(item => text(item, 40).trim()).filter(Boolean))].slice(0, 64);
  }
  function position(value) {
    const item = object(value);
    return { x:finite(item.x), y:finite(item.y), z:finite(item.z), vx:finite(item.vx),
      vy:finite(item.vy), vz:finite(item.vz), grounded:item.grounded === true, moving:item.moving === true,
      facing:item.facing === -1 ? -1 : 1 };
  }
  function camera(value) {
    const item = object(value);
    return { x:finite(item.x), yaw:finite(item.yaw), pitch:finite(item.pitch),
      cellSize:finite(item.cellSize, 32, 256), turntable:item.turntable === true };
  }
  function checkpoint(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return { sceneId:text(value.sceneId), x:finite(value.x), y:finite(value.y), z:finite(value.z) };
  }
  function queue(value) {
    return (Array.isArray(value) ? value : []).slice(0, 512).filter(item => item && typeof item === "object")
      .map(item => ({ id:text(item.id), seen:(Array.isArray(item.seen) ? item.seen : []).slice(0, 100).map(i => text(i)),
        remaining:Math.max(0, Math.min(36000, Math.floor(finite(item.remaining, 0, 36000)))),
        sequence:Math.max(0, Math.floor(finite(item.sequence, 0, 10000000))) })).filter(item => item.id);
  }
  function snapshot(value, sceneModes = null) {
    const raw = object(value);
    const sceneId = text(raw.sceneId);
    if (!sceneId || (sceneModes && !Object.prototype.hasOwnProperty.call(sceneModes, sceneId))) throw new Error("Unknown saved scene.");
    const mode = raw.mode === "voxel3d" ? "voxel3d" : "sidescroller";
    if (sceneModes && sceneModes[sceneId] !== mode) throw new Error("Saved scene type does not match this game.");
    const dialogue = object(raw.dialogue);
    return { sceneId, mode, actor:position(raw.actor), camera:camera(raw.camera),
      variables:variables(raw.variables), inventory:inventory(raw.inventory), checkpoint:checkpoint(raw.checkpoint),
      randomState:Number.isInteger(raw.randomState) ? raw.randomState >>> 0 : 0,
      tick:Math.max(0, Math.floor(finite(raw.tick, 0, 100000000))),
      queue:queue(raw.queue), entered:(Array.isArray(raw.entered) ? raw.entered : []).slice(0, 128).map(item => text(item)),
      finished:raw.finished === true,
      dialogue:{ active:dialogue.active === true, line:Math.max(-1, Math.min(10000, Math.floor(finite(dialogue.line, -1, 10000)))),
        characterId:text(dialogue.characterId), revealChars:Math.max(0,Math.min(10000,Math.floor(finite(dialogue.revealChars,0,10000)))),
        continuationId:text(dialogue.continuationId),
        continuationSeen:(Array.isArray(dialogue.continuationSeen) ? dialogue.continuationSeen : []).slice(0, 100).map(i => text(i)) },
      message:text(raw.message, 180) };
  }
  function checksum(source) {
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }
  function encode(kind, payload, maximum) {
    const body = JSON.stringify({ version:VERSION, kind, payload });
    if (body.length > maximum) throw new Error("Session data exceeds the size limit.");
    return JSON.stringify({ body, checksum:checksum(body) });
  }
  function decode(serialized, expected, maximum) {
    if (typeof serialized !== "string" || serialized.length > maximum + 256) throw new Error("Session data is too large.");
    const envelope = JSON.parse(serialized);
    if (!envelope || typeof envelope.body !== "string" || envelope.checksum !== checksum(envelope.body)) throw new Error("Session data failed integrity check.");
    const content = JSON.parse(envelope.body);
    if (content.version !== VERSION || content.kind !== expected) throw new Error("Unsupported session format.");
    return content.payload;
  }
  function packSave(raw, sceneModes, gameId = "") {
    return encode("save", { gameId:text(gameId,256), state:snapshot(raw, sceneModes) }, MAX_SAVE_BYTES);
  }
  function unpackSave(data, sceneModes, gameId = "") {
    const dataSet = decode(data, "save", MAX_SAVE_BYTES);
    if (text(dataSet.gameId,256) !== text(gameId,256)) throw new Error("Save belongs to a different game.");
    return snapshot(dataSet.state, sceneModes);
  }
  function packTape(raw, sceneModes, gameId = "") {
    const source = object(raw);
    if (!Array.isArray(source.frames) || source.frames.length < 1 || source.frames.length > MAX_TAPE_FRAMES) throw new Error("Invalid replay length.");
    const frames = source.frames.map(frame => snapshot(frame, sceneModes));
    return encode("replay", { gameId:text(gameId,256), frames, sampleRate:30 }, MAX_TAPE_BYTES);
  }
  function unpackTape(data, sceneModes, gameId = "") {
    const record = decode(data, "replay", MAX_TAPE_BYTES);
    if (text(record.gameId,256) !== text(gameId,256)) throw new Error("Replay belongs to a different game.");
    if (!record || !Array.isArray(record.frames) || record.frames.length < 1 || record.frames.length > MAX_TAPE_FRAMES) throw new Error("Invalid replay frames.");
    return { frames:record.frames.map(frame => snapshot(frame, sceneModes)), sampleRate:30 };
  }
  function createRecorder(sceneModes) {
    let frames = [];
    let bytes = 0;
    let stopped = false;
    return {
      push(value) {
        if (stopped) return false;
        const next = snapshot(value, sceneModes);
        const size = JSON.stringify(next).length * 2 + 16;
        if (frames.length >= MAX_TAPE_FRAMES || bytes + size > MAX_TAPE_BYTES - 4096) { stopped = true; return false; }
        frames.push(next); bytes += size; return true;
      },
      stop() { stopped = true; return { frames:frames.slice(), sampleRate:30 }; },
      get size() { return frames.length; },
      get stopped() { return stopped; }
    };
  }
  function createStorage(storage, gameId) {
    const identity=text(gameId,256);
    const prefix = "pixelbug.session.v1." + checksum(identity) + checksum([...identity].reverse().join("")) + ".";
    function slot(number) {
      if (![1, 2, 3].includes(number)) throw new RangeError("Save slot must be 1, 2, or 3.");
      return prefix + "slot." + number;
    }
    return {
      save(number, state, sceneModes) {
        const serialized = packSave(state, sceneModes, identity);
        storage.setItem(slot(number), serialized);
        return serialized;
      },
      load(number, sceneModes) {
        const value = storage.getItem(slot(number));
        if (!value) return null;
        return unpackSave(value, sceneModes, identity);
      },
      erase(number) { storage.removeItem(slot(number)); },
      present(number) { return storage.getItem(slot(number)) !== null; }
    };
  }
  return { VERSION, MAX_TAPE_FRAMES, MAX_TAPE_BYTES, snapshot, checksum, packSave, unpackSave,
    packTape, unpackTape, createRecorder, createStorage };
});
