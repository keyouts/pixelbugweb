(() => {
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function plainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function cloneValue(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function sameContainer(before, after) {
    return Array.isArray(before) === Array.isArray(after) && (Array.isArray(before) || plainRecord(before) && plainRecord(after));
  }

  function addChange(changes, path, before, after, beforeExists = true, afterExists = true) {
    changes.push({ path: path.slice(), before: beforeExists ? cloneValue(before) : null, after: afterExists ? cloneValue(after) : null, beforeExists, afterExists });
  }

  function compare(before, after, path, changes, limit) {
    if (Object.is(before, after)) return;
    if (changes.length >= limit) return;
    if (!before || !after || typeof before !== "object" || typeof after !== "object" || !sameContainer(before, after)) {
      addChange(changes, path, before, after);
      return;
    }
    if (Array.isArray(before)) {
      if (before.length !== after.length) {
        addChange(changes, path, before, after);
        return;
      }
      for (let index = 0; index < before.length; index++) compare(before[index], after[index], path.concat(index), changes, limit);
      return;
    }
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const beforeExists = hasOwn(before, key);
      const afterExists = hasOwn(after, key);
      if (!beforeExists || !afterExists) addChange(changes, path.concat(key), before[key], after[key], beforeExists, afterExists);
      else compare(before[key], after[key], path.concat(key), changes, limit);
      if (changes.length >= limit) return;
    }
  }

  function create(before, after, options = {}) {
    const limit = Math.max(1000, Math.min(Number(options.limit) || 500000, 1000000));
    const changes = [];
    compare(before, after, [], changes, limit);
    if (changes.length >= limit) return { version: 1, changes: [{ path: [], before: cloneValue(before), after: cloneValue(after), beforeExists: true, afterExists: true }], fallback: true };
    return { version: 1, changes };
  }

  function parentAt(root, path) {
    let current = root;
    for (let index = 0; index < path.length - 1; index++) current = current[path[index]];
    return current;
  }

  function apply(root, patch, direction) {
    const undo = direction === "undo";
    const source = Array.isArray(patch?.changes) ? patch.changes : [];
    const changes = undo ? source.slice().reverse() : source;
    let nextRoot = root;
    for (const change of changes) {
      const exists = undo ? change.beforeExists !== false : change.afterExists !== false;
      const value = undo ? change.before : change.after;
      if (!change.path.length) {
        nextRoot = exists ? cloneValue(value) : undefined;
        continue;
      }
      const parent = parentAt(nextRoot, change.path);
      const key = change.path[change.path.length - 1];
      if (!exists) {
        if (Array.isArray(parent) && Number.isInteger(key)) parent.splice(key, 1);
        else delete parent[key];
      } else parent[key] = cloneValue(value);
    }
    return nextRoot;
  }

  function estimate(patch) {
    try { return JSON.stringify(patch).length; } catch (_error) { return 0; }
  }

  const api = Object.freeze({ apply, cloneValue, create, estimate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugHistoryPatches = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
