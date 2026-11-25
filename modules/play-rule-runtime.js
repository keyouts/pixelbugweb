"use strict";

// Rule semantics
(function attachPlayRuleRuntime(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayRuleRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayRuleRuntime() {
  const MAX_INVENTORY = 64;

  function text(value) {
    return String(value == null ? "" : value);
  }

  function cleanItem(value) {
    return text(value).trim().slice(0, 40);
  }

  function variableName(value, fallback = "score") {
    const candidate = text(value).trim().slice(0, 32);
    return candidate && !["__proto__", "prototype", "constructor"].includes(candidate) ? candidate : fallback;
  }

  function copyState(state = {}) {
    const variables = state.variables && typeof state.variables === "object" && !Array.isArray(state.variables) ? { ...state.variables } : {};
    const inventory = Array.isArray(state.inventory)
      ? [...new Set(state.inventory.map(cleanItem).filter(Boolean))].slice(0, MAX_INVENTORY)
      : [];
    return { variables, inventory };
  }

  function compareNumbers(left, operator, right) {
    if (operator === "=") return left === right;
    if (operator === "!=") return left !== right;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }

  function boundedMath(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(-1000000000, Math.min(1000000000, value)) * 10000) / 10000;
  }

  function calculate(previous, operation, operand) {
    const left = Number.isFinite(Number(previous)) ? Number(previous) : 0;
    const right = Number.isFinite(Number(operand)) ? Number(operand) : 0;
    if (operation === "subtract") return boundedMath(left - right);
    if (operation === "multiply") return boundedMath(left * right);
    if (operation === "divide") return right === 0 ? boundedMath(left) : boundedMath(left / right);
    if (operation === "modulo") return right === 0 ? boundedMath(left) : boundedMath(left % right);
    if (operation === "set") return boundedMath(right);
    return boundedMath(left + right);
  }

  function snapshot(state) {
    return { variables: { ...state.variables }, inventory: [...state.inventory] };
  }

  function evaluateNode(node, state = {}, options = {}) {
    if (!node || typeof node !== "object") return null;
    const runtime = copyState(state);
    const before = snapshot(runtime);
    const data = node.data && typeof node.data === "object" ? node.data : {};
    let nextId = text(node.next);
    let continuationId = "";
    let delayMs = 0;
    let predicate = null;
    const effects = [];

    if (node.type === "actionMessage") {
      effects.push({ type: "message", textLine: Number(data.textLine), message: text(data.message || node.name || "Message") });
      if (nextId) delayMs = 1100;
    }
    if (node.type === "actionDialogue") {
      continuationId = nextId;
      nextId = "";
      effects.push({ type: "dialogue", line: Math.max(0, Number(data.line) || 0), continuationId });
    }
    if (node.type === "actionCheckpoint") effects.push({ type: "checkpoint" });
    if (node.type === "actionMoveActor") effects.push({ type: "moveActor", dx: Number(data.dx) || 0, dy: Number(data.dy) || 0 });
    if (node.type === "actionFinish") {
      effects.push({ type: "finish", message: text(data.message || "Finished.") });
      nextId = "";
    }
    if (node.type === "actionAddItem") {
      const item = cleanItem(data.item);
      if (item && !runtime.inventory.includes(item) && runtime.inventory.length < MAX_INVENTORY) runtime.inventory.push(item);
    }
    if (node.type === "actionRemoveItem") {
      const item = cleanItem(data.item);
      runtime.inventory = runtime.inventory.filter(entry => entry !== item);
    }
    if (node.type === "actionScene") {
      nextId = "";
      effects.push({ type: "scene", sceneId: text(data.sceneId) });
    }
    if (node.type === "actionPlaySound") effects.push({ type: "playSound", assetId: text(data.audioAssetId), volume: Number(data.audioVolume), loop: data.audioLoop === true });
    if (node.type === "actionStopSound") effects.push({ type: "stopSound", scope: ["all", "music", "sfx"].includes(data.audioStopScope) ? data.audioStopScope : "all" });
    if (node.type === "actionSetVariable") {
      const key = variableName(data.variable, "flag");
      runtime.variables[key] = text(data.value == null ? "true" : data.value);
    }
    if (node.type === "actionChangeNumber") {
      const key = variableName(data.variable);
      const previous = Number(runtime.variables[key]) || 0;
      runtime.variables[key] = String(calculate(previous, "add", data.amount));
    }
    if (node.type === "actionMathNumber") {
      const key = variableName(data.variable);
      const operation = ["set", "add", "subtract", "multiply", "divide", "modulo"].includes(data.mathOperation) ? data.mathOperation : "add";
      const operand = Math.max(-1000000, Math.min(1000000, Number(data.operand) || 0));
      const previous = Number(runtime.variables[key]) || 0;
      runtime.variables[key] = String(calculate(previous, operation, operand));
    }
    if (node.type === "actionRollNumber") {
      const key = variableName(data.variable, "roll");
      const first = Math.max(1, Math.min(1000, Math.round(Number(data.rollMin) || 1)));
      const last = Math.max(1, Math.min(1000, Math.round(Number(data.rollMax) || 6)));
      const low = Math.min(first, last), high = Math.max(first, last);
      const source = typeof options.random === "function" ? options.random() : Math.random();
      const chance = Number.isFinite(source) ? Math.max(0, Math.min(0.999999999999, source)) : 0;
      runtime.variables[key] = String(low + Math.floor(chance * (high - low + 1)));
    }
    if (node.type === "logicVariable") {
      const key = variableName(data.variable, "flag");
      const actual = text(runtime.variables[key]);
      const expected = text(data.equals == null ? "true" : data.equals);
      const matched = actual === expected;
      nextId = matched ? text(node.next) : text(node.alt);
      predicate = { kind: "value", variable: key, actual, operator: "=", expected, matched, route: matched ? "Then" : "Else" };
    }
    if (node.type === "logicHasItem") {
      const item = cleanItem(data.item);
      const matched = runtime.inventory.includes(item);
      nextId = matched ? text(node.next) : text(node.alt);
      predicate = { kind: "membership", item, matched, route: matched ? "Then" : "Else" };
    }
    if (node.type === "logicCompareNumber") {
      const key = variableName(data.variable);
      const actual = Number(runtime.variables[key]) || 0;
      const operator = ["=", "!=", "<", "<=", ">", ">="].includes(data.operator) ? data.operator : ">=";
      const expected = Number(data.compare) || 0;
      const matched = compareNumbers(actual, operator, expected);
      nextId = matched ? text(node.next) : text(node.alt);
      predicate = { kind: "number", variable: key, actual, operator, expected, matched, route: matched ? "Then" : "Else" };
    }

    return {
      nodeId: text(node.id),
      nodeType: text(node.type),
      state: runtime,
      before,
      after: snapshot(runtime),
      nextId,
      continuationId,
      delayMs,
      effects,
      predicate
    };
  }

  function eventMatches(node, type, payload = {}, currentSceneId = "") {
    if (!node || typeof node !== "object") return false;
    const data = node.data && typeof node.data === "object" ? node.data : {};
    const sceneId = text(currentSceneId || payload.sceneId);
    if (type === "sceneStart") return node.type === "eventStart" && (!data.sceneId || text(data.sceneId) === text(payload.sceneId));
    if (type === "triggerEnter") {
      const choices = new Set(["any", payload.name, payload.id, ...(Array.isArray(payload.ids) ? payload.ids : [])].map(text));
      return node.type === "eventTrigger" && (!data.sceneId || text(data.sceneId) === sceneId) && choices.has(text(data.trigger || "any"));
    }
    if (type === "characterInteract") {
      const choices = new Set(["any", payload.name, payload.id].map(text));
      return node.type === "eventInteract" && (!data.sceneId || text(data.sceneId) === sceneId) && choices.has(text(data.character || "any"));
    }
    return false;
  }

  const MAX_RULE_STEPS = 40;
  function analyzeGraph(nodes = []) {
    if (!Array.isArray(nodes)) return [{ id: "", kind: "invalid", message: "Rule graph must contain a list of nodes." }];
    const issues = [];
    const byId = new Map();
    for (const node of nodes) {
      const id = text(node?.id);
      if (!id) { issues.push({ id: "", kind: "invalid", message: "A rule has no ID." }); continue; }
      if (byId.has(id)) issues.push({ id, kind: "duplicate", message: `Rule ID ${id} is duplicated.` });
      else byId.set(id, node);
    }
    for (const [id, node] of byId) {
      for (const route of ["next", "alt"]) {
        const target = text(node?.[route]);
        if (target && !byId.has(target)) issues.push({ id, kind: "dangling", message: `${route === "alt" ? "Else" : "Next/Then"} connection points to missing rule ${target}.` });
      }
    }
    const visiting = new Set(), visited = new Set(), cyclic = new Set();
    function walk(id) {
      if (visiting.has(id)) { cyclic.add(id); return; }
      if (visited.has(id) || !byId.has(id)) return;
      visiting.add(id);
      const node = byId.get(id);
      for (const route of ["next", "alt"]) {
        const target = text(node?.[route]);
        if (visiting.has(target)) { cyclic.add(id); cyclic.add(target); }
        if (target) walk(target);
      }
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of byId.keys()) walk(id);
    for (const id of cyclic) issues.push({ id, kind: "cycle", message: "This path contains a rule cycle; play execution stops when it revisits a rule." });
    if (byId.size > 100) issues.push({ id: "", kind: "limit", message: "The rule editor supports at most 100 rules." });
    return issues;
  }
  function createRuleQueue() {
    let pending = [];
    let sequence = 0;
    const MAX_PENDING = 512;
    function schedule(id, seen, generation, delayMs, tick) {
      if (!id || pending.length >= MAX_PENDING) return false;
      const ticks = Math.max(0, Math.ceil(Math.max(0, Number(delayMs) || 0) * 60 / 1000));
      pending.push({ id: text(id), seen: [...seen].map(text), generation, due: Math.floor(Number(tick) || 0) + ticks, sequence: sequence++ });
      return true;
    }
    function takeReady(tick, generation) {
      const ready = [], future = [];
      for (const entry of pending) {
        if (entry.generation !== generation) continue;
        if (entry.due <= tick) ready.push(entry);
        else future.push(entry);
      }
      pending = future;
      ready.sort((a, b) => a.due - b.due || a.sequence - b.sequence);
      return ready;
    }
    function clear() { pending = []; }
    function size() { return pending.length; }
    function snapshot(tick, generation) {
      return pending.filter(entry => entry.generation === generation).map(entry => ({
        id:entry.id, seen:entry.seen.slice(), remaining:Math.max(0, entry.due - tick), sequence:entry.sequence
      }));
    }
    function restore(entries, tick, generation) {
      clear();
      if (!Array.isArray(entries)) return;
      for (const entry of entries.slice(0, MAX_PENDING)) {
        if (!entry || typeof entry.id !== "string" || !entry.id || !Array.isArray(entry.seen)) continue;
        const remaining = Math.max(0, Math.min(36000, Math.floor(Number(entry.remaining) || 0)));
        pending.push({ id:entry.id.slice(0, 96), seen:entry.seen.slice(0, 100).map(text),
          generation, due:Math.floor(Number(tick) || 0) + remaining, sequence:sequence++ });
      }
    }
    return { schedule, takeReady, clear, size, snapshot, restore };
  }

  function createSeededRandom(seed = 1337) {
    let value = Number.isFinite(Number(seed)) ? (Math.trunc(Number(seed)) >>> 0) : 1337;
    const random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
    random.getState = () => value;
    random.setState = next => { if (Number.isInteger(next)) value = next >>> 0; };
    return random;
  }

  function replayGraph(nodes = [], startId = "", state = {}, seed = 1337, maxSteps = MAX_RULE_STEPS) {
    const byId = new Map((Array.isArray(nodes) ? nodes : []).filter(Boolean).map(node => [text(node.id), node]));
    const random = createSeededRandom(seed);
    const seen = new Set();
    const trace = [];
    let nextId = text(startId);
    let current = copyState(state);
    let stopReason = "complete";
    const limit = Math.max(1, Math.min(MAX_RULE_STEPS, Number.isFinite(Number(maxSteps)) ? Math.floor(Number(maxSteps)) : MAX_RULE_STEPS));
    while (nextId) {
      if (!byId.has(nextId)) { stopReason = "missing"; break; }
      if (seen.has(nextId)) { stopReason = "cycle"; break; }
      if (trace.length >= limit) { stopReason = "step-limit"; break; }
      seen.add(nextId);
      const result = evaluateNode(byId.get(nextId), current, { random });
      trace.push({ nodeId: result.nodeId, nodeType: result.nodeType, before: result.before,
        after: result.after, predicate: result.predicate, effects: result.effects, nextId: result.nextId,
        continuationId: result.continuationId, delayMs: result.delayMs });
      current = result.state;
      if (result.continuationId) { stopReason = "dialogue"; break; }
      if (result.effects.some(effect => effect.type === "scene")) { stopReason = "scene-transition"; break; }
      if (result.effects.some(effect => effect.type === "finish")) { stopReason = "finish"; break; }
      nextId = result.nextId;
    }
    return { seed: Number(seed), trace, state: snapshot(current), stopReason, nextId };
  }

  function lintGraph(nodes = [], options = {}) {
    if (!Array.isArray(nodes)) return [{ id: "", kind: "invalid", severity: "error", message: "Rule graph is not an array." }];
    const issues = [];
    const byId = new Map(nodes.filter(node => node && node.id).map(node => [text(node.id), node]));
    const roots = nodes.filter(node => ["eventStart", "eventTrigger", "eventInteract"].includes(node?.type));
    const initial = new Set(Object.keys(options.initialVariables || {}));
    const sceneIds = options.sceneIds ? new Set(options.sceneIds.map(text)) : null;
    const outgoing = node => [text(node?.next), ...(node?.type?.startsWith("logic") ? [text(node?.alt)] : [])].filter(id => byId.has(id));
    const reachable = new Set();
    const entries = new Map();
    const pending = roots.map(node => [text(node.id), new Set(initial)]);
    let attempts = 0;
    while (pending.length && attempts++ < 20000) {
      const [id, values] = pending.shift();
      const node = byId.get(id);
      if (!node) continue;
      const previous = entries.get(id);
      if (previous && [...previous].every(name => values.has(name))) continue;
      const accepted = previous ? new Set([...previous].filter(name => values.has(name))) : new Set(values);
      entries.set(id, accepted);
      reachable.add(id);
      const nextValues = new Set(accepted);
      if (["actionSetVariable", "actionChangeNumber", "actionMathNumber", "actionRollNumber"].includes(node.type)) nextValues.add(variableName(node?.data?.variable, node.type === "actionSetVariable" ? "flag" : node.type === "actionRollNumber" ? "roll" : "score"));
      for (const target of outgoing(node)) pending.push([target, nextValues]);
    }
    for (const node of nodes) {
      if (!node || !node.id) continue;
      const data = node.data || {};
      const id = text(node.id);
      if (roots.length && !reachable.has(id) && !roots.includes(node)) issues.push({ id, kind: "unreachable", severity: "warning", message: "Rule is unreachable from every start event." });
      if (["logicVariable", "logicHasItem", "logicCompareNumber"].includes(node.type)) {
        if (!node.next) issues.push({ id, kind: "missing-then", severity: "error", message: "Decision is missing its Then connection." });
        if (!node.alt) issues.push({ id, kind: "missing-else", severity: "error", message: "Decision is missing its Else connection." });
      }
      if (["logicVariable", "logicCompareNumber"].includes(node.type) && reachable.has(id)) {
        const key = variableName(data.variable, node.type === "logicVariable" ? "flag" : "score");
        if (!entries.get(id)?.has(key)) issues.push({ id, kind: "possibly-uninitialized", severity: "warning", message: `Variable ${key} is not initialized on every route to this check.` });
      }
      if (node.type === "actionMathNumber") {
        if (!Number.isFinite(Number(data.operand)) || String(data.operand ?? "").trim() === "") issues.push({ id, kind: "invalid-number", severity: "error", message: "Arithmetic operand must be a finite number." });
        else if (["divide", "modulo"].includes(data.mathOperation) && Number(data.operand) === 0) issues.push({ id, kind: "divide-zero", severity: "error", message: "Division or modulo by zero leaves the old value unchanged; choose a nonzero operand." });
      }
      if (node.type === "logicCompareNumber" && (!Number.isFinite(Number(data.compare)) || String(data.compare ?? "").trim() === "")) issues.push({ id, kind: "invalid-comparison", severity: "error", message: "Comparison target must be a finite number." });
      if (sceneIds && node.type === "actionScene" && !sceneIds.has(text(data.sceneId))) issues.push({ id, kind: "invalid-scene", severity: "error", message: "Scene transition points to a missing scene." });
    }
    return issues;
  }

  return { MAX_INVENTORY, MAX_RULE_STEPS, compareNumbers, calculate, copyState, evaluateNode, eventMatches, variableName, analyzeGraph, lintGraph, createSeededRandom, replayGraph, createRuleQueue };
});
