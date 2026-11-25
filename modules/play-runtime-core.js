"use strict";

// Runtime core
(function attachPlayRuntimeCore(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayRuntimeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayRuntimeCore() {
  const REFERENCE_FPS = 60;

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(finite(value, minimum), maximum));
  }

  function frameDelta(now, previous, fallback = 1 / REFERENCE_FPS) {
    const current = finite(now, 0);
    const before = finite(previous, 0);
    if (current <= 0 || before <= 0 || current <= before) return fallback;
    return clamp((current - before) / 1000, 1 / 1000, 0.05);
  }

  const FIXED_STEP_SECONDS = 1 / REFERENCE_FPS;
  const MAX_CATCH_UP_STEPS = 8;
  function createSimulationClock() {
    return { lastTime: 0, accumulator: 0, ticks: 0, generation: 0, droppedSteps: 0 };
  }
  function resetSimulationClock(clock) {
    clock.lastTime = 0;
    clock.accumulator = 0;
    clock.generation = (clock.generation || 0) + 1;
    return clock;
  }
  function advanceSimulationClock(clock, now, simulate) {
    if (!clock || typeof simulate !== "function") throw new TypeError("Simulation clock requires a callback.");
    const current = finite(now, 0);
    const first = !(clock.lastTime > 0) || current <= 0;
    const elapsed = first ? FIXED_STEP_SECONDS : clamp((current - clock.lastTime) / 1000, 0, 0.25);
    clock.lastTime = current > 0 ? current : clock.lastTime;
    clock.accumulator += elapsed;
    const available = Math.floor((clock.accumulator + 1e-10) / FIXED_STEP_SECONDS);
    const count = Math.min(MAX_CATCH_UP_STEPS, available);
    const skipped = available - count;
    clock.accumulator = Math.max(0, clock.accumulator - available * FIXED_STEP_SECONDS);
    clock.droppedSteps += skipped;
    const generation = clock.generation;
    let executed = 0;
    for (let index = 0; index < count && generation === clock.generation; index++) {
      simulate(FIXED_STEP_SECONDS, clock.ticks);
      clock.ticks++;
      executed++;
    }
    return { steps: executed, dropped: skipped, alpha: clock.accumulator / FIXED_STEP_SECONDS };
  }
  function jumpEdge(pressed, previousHeld) {
    return Boolean(pressed) && !Boolean(previousHeld);
  }

  const COYOTE_TICKS = 5;
  const JUMP_BUFFER_TICKS = 6;
  function createJumpAssist() { return { held: false, coyote: 0, buffer: 0 }; }
  function resetJumpAssist(state) {
    state.held = false;
    state.coyote = 0;
    state.buffer = 0;
    return state;
  }
  function assistedJump(state, pressed, grounded, disabled = false) {
    const rising = jumpEdge(pressed, state.held);
    state.held = Boolean(pressed);
    state.coyote = grounded ? COYOTE_TICKS : Math.max(0, state.coyote - 1);
    state.buffer = rising && !disabled ? JUMP_BUFFER_TICKS : Math.max(0, state.buffer - 1);
    if (disabled) state.buffer = 0;
    if (!disabled && state.coyote > 0 && state.buffer > 0) {
      state.coyote = 0;
      state.buffer = 0;
      return true;
    }
    return false;
  }

  // Animation policy
  function animationState(actor = {}, mode = {}) {
    const vertical = finite(actor.vy, 0);
    const moving = Math.abs(finite(actor.vx, 0)) > .08;
    const state = actor.grounded ? (moving ? "run" : "idle") : (vertical < 0 ? "rise" : "fall");
    const frame = state === "fall" ? mode.fallFrame ?? mode.jumpFrame
      : state === "rise" ? mode.riseFrame ?? mode.jumpFrame
      : state === "run" ? mode.runFrame ?? mode.walkFrame : mode.idleFrame;
    return { state, frame: Number.isFinite(Number(frame)) ? Number(frame) : 0 };
  }
  function parseClip(value, frameCount = 1000) {
    const data = Array.isArray(value) ? value : String(value || "").split(",");
    return data.slice(0, 12).map(v => String(v).trim()).filter(v => /^\d{1,4}$/.test(v))
      .map(Number).filter(v => v < frameCount);
  }
  function frameSelection(actor = {}, mode = {}, tick = 0) {
    const animation = animationState(actor, mode);
    const direction = ["left", "right", "up", "down"].includes(actor.direction) ? actor.direction : actor.facing < 0 ? "left" : "right";
    const holdKey = animation.state === "run" ? "runClipTicks" : animation.state === "idle" ? "idleClipTicks" : "airClipTicks";
    const hold = clamp(Math.floor(finite(mode[holdKey], finite(mode.clipFrameTicks, 8))), 2, 60);
    const choose = frames => frames[Math.floor(Math.max(0, finite(tick, 0)) / hold) % frames.length];
    const directional = actor.grounded ? parseClip(mode[direction + (animation.state === "run" ? "RunClip" : "IdleClip")]) : [];
    if (directional.length) return {frame:choose(directional),flip:false,direction,directional:true,state:animation.state};
    const cardinal = actor.grounded ? parseClip(mode[direction + "Clip"]) : [];
    if (cardinal.length) return { frame:choose(cardinal), flip:false, direction, directional:true,state:animation.state };
    const frames = parseClip(mode[animation.state + "Clip"]);
    return { frame:frames.length ? choose(frames) : animation.frame,
      flip:direction === "left", direction, directional:false,state:animation.state };
  }
  function animatedFrame(actor = {}, mode = {}, tick = 0) {
    return frameSelection(actor, mode, tick).frame;
  }
  function horizontalVelocity(previous, direction, speed, seconds, mode = {}) {
    const input = clamp(finite(direction, 0), -1, 1);
    const target = input * Math.max(0, finite(speed, 0));
    const ramp = input ? clamp(finite(mode.acceleration, 0), 0, 120) : clamp(finite(mode.friction, 0), 0, 120);
    if (!ramp) return target;
    const difference = target - finite(previous, 0);
    const amount = ramp * REFERENCE_FPS * Math.max(0, finite(seconds, 0));
    return finite(previous, 0) + Math.sign(difference) * Math.min(Math.abs(difference), amount);
  }
  function releasedJumpVelocity(velocity, jumpHeld, mode = {}) {
    if (jumpHeld || mode.variableJump !== true || velocity >= 0) return velocity;
    return velocity * .55;
  }
  function physics(playMode = {}) {
    const moveUnits = clamp(finite(playMode.moveSpeed, 3), 0.25, 20);
    const jumpUnits = clamp(finite(playMode.jumpStrength, 8), 0.5, 30);
    const gravityUnits = clamp(finite(playMode.gravity, 0.45), 0.05, 4);
    const scrollUnits = clamp(finite(playMode.scrollSpeed, 0), 0, 20);
    return {
      moveSpeed: moveUnits * REFERENCE_FPS,
      jumpSpeed: jumpUnits * REFERENCE_FPS,
      gravity: gravityUnits * REFERENCE_FPS * REFERENCE_FPS,
      scrollSpeed: scrollUnits * REFERENCE_FPS
    };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function advanceAxis(position, velocity, seconds) {
    return finite(position, 0) + finite(velocity, 0) * clamp(seconds, 0, 0.05);
  }

  function advanceVelocity(velocity, acceleration, seconds) {
    return finite(velocity, 0) + finite(acceleration, 0) * clamp(seconds, 0, 0.05);
  }

  function autoScroll(cameraX, maxCameraX, scrollSpeed, seconds) {
    const current = clamp(cameraX, 0, Math.max(0, finite(maxCameraX, 0)));
    const next = current + Math.max(0, finite(scrollSpeed, 0)) * clamp(seconds, 0, 0.05);
    return clamp(next, 0, Math.max(0, finite(maxCameraX, 0)));
  }

  function smoothingAlpha(referenceAlpha, seconds) {
    const alpha = clamp(referenceAlpha, 0, 1);
    const frames = clamp(seconds, 0, 0.05) * REFERENCE_FPS;
    return frames > 0 ? 1 - Math.pow(1 - alpha, frames) : 0;
  }

  return { REFERENCE_FPS, FIXED_STEP_SECONDS, MAX_CATCH_UP_STEPS, finite, clamp, frameDelta, physics, rectsOverlap, advanceAxis, advanceVelocity, autoScroll, smoothingAlpha, createSimulationClock, resetSimulationClock, advanceSimulationClock, jumpEdge, createJumpAssist, resetJumpAssist, assistedJump, animationState, parseClip, animatedFrame, frameSelection, horizontalVelocity, releasedJumpVelocity, COYOTE_TICKS, JUMP_BUFFER_TICKS };
});
