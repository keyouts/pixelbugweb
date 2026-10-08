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

  function copyState(state = {}) {
    const variables = state.variables && typeof state.variables === "object" ? { ...state.variables } : {};
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

  function snapshot(state) {
    return { variables: { ...state.variables }, inventory: [...state.inventory] };
  }

  function evaluateNode(node, state = {}) {
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
      const key = text(data.variable || "flag");
      runtime.variables[key] = text(data.value == null ? "true" : data.value);
    }
    if (node.type === "actionChangeNumber") {
      const key = text(data.variable || "score");
      const previous = Number(runtime.variables[key]) || 0;
      runtime.variables[key] = String(previous + (Number(data.amount) || 0));
    }
    if (node.type === "logicVariable") {
      const key = text(data.variable || "flag");
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
      const key = text(data.variable || "score");
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

  return { MAX_INVENTORY, compareNumbers, copyState, evaluateNode, eventMatches };
});
