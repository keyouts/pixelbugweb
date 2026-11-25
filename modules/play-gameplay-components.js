"use strict";

// Gameplay presets
(function attachPlayGameplayComponents(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayGameplayComponents = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayGameplayComponents() {
  const KINDS = Object.freeze(["collectible", "enemy", "checkpoint", "door", "goal"]);
  const LABELS = Object.freeze({ collectible: "Collectible", enemy: "Enemy / Hazard", checkpoint: "Checkpoint", door: "Locked Door", goal: "Level Goal" });
  const safe = (value, max = 40) => String(value || "").trim().replace(/[^a-z0-9_-]/gi, "-").replace(/^-+|-+$/g, "").slice(0, max);
  function normalizeKind(value) { return KINDS.includes(value) ? value : ""; }
  function collected(prop, inventory = []) {
    return prop?.componentKind === "collectible" && Array.isArray(inventory) && inventory.includes(String(prop.componentItem || ""));
  }
  function build(kind, options = {}) {
    if (!normalizeKind(kind)) throw new RangeError("Unknown gameplay component.");
    const sceneId = String(options.sceneId || "").slice(0, 48);
    const trigger = safe(options.trigger, 32);
    if (!trigger) throw new TypeError("A component requires a unique trigger name.");
    const item = safe(options.item || "key", 40) || "key";
    const numeric = (value, fallback, low, high) => {
      const n = Number(value);
      return Math.round(Math.max(low, Math.min(Number.isFinite(n) ? n : fallback, high)));
    };
    const scoreValue = numeric(options.score, 1, 0, 1000);
    const damageValue = numeric(options.damage, 1, 1, 20);
    const patrolRange = kind === "enemy" ? numeric(options.patrolRange, 0, 0, 1024) : 0;
    const patrolSpeed = kind === "enemy" ? numeric(options.patrolSpeed, 0, 0, 240) : 0;
    const bobHeight = numeric(options.bobHeight, 0, 0, 24);
    const behavior = ["patrol", "chase", "guard", "wander", "sentry"].includes(options.behavior) ? options.behavior : "patrol";
    const aggroRange = numeric(options.aggroRange, 180, 16, 1024);
    const alternateFrame = options.altFrame === "" || options.altFrame == null ? null : numeric(options.altFrame, 0, 0, 999);
    const existingIds = new Set(options.existingIds || []);
    let serial = 0;
    const node = (type, name, data = {}) => {
      let id;
      do { id = `piece-${trigger}-${serial++}`.slice(0, 80); } while (existingIds.has(id));
      existingIds.add(id);
      return { id, type, name: name.slice(0, 48), x: 40, y: 40, next: "", alt: "", data };
    };
    const event = node("eventTrigger", `${LABELS[kind]} Touch`, { sceneId, trigger });
    const nodes = [event];
    const add = (type, name, data) => { const result = node(type, name, data); nodes.push(result); return result; };
    const link = (source, next) => { source.next = next.id; return next; };
    let openVariable = "";
    const initialVariables = {};
    if (kind === "collectible") {
      const owned = link(event, add("logicHasItem", "Already Collected?", { item }));
      const pickup = add("actionAddItem", `Pick Up ${item}`, { item });
      owned.next = add("actionMessage", "Already Collected", { message: `Already have ${item}.` }).id;
      owned.alt = pickup.id;
      const score = link(pickup, add("actionChangeNumber", "Increase Score", { variable: "score", amount: scoreValue }));
      link(score, add("actionMessage", "Collected Message", { message: `Collected ${item}!` }));
    } else if (kind === "enemy") {
      initialVariables.health = "3";
      const damage = link(event, add("actionChangeNumber", "Lose Health", { variable: "health", amount: -damageValue }));
      const check = link(damage, add("logicCompareNumber", "No Health Left?", { variable: "health", operator: "<=", compare: 0 }));
      const over = add("actionFinish", "Game Over", { message: "Out of health! Press R to retry." });
      const hit = add("actionMessage", "Damage Warning", { message: "Ouch! Lost one health." });
      check.next = over.id;
      check.alt = hit.id;
    } else if (kind === "checkpoint") {
      link(event, add("actionCheckpoint", "Save Checkpoint"));
    } else if (kind === "door") {
      openVariable = safe(`open_${trigger}`, 32);
      const check = link(event, add("logicHasItem", "Has Door Key?", { item }));
      const open = add("actionSetVariable", "Unlock Door", { variable: openVariable, value: "true" });
      const locked = add("actionMessage", "Locked Door", { message: `Need ${item} to open this door.` });
      check.next = open.id;
      check.alt = locked.id;
      link(open, add("actionMessage", "Door Opened", { message: "Door unlocked!" }));
    } else if (kind === "goal") {
      link(event, add("actionFinish", "Finish Level", { message: "Level complete!" }));
    }
    nodes.forEach((part, index) => { part.x = 40 + (index % 4) * 330; part.y = 60 + Math.floor(index / 4) * 220; });
    return {
      kind, trigger, item, nodes, initialVariables,
      prop: { componentKind: kind, componentItem: kind === "collectible" || kind === "door" ? item : "",
        nodeTriggerId: trigger, solid: kind === "door", openVariable,
        componentPatrolRange: patrolRange, componentPatrolSpeed: patrolSpeed,
        componentBobHeight: bobHeight, componentAltFrame: alternateFrame, componentFrameTicks: 12,
        componentBehavior: kind === "enemy" ? behavior : "patrol", componentAggroRange: aggroRange,
        componentAvoidObstacles:kind === "enemy" && options.avoidObstacles !== false,
        componentPlatformJump:kind === "enemy" && options.platformJump === true },
      marker: { kind: "trigger", id: trigger, triggerId: trigger, name: `${LABELS[kind]} (${trigger})`,
        componentKind: kind, componentItem: item }
    };
  }
  return { KINDS, LABELS, normalizeKind, collected, build };
});
