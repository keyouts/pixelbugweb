(() => {
  function create(options) {
    const {
      WorkflowFeatures,
      clone,
      extractPixels,
      currentSelectionMask,
      getSelectionBox,
      setSelectionBox,
      setSelectionMask,
      getSelectedFrames,
      getState,
      pushHistory,
      setLayerSource,
      projectWidth,
      projectHeight,
      clampSelectionBox,
      invalidatePixelBufferCache,
      renderAll,
      setStatus,
      flattenedPixels,
      frame,
      canvasBackgroundColor,
      canvasInkColor
    } = options;

    const button = document.querySelector("#selection-transform-btn");
    const overlay = document.querySelector("#selection-transform-overlay");
    const closeButton = document.querySelector("#close-selection-transform-btn");
    const preview = document.querySelector("#selection-transform-preview");
    const status = document.querySelector("#selection-transform-status");
    let session = null;

    function input(id) {
      return document.querySelector(`#selection-transform-${id}`);
    }

    function readOptions() {
      return {
        x: Math.round(Number(input("x")?.value) || 0),
        y: Math.round(Number(input("y")?.value) || 0),
        width: Math.max(1, Math.min(Number(input("width")?.value) || 1, 512)),
        height: Math.max(1, Math.min(Number(input("height")?.value) || 1, 512)),
        rotation: Number(input("rotation")?.value) || 0,
        scope: input("scope")?.value || "active-layer",
        frames: input("frames")?.value || "active",
        duplicate: input("duplicate")?.checked === true,
        flipH: input("flip-h")?.checked === true,
        flipV: input("flip-v")?.checked === true
      };
    }

    function drawPreview() {
      if (!session || !preview) return;
      const context = preview.getContext("2d");
      const transformOptions = readOptions();
      const transformed = WorkflowFeatures.transformSelection(session.data, transformOptions);
      const size = Math.max(projectWidth(), projectHeight());
      const scale = Math.max(1, Math.floor(Math.min(preview.width / size, preview.height / size)));
      const offsetX = Math.floor((preview.width - projectWidth() * scale) / 2);
      const offsetY = Math.floor((preview.height - projectHeight() * scale) / 2);
      context.clearRect(0, 0, preview.width, preview.height);
      context.fillStyle = canvasBackgroundColor();
      context.fillRect(0, 0, preview.width, preview.height);
      const base = flattenedPixels(frame());
      context.globalAlpha = 0.28;
      for (let y = 0; y < projectHeight(); y++) for (let x = 0; x < projectWidth(); x++) if (base[y]?.[x]) {
        context.fillStyle = base[y][x];
        context.fillRect(offsetX + x * scale, offsetY + y * scale, scale, scale);
      }
      context.globalAlpha = 1;
      for (let y = 0; y < transformed.h; y++) for (let x = 0; x < transformed.w; x++) {
        if (!transformed.mask[y]?.[x] || !transformed.pixels[y]?.[x]) continue;
        const targetX = transformOptions.x + x;
        const targetY = transformOptions.y + y;
        if (targetX < 0 || targetY < 0 || targetX >= projectWidth() || targetY >= projectHeight()) continue;
        context.fillStyle = transformed.pixels[y][x];
        context.fillRect(offsetX + targetX * scale, offsetY + targetY * scale, scale, scale);
      }
      context.strokeStyle = canvasInkColor();
      context.lineWidth = 2;
      context.strokeRect(offsetX, offsetY, projectWidth() * scale, projectHeight() * scale);
      if (status) status.textContent = `${transformed.w} × ${transformed.h} at ${transformOptions.x}, ${transformOptions.y}.`;
    }

    function open() {
      const selectionBox = getSelectionBox();
      if (!selectionBox) return setStatus("Make a selection before opening Transform.");
      const data = extractPixels(selectionBox, false);
      session = { box: { ...selectionBox }, data: clone(data), mask: new Set(currentSelectionMask()), ratio: selectionBox.w / selectionBox.h, rotation: 0 };
      input("x").value = String(selectionBox.x);
      input("y").value = String(selectionBox.y);
      input("width").value = String(selectionBox.w);
      input("height").value = String(selectionBox.h);
      input("rotation").value = "0";
      input("frames").disabled = getSelectedFrames().size <= 1;
      overlay.hidden = false;
      button?.setAttribute("aria-expanded", "true");
      drawPreview();
      input("x")?.focus();
    }

    function close() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      button?.setAttribute("aria-expanded", "false");
      session = null;
      button?.focus();
    }

    function layerSelectionData(targetLayer, box, maskSet) {
      const pixels = Array.from({ length: box.h }, () => Array.from({ length: box.w }, () => null));
      const mask = Array.from({ length: box.h }, () => Array.from({ length: box.w }, () => false));
      for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
        const sourceX = box.x + x;
        const sourceY = box.y + y;
        if (!maskSet.has(`${sourceX},${sourceY}`)) continue;
        mask[y][x] = true;
        pixels[y][x] = targetLayer.pixels[sourceY]?.[sourceX] || null;
      }
      return { w: box.w, h: box.h, pixels, mask };
    }

    function apply() {
      if (!session) return;
      const state = getState();
      const transformOptions = readOptions();
      const frameIndexes = transformOptions.frames === "selected" ? WorkflowFeatures.normalizeFrameIndexes([...getSelectedFrames()], state.frames.length) : [state.activeFrame];
      pushHistory();
      let changedLayers = 0;
      frameIndexes.forEach(frameIndex => {
        const projectFrame = state.frames[frameIndex];
        const layerIndexes = transformOptions.scope === "visible-layers"
          ? projectFrame.layers.map((projectLayer, index) => projectLayer.visible !== false ? index : -1).filter(index => index >= 0)
          : [Math.min(state.activeLayer, projectFrame.layers.length - 1)];
        layerIndexes.forEach(layerIndex => {
          const targetLayer = projectFrame.layers[layerIndex];
          const source = layerSelectionData(targetLayer, session.box, session.mask);
          const transformed = WorkflowFeatures.transformSelection(source, transformOptions);
          if (!transformOptions.duplicate) {
            session.mask.forEach(key => {
              const [x, y] = key.split(",").map(Number);
              if (targetLayer.pixels[y]?.[x] !== undefined) targetLayer.pixels[y][x] = null;
            });
          }
          for (let y = 0; y < transformed.h; y++) for (let x = 0; x < transformed.w; x++) {
            if (!transformed.mask[y]?.[x]) continue;
            const pixel = transformed.pixels[y]?.[x];
            if (!pixel) continue;
            const targetX = transformOptions.x + x;
            const targetY = transformOptions.y + y;
            if (targetX >= 0 && targetY >= 0 && targetX < projectWidth() && targetY < projectHeight()) targetLayer.pixels[targetY][targetX] = pixel;
          }
          setLayerSource(targetLayer, projectWidth(), projectHeight());
          changedLayers++;
        });
      });
      invalidatePixelBufferCache();
      const transformed = WorkflowFeatures.transformSelection(session.data, transformOptions);
      setSelectionBox(clampSelectionBox({ x: transformOptions.x, y: transformOptions.y, w: transformed.w, h: transformed.h }));
      const nextMask = new Set();
      for (let y = 0; y < transformed.h; y++) for (let x = 0; x < transformed.w; x++) if (transformed.mask[y]?.[x]) {
        const targetX = transformOptions.x + x;
        const targetY = transformOptions.y + y;
        if (targetX >= 0 && targetY >= 0 && targetX < projectWidth() && targetY < projectHeight()) nextMask.add(`${targetX},${targetY}`);
      }
      setSelectionMask(nextMask);
      close();
      renderAll();
      setStatus(`Selection transformed across ${changedLayers} layer${changedLayers === 1 ? "" : "s"}.`);
    }

    function updatePosition() {
      if (!session) return;
      const position = WorkflowFeatures.anchoredPosition(session.box, Number(input("width")?.value), Number(input("height")?.value), input("anchor")?.value);
      input("x").value = String(position.x);
      input("y").value = String(position.y);
    }

    function updateDimensions(changed) {
      if (!session || input("aspect")?.checked !== true) return;
      const turns = ((Number(session.rotation) || 0) / 90) % 2;
      const ratio = turns ? 1 / (session.ratio || 1) : session.ratio || 1;
      if (changed === "width") input("height").value = String(Math.max(1, Math.round((Number(input("width").value) || 1) / ratio)));
      else input("width").value = String(Math.max(1, Math.round((Number(input("height").value) || 1) * ratio)));
      updatePosition();
    }

    function updateRotation() {
      if (!session) return;
      const previousTurns = ((Number(session.rotation) || 0) / 90) % 2;
      const nextRotation = Number(input("rotation")?.value) || 0;
      const nextTurns = (nextRotation / 90) % 2;
      if (previousTurns !== nextTurns) {
        const width = input("width").value;
        input("width").value = input("height").value;
        input("height").value = width;
      }
      session.rotation = nextRotation;
      updatePosition();
      drawPreview();
    }

    function setup() {
      button?.addEventListener("click", open);
      closeButton?.addEventListener("click", close);
      overlay?.addEventListener("click", event => { if (event.target === overlay) close(); });
      ["x", "y", "width", "height", "scope", "frames", "aspect", "duplicate", "flip-h", "flip-v"].forEach(id => {
        const field = input(id);
        field?.addEventListener("input", () => { if (id === "width" || id === "height") updateDimensions(id); drawPreview(); });
        field?.addEventListener("change", drawPreview);
      });
      input("anchor")?.addEventListener("change", () => { updatePosition(); drawPreview(); });
      input("rotation")?.addEventListener("change", updateRotation);
      document.querySelector("#apply-selection-transform-btn")?.addEventListener("click", apply);
    }

    return Object.freeze({ apply, close, open, setup });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTransformWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
