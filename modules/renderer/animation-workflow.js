(() => {
  const ONION_SETTINGS_STORAGE_KEY = "pixelbug-onion-settings-v1";
  const TIMELINE_ZOOM_STORAGE_KEY = "pixelbug-timeline-zoom-v1";

  function loadSettings(isHexColor) {
    try {
      const saved = JSON.parse(localStorage.getItem(ONION_SETTINGS_STORAGE_KEY) || "{}");
      return {
        distance: Math.max(1, Math.min(Number(saved.distance) || 1, 4)),
        previousColor: isHexColor(saved.previousColor) ? saved.previousColor : "#ff3355",
        previousOpacity: Math.max(0.05, Math.min(Number(saved.previousOpacity) || 0.22, 0.6)),
        nextColor: isHexColor(saved.nextColor) ? saved.nextColor : "#33aaff",
        nextOpacity: Math.max(0.05, Math.min(Number(saved.nextOpacity) || 0.16, 0.6))
      };
    } catch (_error) {
      return { distance: 1, previousColor: "#ff3355", previousOpacity: 0.22, nextColor: "#33aaff", nextOpacity: 0.16 };
    }
  }

  function create(options) {
    const {
      WorkflowFeatures,
      clone,
      pushHistory,
      clampActive,
      renderAll,
      renderFrames,
      setStatus,
      drawCanvas,
      flattenedPixels,
      projectWidth,
      projectHeight,
      renderScratchCtx,
      isHexColor,
      maxProjectFrames,
      getState,
      getShowOnion,
      getSelectedFrames,
      setSelectedFrames,
      getFrameAnchor,
      setFrameAnchor
    } = options;

    let onionSettings = loadSettings(isHexColor);

    function saveSettings() {
      try { localStorage.setItem(ONION_SETTINGS_STORAGE_KEY, JSON.stringify(onionSettings)); } catch (_error) {}
    }

    function drawTintedFrame(projectFrame, tint, alpha, targetContext = renderScratchCtx) {
      if (!projectFrame || alpha <= 0) return;
      const pixels = flattenedPixels(projectFrame);
      targetContext.save();
      targetContext.globalAlpha = alpha;
      targetContext.fillStyle = tint;
      for (let y = 0; y < projectHeight(); y++) for (let x = 0; x < projectWidth(); x++) if (pixels[y]?.[x]) targetContext.fillRect(x, y, 1, 1);
      targetContext.restore();
    }

    function drawOnionFrames() {
      if (!getShowOnion()) return;
      const state = getState();
      const distance = onionSettings.distance;
      for (let offset = distance; offset >= 1; offset--) {
        const falloff = 1 - (offset - 1) / Math.max(1, distance + 0.5);
        const previousIndex = state.activeFrame - offset;
        const nextIndex = state.activeFrame + offset;
        if (previousIndex >= 0) drawTintedFrame(state.frames[previousIndex], onionSettings.previousColor, onionSettings.previousOpacity * falloff);
        if (nextIndex < state.frames.length) drawTintedFrame(state.frames[nextIndex], onionSettings.nextColor, onionSettings.nextOpacity * falloff);
      }
    }

    function setupTimelineSettings() {
      const timelineZoom = document.querySelector("#timeline-zoom");
      const onionDistance = document.querySelector("#onion-distance");
      const previousColor = document.querySelector("#onion-previous-color");
      const previousOpacity = document.querySelector("#onion-previous-opacity");
      const nextColor = document.querySelector("#onion-next-color");
      const nextOpacity = document.querySelector("#onion-next-opacity");
      const savedZoom = Math.max(72, Math.min(Number(localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY)) || 96, 180));
      if (timelineZoom) timelineZoom.value = String(savedZoom);
      document.querySelector("#frames-list")?.style.setProperty("--timeline-row-size", `${savedZoom}px`);
      if (onionDistance) onionDistance.value = String(onionSettings.distance);
      if (previousColor) previousColor.value = onionSettings.previousColor;
      if (previousOpacity) previousOpacity.value = String(Math.round(onionSettings.previousOpacity * 100));
      if (nextColor) nextColor.value = onionSettings.nextColor;
      if (nextOpacity) nextOpacity.value = String(Math.round(onionSettings.nextOpacity * 100));
      timelineZoom?.addEventListener("input", () => {
        const value = Math.max(72, Math.min(Number(timelineZoom.value) || 96, 180));
        document.querySelector("#frames-list")?.style.setProperty("--timeline-row-size", `${value}px`);
        localStorage.setItem(TIMELINE_ZOOM_STORAGE_KEY, String(value));
      });
      [onionDistance, previousColor, previousOpacity, nextColor, nextOpacity].filter(Boolean).forEach(input => input.addEventListener("input", () => {
        onionSettings = {
          distance: Math.max(1, Math.min(Number(onionDistance?.value) || 1, 4)),
          previousColor: isHexColor(previousColor?.value) ? previousColor.value : "#ff3355",
          previousOpacity: Math.max(0.05, Math.min((Number(previousOpacity?.value) || 22) / 100, 0.6)),
          nextColor: isHexColor(nextColor?.value) ? nextColor.value : "#33aaff",
          nextOpacity: Math.max(0.05, Math.min((Number(nextOpacity?.value) || 16) / 100, 0.6))
        };
        saveSettings();
        drawCanvas();
      }));
    }

    function nearestFrameMapping(keptIndexes, oldLength) {
      const mapping = new Map();
      keptIndexes.forEach((oldIndex, newIndex) => mapping.set(oldIndex, newIndex));
      for (let oldIndex = 0; oldIndex < oldLength; oldIndex++) {
        if (mapping.has(oldIndex)) continue;
        let best = keptIndexes[0] || 0;
        keptIndexes.forEach(candidate => { if (Math.abs(candidate - oldIndex) < Math.abs(best - oldIndex)) best = candidate; });
        mapping.set(oldIndex, mapping.get(best) || 0);
      }
      return mapping;
    }

    function remapFrameRecord(record, mapping, frameCount) {
      if (!record || typeof record !== "object") return;
      const remap = value => {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 0) return number;
        return Math.max(0, Math.min(mapping.get(number) ?? number, frameCount - 1));
      };
      ["idleFrame", "walkFrame", "jumpFrame", "backgroundFrame", "sceneryFrame"].forEach(key => {
        if (key in record && Number(record[key]) >= 0) record[key] = remap(record[key]);
      });
      (record.visualLayers || []).forEach(item => { if (Number(item.frame) >= 0) item.frame = remap(item.frame); });
      (record.props || []).forEach(item => { if (Number(item.frame) >= 0) item.frame = remap(item.frame); });
      (record.dialogue?.characters || []).forEach(item => { if (Number(item.frame) >= 0) item.frame = remap(item.frame); });
      (record.dialogue?.lines || []).forEach(item => { if (Number(item.frame) >= 0) item.frame = remap(item.frame); });
    }

    function remapAllFrameReferences(mapping) {
      const state = getState();
      const frameCount = state.frames.length;
      state.frames.forEach(projectFrame => projectFrame.layers.forEach(projectLayer => {
        if (Number(projectLayer.linkedFrame) < 0) return;
        projectLayer.linkedFrame = mapping.get(Number(projectLayer.linkedFrame)) ?? -1;
        if (projectLayer.linkedFrame < 0 || projectLayer.linkedFrame >= frameCount) {
          projectLayer.linkedFrame = -1;
          projectLayer.linkedLayer = -1;
        }
      }));
      (state.animation?.clips || []).forEach(clip => {
        const start = mapping.get(Number(clip.start)) ?? 0;
        const end = mapping.get(Number(clip.end)) ?? Math.max(0, frameCount - 1);
        clip.start = Math.max(0, Math.min(start, end, frameCount - 1));
        clip.end = Math.max(clip.start, Math.min(Math.max(start, end), frameCount - 1));
      });
      remapFrameRecord(state.playMode, mapping, frameCount);
      (state.playMode?.scenes || []).forEach(scene => remapFrameRecord(scene, mapping, frameCount));
    }

    function selectAllFrames() {
      const state = getState();
      const selected = new Set(state.frames.map((_frame, index) => index));
      setSelectedFrames(selected);
      setFrameAnchor(state.activeFrame);
      renderFrames();
      setStatus(`${selected.size} frames selected.`);
    }

    function duplicateSelectedFrames() {
      const state = getState();
      const indexes = WorkflowFeatures.normalizeFrameIndexes([...getSelectedFrames()], state.frames.length);
      if (!indexes.length || state.frames.length + indexes.length > maxProjectFrames) return setStatus("The selected frames would exceed the frame limit.");
      pushHistory();
      const oldLength = state.frames.length;
      const insertAt = indexes[indexes.length - 1] + 1;
      const copies = indexes.map(index => clone(state.frames[index]));
      state.frames.splice(insertAt, 0, ...copies);
      const mapping = new Map();
      for (let index = 0; index < oldLength; index++) mapping.set(index, index < insertAt ? index : index + copies.length);
      remapAllFrameReferences(mapping);
      setSelectedFrames(new Set(copies.map((_copy, index) => insertAt + index)));
      state.activeFrame = insertAt;
      setFrameAnchor(insertAt);
      clampActive();
      renderAll();
      setStatus(`${copies.length} selected frame${copies.length === 1 ? "" : "s"} duplicated.`);
    }

    function deleteSelectedFrames() {
      const state = getState();
      const indexes = WorkflowFeatures.normalizeFrameIndexes([...getSelectedFrames()], state.frames.length);
      if (!indexes.length) return;
      if (indexes.length >= state.frames.length) return setStatus("At least one frame is required.");
      pushHistory();
      const oldLength = state.frames.length;
      const removed = new Set(indexes);
      const keptIndexes = Array.from({ length: oldLength }, (_value, index) => index).filter(index => !removed.has(index));
      state.frames = keptIndexes.map(index => state.frames[index]);
      const mapping = nearestFrameMapping(keptIndexes, oldLength);
      remapAllFrameReferences(mapping);
      const nextActive = mapping.get(state.activeFrame) ?? 0;
      state.activeFrame = Math.max(0, Math.min(nextActive, state.frames.length - 1));
      setSelectedFrames(new Set([state.activeFrame]));
      setFrameAnchor(state.activeFrame);
      clampActive();
      renderAll();
      setStatus(`${indexes.length} selected frame${indexes.length === 1 ? "" : "s"} deleted.`);
    }

    function reverseSelectedFrames() {
      const state = getState();
      const indexes = WorkflowFeatures.normalizeFrameIndexes([...getSelectedFrames()], state.frames.length);
      if (indexes.length < 2) return setStatus("Select at least two frames to reverse.");
      pushHistory();
      const reversedFrames = indexes.map(index => state.frames[index]).reverse();
      const mapping = new Map(Array.from({ length: state.frames.length }, (_value, index) => [index, index]));
      indexes.forEach((oldIndex, position) => mapping.set(oldIndex, indexes[indexes.length - 1 - position]));
      indexes.forEach((targetIndex, position) => { state.frames[targetIndex] = reversedFrames[position]; });
      remapAllFrameReferences(mapping);
      state.activeFrame = mapping.get(state.activeFrame) ?? state.activeFrame;
      setSelectedFrames(new Set(indexes));
      setFrameAnchor(state.activeFrame);
      clampActive();
      renderAll();
      setStatus(`${indexes.length} selected frames reversed.`);
    }

    function setup() {
      setupTimelineSettings();
      document.querySelector("#frame-select-all-btn")?.addEventListener("click", selectAllFrames);
      document.querySelector("#frame-duplicate-selected-btn")?.addEventListener("click", duplicateSelectedFrames);
      document.querySelector("#frame-delete-selected-btn")?.addEventListener("click", deleteSelectedFrames);
      document.querySelector("#frame-reverse-selected-btn")?.addEventListener("click", reverseSelectedFrames);
    }

    return Object.freeze({
      deleteSelectedFrames,
      drawOnionFrames,
      duplicateSelectedFrames,
      reverseSelectedFrames,
      selectAllFrames,
      setup
    });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugAnimationWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
