(() => {
  "use strict";

  function createHistory({ capture, restore, onChange, signature = JSON.stringify, limit = 64 }) {
    let undo = [], redo = [], baseline = null;
    const sync = () => onChange?.({ canUndo: undo.length > 0, canRedo: redo.length > 0 });
    const pushSnapshot = snapshot => {
      if (!snapshot) return;
      const last = undo[undo.length - 1];
      if (!last || signature(last) !== signature(snapshot)) undo.push(snapshot);
      if (undo.length > limit) undo.shift();
      redo = [];
      sync();
    };
    return Object.freeze({
      push: () => pushSnapshot(capture()),
      pushSnapshot,
      undo() {
        const snapshot = undo.pop();
        if (!snapshot) return false;
        redo.push(capture());
        restore(snapshot);
        sync();
        return true;
      },
      redo() {
        const snapshot = redo.pop();
        if (!snapshot) return false;
        undo.push(capture());
        restore(snapshot);
        sync();
        return true;
      },
      arm: () => { baseline = capture(); },
      commit: () => { if (baseline) pushSnapshot(baseline); baseline = null; },
      clearBaseline: () => { baseline = null; },
      sync
    });
  }

  function center(state, bounds, width, height) {
    if (!state || !bounds) return false;
    state.x = width / 2 - (bounds.x + bounds.width / 2);
    state.y = height / 2 - (bounds.y + bounds.height / 2);
    return true;
  }

  function fit(state, bounds, width, height) {
    if (!center(state, bounds, width, height)) return false;
    state.scale = Math.max(0.1, Math.min(4, Math.min(width / Math.max(1, bounds.width), height / Math.max(1, bounds.height))));
    return true;
  }

  function rotate(state, delta) {
    if (!state) return false;
    state.rotation = ((Number(state.rotation || 0) + delta + 180) % 360 + 360) % 360 - 180;
    return true;
  }

  function corners(bounds, state) {
    if (!bounds || !state) return [];
    const scale = Math.max(0.1, Math.min(4, Number(state.scale) || 1));
    const rotation = (Number(state.rotation) || 0) * Math.PI / 180;
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const centerX = bounds.x + bounds.width / 2 + (Number(state.x) || 0);
    const centerY = bounds.y + bounds.height / 2 + (Number(state.y) || 0);
    const halfW = bounds.width * scale / 2, halfH = bounds.height * scale / 2;
    return [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]].map(([x, y]) => ({ x: centerX + x * cosine - y * sine, y: centerY + x * sine + y * cosine }));
  }

  function canvasPoint(clientX, clientY, rect, width, height) {
    return { x: (clientX - rect.left) * width / Math.max(1, rect.width), y: (clientY - rect.top) * height / Math.max(1, rect.height) };
  }

  function documentPoint(point, view) {
    if (!view) return null;
    return { x: (point.x - view.x) / Math.max(0.0001, view.scale), y: (point.y - view.y) / Math.max(0.0001, view.scale) };
  }

  function handlePoints(points, view, width, height, inset = 8) {
    if (!view) return [];
    return points.map(point => ({ x: Math.max(inset, Math.min(width - inset, view.x + point.x * view.scale)), y: Math.max(inset, Math.min(height - inset, view.y + point.y * view.scale)) }));
  }

  function handleAt(point, handles, radius) {
    return handles.findIndex(handle => Math.hypot(point.x - handle.x, point.y - handle.y) <= radius);
  }

  const api = Object.freeze({ createHistory, center, fit, rotate, corners, canvasPoint, documentPoint, handlePoints, handleAt });
  if (typeof globalThis !== "undefined") globalThis.PixelBugPrintWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
