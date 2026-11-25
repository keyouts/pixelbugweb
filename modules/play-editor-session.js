"use strict";

// Editor sessions
(function attachPlayEditorSession(root, factory) {
  const state = typeof module === "object" && module.exports ? require("./play-session-state.js") : root?.PixelBugPlaySessionState;
  const controls = typeof module === "object" && module.exports ? require("./play-session-controls.js") : root?.PixelBugPlaySessionControls;
  const api = Object.freeze(factory(state, controls));
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayEditorSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditorSessions(session, controls) {
  function create(hooks) {
    let controller = null;
    let recording = false;
    function modes() {
      return Object.fromEntries((hooks.playMode().scenes || []).map(scene =>
        [scene.id, scene.worldType === "voxel3d" ? "voxel3d" : "sidescroller"]));
    }
    function legacyGameId() {
      return [String(hooks.title() || "Pixel Bug Tiny Game").slice(0, 64), ...Object.keys(modes())].join("|");
    }
    function gameId() {
      const projectId = String(hooks.projectId?.() || "");
      if (/^project-[a-zA-Z0-9-]{8,120}$/.test(projectId)) return `editor:${projectId}`;
      return legacyGameId();
    }
    function capture() {
      if (!hooks.running()) throw new Error("Start the Play Mode tester first.");
      const pm = hooks.playMode();
      const rule = hooks.rules()?.captureSession?.(hooks.tick()) || {};
      const runtime = pm.nodeEditor?.runtime || {};
      const dialogue = hooks.dialogue();
      return session.snapshot({
        sceneId:pm.activeSceneId, mode:pm.worldType === "voxel3d" ? "voxel3d" : "sidescroller",
        actor:hooks.actor(), camera:hooks.camera(), variables:runtime.variables || {},
        inventory:runtime.inventory || [], checkpoint:hooks.checkpoint(),
        randomState:rule.randomState, tick:hooks.tick(),queue:rule.queue,
        entered:pm.worldType === "voxel3d" ? hooks.entered() : rule.entered,
        finished:hooks.finished(), dialogue:{...dialogue,
          continuationId:rule.continuation?.id, continuationSeen:rule.continuation?.seen},
        message:hooks.message()
      }, modes());
    }
    function restore(input, replay = false) {
      if (!hooks.running()) throw new Error("Start the Play Mode tester before loading a save or replay.");
      const saved = session.snapshot(input, modes());
      hooks.pause(true);
      if (hooks.playMode().activeSceneId !== saved.sceneId) hooks.changeScene(saved.sceneId);
      const pm = hooks.playMode();
      hooks.applyActor(saved.actor, saved.mode);
      hooks.applyCamera(saved.camera, saved.mode);
      const runtime = pm.nodeEditor.runtime || (pm.nodeEditor.runtime = {});
      runtime.variables = {...saved.variables}; runtime.inventory = [...saved.inventory];
      runtime.checkpoint = saved.checkpoint ? {...saved.checkpoint} : null;
      pm.variables = {...saved.variables}; pm.inventory = [...saved.inventory];
      pm.checkpoint = saved.checkpoint ? {...saved.checkpoint} : null;
      pm.dialogue.currentLine = saved.dialogue.line;
      hooks.setTick(saved.tick);
      hooks.setFinished(saved.finished);
      hooks.rules()?.restoreSession?.({randomState:saved.randomState,queue:saved.queue,
        entered:saved.mode === "voxel3d" ? [] : saved.entered,
        continuation:saved.dialogue.active && saved.dialogue.continuationId ?
          {id:saved.dialogue.continuationId,seen:saved.dialogue.continuationSeen} : null
      },saved.tick,replay);
      hooks.applyDialogue(saved.dialogue, replay);
      hooks.applyMessage(saved.message);
      hooks.finishRestore(saved,replay);
      return true;
    }
    function mount() {
      controller?.dispose?.();
      const container = hooks.container();
      if (!container) { controller=null; return; }
      controller = controls.mount({ session, document:hooks.document, window:hooks.window,
        container, inlineStyles:false, sceneModes:modes(), gameId:gameId(),
        legacyGameId:legacyGameId(), capture, restore,
        recordEnabled:enabled => {recording=enabled;},savePortable:hooks.savePortable });
    }
    function frame() {
      if (recording && hooks.running() && !controller?.playing && hooks.tick() % 2 === 0) {
        controller?.receive("frame",{state:capture()});
      }
    }
    function stop() { controller?.stopRecord?.();controller?.stopReplay?.(false);recording=false; }
    function dispose() { controller?.dispose?.();controller=null;recording=false; }
    return {modes,gameId,capture,restore,mount,frame,stop,dispose};
  }
  return {create};
});
