(() => {
  "use strict";

  function create(options = {}) {
    const {
      ImageOperations,
      EditorFeatures,
      SelectionWorkflow,
      controls = {},
      projectWidth,
      projectHeight,
      getState,
      getFrame,
      getLayer,
      getSelectionBox,
      getSelectionMask,
      setSelection,
      applySelectionMask,
      selectionCombineMode,
      getColor,
      setLayerSource,
      setPixelDirect,
      paintPixel,
      copyPixels,
      pushHistory,
      cancelPendingHistory,
      renderAll,
      drawCanvas,
      updateSelectionStatus,
      setStatus,
      activePreset
    } = options;

    let cloneState = { source: null, anchor: null, pixels: null, drawn: null };

    const tolerance = () => Math.max(0, Math.min(255, Math.round(Number(controls.selectionTolerance?.value) || 0)));
    const strokeMode = () => ["inside", "outside", "center"].includes(controls.selectionStrokeMode?.value) ? controls.selectionStrokeMode.value : "inside";
    const currentMask = () => getSelectionMask() || EditorFeatures.boxMask(getSelectionBox(), projectWidth(), projectHeight());

    function selectCurrentColor() {
      const target = EditorFeatures.normalizeHex(getColor(), "");
      if (!target) return setStatus("Choose a drawing color first.");
      const limit = tolerance();
      const mask = ImageOperations.similarMask(getLayer().pixels, target, projectWidth(), projectHeight(), limit, EditorFeatures.createMask);
      if (!mask.size) return setStatus(`No pixels in the active layer match ${target}.`);
      applySelectionMask(mask, selectionCombineMode());
      setStatus(`Selected ${mask.size} matching pixel${mask.size === 1 ? "" : "s"} at tolerance ${limit}.`);
    }

    function invertSelection() {
      const mask = ImageOperations.invertMask(currentMask(), projectWidth(), projectHeight(), EditorFeatures.createMask, EditorFeatures.maskHas);
      setSelection(mask.size ? mask : null, mask.size ? EditorFeatures.maskBounds(mask, projectWidth(), projectHeight()) : null);
      updateSelectionStatus();
      drawCanvas();
      setStatus("Selection inverted.");
    }

    function fillSelection() {
      pushHistory();
      const target = getLayer();
      const changed = ImageOperations.fillMask(target.pixels, currentMask(), getColor(), EditorFeatures.forEachMaskPoint);
      if (!changed) { cancelPendingHistory(); return setStatus("Selected pixels already use the drawing color."); }
      setLayerSource(target);
      renderAll();
      setStatus(`Filled ${changed} selected pixel${changed === 1 ? "" : "s"}.`);
    }

    function strokeSelection() {
      pushHistory();
      const target = getLayer();
      const border = ImageOperations.borderMask(currentMask(), projectWidth(), projectHeight(), strokeMode(), EditorFeatures.createMask, EditorFeatures.morphMask, EditorFeatures.maskHas);
      const changed = ImageOperations.fillMask(target.pixels, border, getColor(), EditorFeatures.forEachMaskPoint);
      if (!changed) { cancelPendingHistory(); return setStatus("Selection stroke made no pixel changes."); }
      setLayerSource(target);
      renderAll();
      setStatus(`Stroked ${changed} pixel${changed === 1 ? "" : "s"}.`);
    }

    function borderSelection() {
      const border = ImageOperations.borderMask(currentMask(), projectWidth(), projectHeight(), strokeMode(), EditorFeatures.createMask, EditorFeatures.morphMask, EditorFeatures.maskHas);
      setSelection(border.size ? border : null, border.size ? EditorFeatures.maskBounds(border, projectWidth(), projectHeight()) : null);
      updateSelectionStatus();
      drawCanvas();
      setStatus("Selection border extracted.");
    }

    function adjustLayerColor() {
      const hue = Number(controls.layerHue?.value) || 0;
      const saturation = Number(controls.layerSaturation?.value) || 0;
      const lightness = Number(controls.layerLightness?.value) || 0;
      const brightness = Number(controls.layerBrightness?.value) || 0;
      const contrast = Number(controls.layerContrast?.value) || 0;
      const gamma = Number(controls.layerGamma?.value) || 1;
      if (!hue && !saturation && !lightness && !brightness && !contrast && gamma === 1) return setStatus("Set a color adjustment first.");
      pushHistory();
      const target = getLayer();
      target.pixels = target.pixels.map(row => row.map(value => {
        if (!value) return null;
        return ImageOperations.adjustColor(EditorFeatures.adjustColor(value, hue, saturation, lightness), brightness, contrast, gamma);
      }));
      setLayerSource(target);
      renderAll();
      setStatus("Layer colors adjusted.");
    }

    function transformLayerColors(transform, message) {
      pushHistory();
      const target = getLayer();
      const result = ImageOperations.transformPixels(target.pixels, transform);
      if (!result.changed) { cancelPendingHistory(); return setStatus("Layer colors did not change."); }
      target.pixels = result.pixels;
      setLayerSource(target);
      renderAll();
      setStatus(message);
    }

    function desaturateLayer() { transformLayerColors(ImageOperations.grayscaleColor, "Layer desaturated."); }
    function invertLayer() { transformLayerColors(ImageOperations.invertColor, "Layer colors inverted."); }

    function swapPaletteFrames() {
      const source = controls.paletteRemapSource?.value;
      const target = controls.paletteRemapTarget?.value;
      pushHistory();
      const changed = ImageOperations.swapProjectColors(getState(), source, target);
      if (!changed) { cancelPendingHistory(); return setStatus("No matching pixels were found to swap."); }
      const preset = activePreset();
      preset.colors = preset.colors.map(value => value === source ? target : value === target ? source : value);
      renderAll();
      setStatus(`${changed} pixels swapped across every frame.`);
    }

    const operationScope = () => ["layer", "visible", "frame", "project"].includes(controls.operationScope?.value) ? controls.operationScope.value : "layer";
    const operationTolerance = () => Math.max(0, Math.min(255, Math.round(Number(controls.operationTolerance?.value) || 0)));

    function operationTargets() {
      if (controls.selectionOnly?.checked) return [getLayer()];
      const scope = operationScope();
      let targets = [];
      if (scope === "layer") targets = [getLayer()];
      else if (scope === "visible") targets = getFrame().layers.filter(item => item?.visible !== false);
      else if (scope === "frame") targets = getFrame().layers;
      else targets = getState().frames.flatMap(item => Array.isArray(item?.layers) ? item.layers : []);
      const seen = new Set();
      return targets.filter(item => {
        if (!item || !Array.isArray(item.pixels) || seen.has(item.pixels)) return false;
        seen.add(item.pixels);
        return true;
      });
    }

    function operationMask(target) {
      return controls.selectionOnly?.checked && target === getLayer() && getSelectionBox() ? currentMask() : null;
    }

    function matchingOperation(replace) {
      if (controls.selectionOnly?.checked && !getSelectionBox()) return setStatus("Make a selection before using Selection Only.");
      const source = controls.operationSource?.value;
      const targetColor = controls.operationTarget?.value;
      const limit = operationTolerance();
      const targets = operationTargets();
      pushHistory();
      let changed = 0;
      targets.forEach(targetLayer => {
        const mask = operationMask(targetLayer);
        const count = replace
          ? ImageOperations.replaceColor(targetLayer.pixels, source, targetColor, limit, mask, EditorFeatures.maskHas)
          : ImageOperations.removeColor(targetLayer.pixels, source, limit, mask, EditorFeatures.maskHas);
        if (count) { changed += count; setLayerSource(targetLayer); }
      });
      if (!changed) { cancelPendingHistory(); return setStatus("No matching pixels were found."); }
      renderAll();
      setStatus(replace ? `${changed} matching pixel${changed === 1 ? "" : "s"} replaced.` : `${changed} matching pixel${changed === 1 ? "" : "s"} made transparent.`);
    }

    function pixelTransform(transform, message) {
      if (controls.selectionOnly?.checked && !getSelectionBox()) return setStatus("Make a selection before using Selection Only.");
      const targets = operationTargets();
      pushHistory();
      let changed = 0;
      targets.forEach(targetLayer => {
        const result = ImageOperations.transformPixels(targetLayer.pixels, transform, operationMask(targetLayer), EditorFeatures.maskHas);
        if (!result.changed) return;
        targetLayer.pixels = result.pixels;
        changed += result.changed;
        setLayerSource(targetLayer);
      });
      if (!changed) { cancelPendingHistory(); return setStatus("The selected operation made no changes."); }
      renderAll();
      setStatus(`${message} ${changed} pixel${changed === 1 ? "" : "s"} changed.`);
    }

    function threshold() {
      const thresholdValue = Number(controls.threshold?.value) || 0;
      const low = controls.thresholdLow?.value;
      const high = controls.thresholdHigh?.value;
      const lowTransparent = Boolean(controls.thresholdLowTransparent?.checked);
      const highTransparent = Boolean(controls.thresholdHighTransparent?.checked);
      pixelTransform(value => ImageOperations.thresholdColor(value, thresholdValue, low, high, lowTransparent, highTransparent), "Threshold applied.");
    }

    function posterize() {
      const levels = Number(controls.posterizeLevels?.value) || 4;
      pixelTransform(value => ImageOperations.posterizeColor(value, levels), "Posterize applied.");
    }

    function gradientMap() {
      const dark = controls.gradientDark?.value;
      const light = controls.gradientLight?.value;
      pixelTransform(value => ImageOperations.gradientColor(value, dark, light), "Gradient map applied.");
    }

    function paletteMap() {
      const palette = activePreset().colors;
      if (!palette.length) return setStatus("Add palette colors before using Palette Map.");
      pixelTransform(value => ImageOperations.paletteColor(value, palette), "Palette map applied.");
    }

    function offsetLayer() {
      const dx = Math.round(Number(controls.offsetX?.value) || 0);
      const dy = Math.round(Number(controls.offsetY?.value) || 0);
      if (!dx && !dy) return setStatus("Set an X or Y offset first.");
      pushHistory();
      const target = getLayer();
      target.pixels = ImageOperations.offsetGrid(target.pixels, projectWidth(), projectHeight(), dx, dy, Boolean(controls.offsetWrap?.checked));
      setLayerSource(target);
      renderAll();
      setStatus(`Layer offset by ${dx}, ${dy}${controls.offsetWrap?.checked ? " with wrapping" : ""}.`);
    }

    function setCloneSource(point) {
      cloneState = { source: point ? { ...point } : null, anchor: null, pixels: null, drawn: null };
      if (point) setStatus(`Clone source set at ${point.x + 1}, ${point.y + 1}.`);
      return Boolean(point);
    }

    function hasCloneSource() { return Boolean(cloneState.source); }

    function beginClone(point) {
      if (!cloneState.source) return false;
      cloneState.anchor = { ...point };
      cloneState.pixels = copyPixels(getLayer().pixels);
      cloneState.drawn = { ...point };
      return cloneAt(point);
    }

    function cloneAt(point) {
      if (!cloneState.source || !cloneState.anchor || !cloneState.pixels) return false;
      const half = Math.floor((Number(options.getBrushSize?.()) || 1) / 2);
      let changed = false;
      for (let oy = -half; oy <= half; oy++) for (let ox = -half; ox <= half; ox++) {
        const dx = point.x + ox;
        const dy = point.y + oy;
        const sx = cloneState.source.x + (point.x - cloneState.anchor.x) + ox;
        const sy = cloneState.source.y + (point.y - cloneState.anchor.y) + oy;
        if (sx < 0 || sy < 0 || sx >= projectWidth() || sy >= projectHeight()) continue;
        changed = paintPixel(dx, dy, cloneState.pixels[sy]?.[sx] || null, getLayer().pixels) || changed;
      }
      return changed;
    }

    function moveClone(point) {
      const start = cloneState.drawn || point;
      let x = start.x;
      let y = start.y;
      const dx = Math.abs(point.x - start.x);
      const sx = start.x < point.x ? 1 : -1;
      const dy = -Math.abs(point.y - start.y);
      const sy = start.y < point.y ? 1 : -1;
      let error = dx + dy;
      let changed = false;
      while (true) {
        changed = cloneAt({ x, y }) || changed;
        if (x === point.x && y === point.y) break;
        const twice = 2 * error;
        if (twice >= dy) { error += dy; x += sx; }
        if (twice <= dx) { error += dx; y += sy; }
      }
      cloneState.drawn = { ...point };
      return changed;
    }

    function endClone() {
      const target = getLayer();
      setLayerSource(target);
      cloneState.anchor = null;
      cloneState.pixels = null;
      cloneState.drawn = null;
    }

    function eraseConnected(point) {
      const pixels = getLayer().pixels;
      const target = pixels[point.y]?.[point.x] || null;
      if (!target) return 0;
      const mask = ImageOperations.floodSimilarMask(pixels, point.x, point.y, projectWidth(), projectHeight(), tolerance(), EditorFeatures.createMask);
      return SelectionWorkflow.clearPixels(mask, pixels, EditorFeatures, setPixelDirect);
    }

    return {
      adjustLayerColor,
      beginClone,
      borderSelection,
      desaturateLayer,
      endClone,
      eraseConnected,
      fillSelection,
      gradientMap,
      hasCloneSource,
      invertLayer,
      invertSelection,
      matchingOperation,
      moveClone,
      offsetLayer,
      paletteMap,
      posterize,
      selectCurrentColor,
      setCloneSource,
      strokeSelection,
      swapPaletteFrames,
      threshold,
      tolerance
    };
  }

  const api = { create };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PixelBugPhotoshopWorkflow = api;
})();
