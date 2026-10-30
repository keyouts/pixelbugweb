(() => {
  "use strict";
  // Bounded diffs
  function create(maxEntries = 40) {
    const undoStack = [], redoStack = [];
    let active = null;
    function begin() { if (!active) active = new Map(); }
    function touch(key, values) {
      if (active && values && !active.has(key)) active.set(key, values.slice());
    }
    function commit(resolve) {
      if (!active) return false;
      const changes = [];
      for (const [key, before] of active) {
        const after = resolve(key);
        if (!after || after.length !== before.length) continue;
        const indices = [], oldValues = [], newValues = [];
        for (let i = 0; i < before.length; i++) if (after[i] !== before[i]) {
          indices.push(i); oldValues.push(before[i]); newValues.push(after[i]);
        }
        if (indices.length) changes.push({ key, indices, oldValues, newValues });
      }
      active = null;
      if (!changes.length) return false;
      undoStack.push(changes);
      if (undoStack.length > maxEntries) undoStack.shift();
      redoStack.length = 0;
      return true;
    }
    function apply(from, to, resolve, field) {
      if (!from.length || active) return false;
      const changes = from[from.length - 1];
      // Atomic validation
      if (changes.some(c => !resolve(c.key) || c.indices[c.indices.length-1] >= resolve(c.key).length)) return false;
      for (const change of changes) {
        const values = resolve(change.key);
        for (let i = 0; i < change.indices.length; i++) values[change.indices[i]] = change[field][i];
      }
      to.push(from.pop()); return true;
    }
    return Object.freeze({ begin, touch, commit, cancel:()=>{active=null;}, undo:resolve=>apply(undoStack,redoStack,resolve,"oldValues"), redo:resolve=>apply(redoStack,undoStack,resolve,"newValues"), clear:()=>{active=null;undoStack.length=0;redoStack.length=0;}, canUndo:()=>undoStack.length>0,canRedo:()=>redoStack.length>0 });
  }
  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainEditHistory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
