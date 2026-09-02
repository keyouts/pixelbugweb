// Node editor
(() => {
  const TYPES = {
    eventStart: "When Scene Starts",
    eventTrigger: "When Player Touches",
    eventInteract: "When Player Interacts",
    actionMessage: "Show Text",
    actionDialogue: "Start Dialogue",
    actionCheckpoint: "Save Checkpoint",
    actionSetVariable: "Remember Value",
    actionChangeNumber: "Change Number",
    actionMoveActor: "Move Player",
    actionAddItem: "Give Item",
    actionRemoveItem: "Remove Item",
    actionScene: "Go to Scene",
    actionPlaySound: "Play Sound",
    actionStopSound: "Stop Audio",
    logicVariable: "If Value Matches",
    logicCompareNumber: "Compare Number",
    logicHasItem: "If Player Has Item",
    actionFinish: "Finish Game"
  };
  const CONCEPTS = {
    eventStart: { key: "event", label: "Start", statement: "WHEN a scene starts", explanation: "Runs when the chosen scene begins." },
    eventTrigger: { key: "event", label: "Touch", statement: "WHEN the player touches an object", explanation: "Runs when the player touches the chosen object." },
    eventInteract: { key: "event", label: "Interact", statement: "WHEN the player interacts with a character", explanation: "Runs when the player presses Interact near the chosen character or assigned object." },
    actionMessage: { key: "output", label: "Text", statement: "SHOW text", explanation: "Shows a message to the player." },
    actionDialogue: { key: "output", label: "Dialogue", statement: "START dialogue", explanation: "Starts the chosen dialogue lines." },
    actionCheckpoint: { key: "state", label: "Checkpoint", statement: "SAVE the player position", explanation: "Saves where the player is standing. Reset returns here." },
    actionSetVariable: { key: "state", label: "Saved Value", statement: "SET a name = a value", explanation: "Saves a named value, such as key = found." },
    actionChangeNumber: { key: "state", label: "Number", statement: "ADD an amount to a number", explanation: "Adds to or subtracts from a saved number." },
    actionMoveActor: { key: "action", label: "Move", statement: "MOVE the player by (x, y)", explanation: "Moves the player by the amount you enter." },
    actionAddItem: { key: "state", label: "Inventory", statement: "GIVE the player an item", explanation: "Adds an item to the player's inventory." },
    actionRemoveItem: { key: "state", label: "Inventory", statement: "REMOVE an item", explanation: "Removes an item from the player's inventory." },
    actionScene: { key: "outcome", label: "Scene", statement: "GO TO another scene", explanation: "Moves the player to another scene and starts that scene's beginning rules." },
    actionPlaySound: { key: "output", label: "Audio", statement: "PLAY a sound", explanation: "Plays music or a sound effect from Audio Studio." },
    actionStopSound: { key: "output", label: "Audio", statement: "STOP audio", explanation: "Stops music, sound effects, or all game audio." },
    logicVariable: { key: "decision", label: "Check", statement: "IF a saved value matches", explanation: "Then runs when the value matches. Else runs when it does not." },
    logicCompareNumber: { key: "decision", label: "Number Check", statement: "IF a number passes the check", explanation: "Then runs when the number passes the check. Else runs when it does not." },
    logicHasItem: { key: "decision", label: "Inventory Check", statement: "IF the player has an item", explanation: "Then runs when the item is in inventory. Else runs when it is not." },
    actionFinish: { key: "outcome", label: "Finish", statement: "END the game", explanation: "Stops the game and shows the final message." }
  };
  const EVENT_TYPES = new Set(["eventStart", "eventTrigger", "eventInteract"]);
  const DECISION_TYPES = new Set(["logicVariable", "logicCompareNumber", "logicHasItem"]);
  const TERMINAL_TYPES = new Set(["actionFinish", "actionScene"]);

  function supportsNext(type) {
    return !TERMINAL_TYPES.has(type);
  }

  function supportsAlt(type) {
    return DECISION_TYPES.has(type);
  }
  const NODE_GROUPS = [
    { label: "Start Rules", hint: "What starts the rule?", items: [
      { type: "eventStart", name: "When Scene Starts", detail: "Runs when the chosen scene begins." },
      { type: "eventTrigger", name: "When Player Touches", detail: "Runs when the player touches a chosen object." },
      { type: "eventInteract", name: "When Player Interacts", detail: "Runs when the player presses Interact near a chosen character." }
    ] },
    { label: "Things the Game Does", hint: "What should happen?", items: [
      { type: "actionMessage", name: "Show Text", detail: "Show a short message in the game." },
      { type: "actionDialogue", name: "Start Dialogue", detail: "Start a saved set of dialogue lines." },
      { type: "actionPlaySound", name: "Play Sound", detail: "Play a clip from Audio Studio." },
      { type: "actionStopSound", name: "Stop Audio", detail: "Stop music, effects, or all audio." },
      { type: "actionMoveActor", name: "Move Player", detail: "Move the player left, right, up, or down." },
      { type: "actionScene", name: "Go to Scene", detail: "Move to another scene and run its beginning rules." }
    ] },
    { label: "Saved Values", hint: "What should the game remember?", items: [
      { type: "actionSetVariable", name: "Remember Value", detail: "Save a value such as key = found." },
      { type: "actionChangeNumber", name: "Change Number", detail: "Add to or subtract from a saved number." },
      { type: "actionAddItem", name: "Give Item", detail: "Add an item such as a key to inventory." },
      { type: "actionRemoveItem", name: "Remove Item", detail: "Remove an item after it is used." },
      { type: "actionCheckpoint", name: "Save Checkpoint", detail: "Choose where Reset returns the player." }
    ] },
    { label: "Checks", hint: "Should Then or Else run?", items: [
      { type: "logicVariable", name: "If Value Matches", detail: "Then runs when it matches. Else runs when it does not." },
      { type: "logicCompareNumber", name: "Compare Number", detail: "Check a number with =, ≠, <, ≤, >, or ≥." },
      { type: "logicHasItem", name: "If Player Has Item", detail: "Check whether inventory contains an item." }
    ] },
    { label: "Finish", hint: "How should the game end?", items: [
      { type: "actionFinish", name: "Finish Game", detail: "Stop the game and show a final message." }
    ] }
  ];
  const LESSONS = [
    { id: "sequence", title: "1. First Sequence", concept: "Order", detail: "Start the game, show text, then save a checkpoint." },
    { id: "touch-win", title: "2. Touch to Win", concept: "Touch", detail: "Touch an object, show a message, and finish the game." },
    { id: "switch-door", title: "3. Switch and Door", concept: "Saved Values", detail: "Save whether a door is open, then check it." },
    { id: "count-three", title: "4. Count to Three", concept: "Counting", detail: "Add one for each touch and check when the total reaches 3." }
  ];
  const NODE_WIDTH = 224;
  const NODE_HEIGHT = 128;
  const NODE_GAP_X = 316;
  const NODE_GAP_Y = 154;
  const MESSAGE_STEP_DELAY = 1100;
  let api = null;
  let selectedId = "";
  let drag = null;
  let connection = null;
  let pendingConnection = null;
  let ignorePortClickUntil = 0;
  let keyboardReady = false;
  let overlayOpen = false;
  let overlayReturnFocus = null;
  let inlineContext = null;
  let overlayContext = null;
  let lastEntered = new Set();
  let activeIds = new Map();
  let activeLinks = new Map();
  let runtimeLog = [];
  let runtimeState = { currentId: "", currentLabel: "None", lastTrigger: "None", actions: [], nextIds: [], testRoot: "" };
  let highlightedId = "";
  let settlingId = "";

  function makeId(prefix = "node") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function text(value, fallback = "") {
    return String(value ?? fallback).replace(/\s+/g, " ").trim();
  }

  function number(value, fallback, min, max) {
    const next = Number(value);
    return Number.isFinite(next) ? Math.max(min, Math.min(next, max)) : fallback;
  }

  function escape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }
  function logRuntime(message) {
    const stamped = `${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} ${String(message || "")}`;
    runtimeLog.unshift(stamped);
    runtimeLog = runtimeLog.slice(0, 8);
    renderRuntime(inlineContext);
    if (overlayOpen) renderRuntime(overlayContext);
  }

  function pulseNode(id) {
    activeIds.set(String(id || ""), performance.now() + 900);
    renderNodes(inlineContext);
    if (overlayOpen) renderNodes(overlayContext);
    window.setTimeout(() => { renderNodes(inlineContext); if (overlayOpen) renderNodes(overlayContext); }, 950);
  }

  function isActive(id) {
    const until = activeIds.get(String(id || ""));
    if (!until) return false;
    if (performance.now() > until) { activeIds.delete(String(id || "")); return false; }
    return true;
  }

  function linkKey(sourceId, targetId) {
    return `${String(sourceId || "")}→${String(targetId || "")}`;
  }

  function pulseLink(sourceId, targetId) {
    if (!sourceId || !targetId) return;
    activeLinks.set(linkKey(sourceId, targetId), performance.now() + 950);
    drawLinks(inlineContext);
    if (overlayOpen) drawLinks(overlayContext);
    window.setTimeout(() => { drawLinks(inlineContext); if (overlayOpen) drawLinks(overlayContext); }, 980);
  }

  function isLinkActive(sourceId, targetId) {
    const key = linkKey(sourceId, targetId);
    const until = activeLinks.get(key);
    if (!until) return false;
    if (performance.now() > until) { activeLinks.delete(key); return false; }
    return true;
  }

  function setRuntimeState(next = {}) {
    runtimeState = { ...runtimeState, ...next };
    renderRuntime(inlineContext);
    if (overlayOpen) renderRuntime(overlayContext);
  }

  function resetRuntimeState() {
    runtimeState = { currentId: "", currentLabel: "None", lastTrigger: "None", actions: [], nextIds: [], testRoot: "" };
  }

  function syncRuntimeVariables(data) {
    const playMode = api?.getState?.()?.playMode;
    if (!playMode) return;
    playMode.variables = { ...(data?.runtime?.variables || {}) };
    api.saveLocal?.();
  }

  function syncRuntimeInventory(data) {
    data.runtime.inventory = [...new Set((data.runtime.inventory || []).map(item => text(item).slice(0, 40)).filter(Boolean))].slice(0, 64);
    api.saveLocal?.();
  }


  function defaultGraph() {
    const sceneId = api?.getState?.()?.playMode?.activeSceneId || "";
    const start = makeId("start");
    const message = makeId("message");
    const checkpoint = makeId("checkpoint");
    return {
      selectedId: start,
      runtime: { variables: {}, inventory: [], checkpoint: null },
      nodes: [
        { id: start, type: "eventStart", name: "Scene Begins", x: 40, y: 44, next: message, alt: "", data: { sceneId } },
        { id: message, type: "actionMessage", name: "Welcome Player", x: 356, y: 44, next: checkpoint, alt: "", data: { message: "Welcome! This sequence runs from left to right." } },
        { id: checkpoint, type: "actionCheckpoint", name: "Starting Checkpoint", x: 672, y: 44, next: "", alt: "", data: {} }
      ]
    };
  }

  function defaultDataForType(type) {
    if (["eventStart", "eventTrigger", "eventInteract"].includes(type)) return { sceneId: api?.getState?.()?.playMode?.activeSceneId || "" };
    if (type === "actionChangeNumber") return { variable: "score", amount: 1 };
    if (type === "logicCompareNumber") return { variable: "score", operator: ">=", compare: 3 };
    if (["actionAddItem", "actionRemoveItem", "logicHasItem"].includes(type)) return { item: "key" };
    if (type === "actionScene") return { sceneId: "" };
    if (type === "actionPlaySound") return { audioAssetId: "", audioVolume: 1, audioLoop: false };
    if (type === "actionStopSound") return { audioStopScope: "all" };
    return {};
  }

  function normalizeData(data = {}) {
    return {
      trigger: text(data.trigger || "any").slice(0, 32) || "any",
      character: text(data.character || "any").slice(0, 80) || "any",
      message: String(data.message || "Message shown.").slice(0, 180),
      textLine: Number.isFinite(Number(data.textLine)) ? Math.max(-1, Number(data.textLine)) : -1,
      line: Math.max(0, Number(data.line) || 0),
      variable: text(data.variable || "flag").slice(0, 32) || "flag",
      value: text(data.value || "true").slice(0, 48) || "true",
      equals: text(data.equals || "true").slice(0, 48) || "true",
      amount: number(data.amount, 1, -1000, 1000),
      operator: ["=", "!=", "<", "<=", ">", ">="].includes(String(data.operator)) ? String(data.operator) : ">=",
      compare: number(data.compare, 1, -1000000, 1000000),
      dx: number(data.dx, 24, -1000, 1000),
      dy: number(data.dy, 0, -1000, 1000),
      item: text(data.item || "key").slice(0, 40) || "key",
      sceneId: text(data.sceneId || "").slice(0, 48),
      audioAssetId: text(data.audioAssetId || "").slice(0, 48),
      audioVolume: number(data.audioVolume, 1, 0, 1),
      audioLoop: data.audioLoop === true,
      audioStopScope: ["all", "music", "sfx"].includes(String(data.audioStopScope)) ? String(data.audioStopScope) : "all"
    };
  }

  function normalizeNode(node, index) {
    const type = TYPES[node?.type] ? node.type : "actionMessage";
    node.id = String(node?.id || makeId()).slice(0, 80);
    node.type = type;
    node.name = text(node?.name, TYPES[type]).slice(0, 48) || TYPES[type];
    node.x = number(node?.x, 40 + index * 42, 0, 2200);
    node.y = number(node?.y, 44 + index * 28, 0, 1400);
    node.next = supportsNext(type) ? String(node?.next || "").slice(0, 80) : "";
    node.alt = supportsAlt(type) ? String(node?.alt || "").slice(0, 80) : "";
    node.data = normalizeData(node?.data || {});
    return node;
  }

  function graph() {
    const state = api.getState();
    if (!state.playMode || typeof state.playMode !== "object") state.playMode = {};
    if (!state.playMode.nodeEditor || typeof state.playMode.nodeEditor !== "object") state.playMode.nodeEditor = defaultGraph();
    const data = state.playMode.nodeEditor;
    if (!Array.isArray(data.nodes) || !data.nodes.length) data.nodes = defaultGraph().nodes;
    data.nodes = data.nodes.slice(0, 100);
    data.nodes.forEach(normalizeNode);
    data.runtime = data.runtime && typeof data.runtime === "object" ? data.runtime : {};
    data.runtime.variables = data.runtime.variables && typeof data.runtime.variables === "object" ? data.runtime.variables : {};
    data.runtime.inventory = Array.isArray(data.runtime.inventory) ? [...new Set(data.runtime.inventory.map(item => text(item).slice(0, 40)).filter(Boolean))].slice(0, 64) : [];
    const ids = new Set(data.nodes.map(node => node.id));
    data.nodes.forEach(node => {
      if (!ids.has(node.next) || node.next === node.id) node.next = "";
      if (!ids.has(node.alt) || node.alt === node.id) node.alt = "";
    });
    if (!ids.has(data.selectedId)) data.selectedId = data.nodes[0]?.id || "";
    selectedId = selectedId && ids.has(selectedId) ? selectedId : data.selectedId;
    return data;
  }

  function selectedNode() {
    const data = graph();
    return data.nodes.find(node => node.id === selectedId) || data.nodes[0] || null;
  }

  function label(node) {
    return `${TYPES[node.type] || "Rule"}: ${node.name || "Untitled"}`;
  }

  function snippet(value, fallback = "") {
    const copy = text(value, fallback);
    return copy.length > 56 ? `${copy.slice(0, 53)}...` : copy;
  }

  function textEventLabel(index, fallback = "Text Event") {
    const options = api?.getTextEventOptions?.() || [];
    const match = options.find(option => Number(option.index) === Number(index));
    return match?.label || `${fallback} ${Number(index) + 1}`;
  }

  function interactionCharacterLabel(id, sceneId = "") {
    if (!id || id === "any") return "any character";
    const options = api?.getInteractionCharacterOptions?.(sceneId) || [];
    return options.find(option => String(option.id) === String(id))?.name || String(id);
  }

  function sceneLabel(id) {
    if (!id) return "any scene";
    const options = api?.getSceneOptions?.() || [];
    return options.find(option => String(option.id) === String(id))?.name || String(id);
  }

  function audioLabel(id) {
    if (!id) return "a sound";
    const options = api?.getAudioOptions?.() || [];
    return options.find(option => String(option.id) === String(id))?.name || String(id);
  }

  function isAudioNode(node) {
    return node?.type === "actionPlaySound" || node?.type === "actionStopSound";
  }

  function audioReachability(data) {
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const byId = new Map(nodes.map(node => [String(node.id), node]));
    const predecessors = new Map();
    nodes.forEach(node => {
      [node.next, node.alt].forEach(targetId => {
        const target = String(targetId || "");
        if (!target || !byId.has(target)) return;
        if (!predecessors.has(target)) predecessors.set(target, new Set());
        predecessors.get(target).add(String(node.id));
      });
    });
    const reachable = new Map(nodes.map(node => [String(node.id), false]));
    const queue = nodes.filter(isAudioNode).map(node => String(node.id));
    queue.forEach(id => reachable.set(id, true));
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      (predecessors.get(id) || []).forEach(sourceId => {
        if (reachable.get(sourceId)) return;
        reachable.set(sourceId, true);
        queue.push(sourceId);
      });
    }
    return reachable;
  }

  function audioWaveElement() {
    const wave = document.createElement("span");
    wave.className = "node-editor-audio-wave";
    wave.setAttribute("aria-hidden", "true");
    [7, 15, 22, 11, 19, 9, 17, 6, 13].forEach(height => {
      const bar = document.createElement("span");
      bar.style.setProperty("--audio-bar-height", `${height}px`);
      wave.appendChild(bar);
    });
    return wave;
  }

  function audioBadgeElement(labelText) {
    const badge = document.createElement("span");
    badge.className = "node-editor-audio-badge";
    badge.innerHTML = `<span class="node-editor-audio-mini" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${escape(labelText)}</span>`;
    return badge;
  }

  function audioRouteSignalElement() {
    const signal = document.createElement("span");
    signal.className = "node-editor-link-audio-signal";
    signal.setAttribute("aria-hidden", "true");
    [5, 12, 8, 15, 7].forEach(height => {
      const bar = document.createElement("i");
      bar.style.setProperty("--audio-route-height", `${height}px`);
      signal.appendChild(bar);
    });
    return signal;
  }

  function conceptFor(node) {
    return CONCEPTS[node?.type] || { key: "action", label: "Rule", statement: "RUN a rule", explanation: "Runs when another rule connects to it." };
  }

  function nodeStatement(node) {
    if (!node) return "Choose a rule";
    if (node.type === "eventStart") return `WHEN ${sceneLabel(node.data.sceneId)} starts`;
    if (node.type === "eventTrigger") return `WHEN player touches ${node.data.trigger === "any" ? "an object" : node.data.trigger} IN ${sceneLabel(node.data.sceneId)}`;
    if (node.type === "eventInteract") return `WHEN player interacts with ${interactionCharacterLabel(node.data.character, node.data.sceneId)} IN ${sceneLabel(node.data.sceneId)}`;
    if (node.type === "actionMessage") return Number(node.data.textLine) >= 0 ? `SHOW ${textEventLabel(node.data.textLine)}` : `SHOW “${snippet(node.data.message, "Message shown.") }”`;
    if (node.type === "actionDialogue") return `START ${textEventLabel(node.data.line)}`;
    if (node.type === "actionCheckpoint") return "SAVE player position";
    if (node.type === "actionSetVariable") return `SET ${node.data.variable || "flag"} = ${node.data.value || "true"}`;
    if (node.type === "actionChangeNumber") return `ADD ${Number(node.data.amount) || 0} TO ${node.data.variable || "score"}`;
    if (node.type === "logicVariable") return `IF ${node.data.variable || "flag"} = ${node.data.equals || "true"}`;
    if (node.type === "logicCompareNumber") return `IF ${node.data.variable || "score"} ${node.data.operator || ">="} ${Number(node.data.compare) || 0}`;
    if (node.type === "actionMoveActor") return `MOVE player by (${Number(node.data.dx) || 0}, ${Number(node.data.dy) || 0})`;
    if (node.type === "actionAddItem") return `GIVE item ${node.data.item || "key"}`;
    if (node.type === "actionRemoveItem") return `REMOVE item ${node.data.item || "key"}`;
    if (node.type === "logicHasItem") return `IF inventory has ${node.data.item || "key"}`;
    if (node.type === "actionScene") return `GO TO ${sceneLabel(node.data.sceneId)}`;
    if (node.type === "actionPlaySound") return `PLAY ${audioLabel(node.data.audioAssetId)}`;
    if (node.type === "actionStopSound") return `STOP ${node.data.audioStopScope === "music" ? "music" : node.data.audioStopScope === "sfx" ? "sound effects" : "all audio"}`;
    if (node.type === "actionFinish") return "END game";
    return conceptFor(node).statement;
  }

  function nodeDetail(node) {
    if (!node) return "Choose a rule to see what it does.";
    if (node.type === "eventStart") return node.data.sceneId ? `Runs when ${sceneLabel(node.data.sceneId)} starts.` : "Runs whenever a scene starts.";
    if (node.type === "eventTrigger") return `${node.data.sceneId ? `In ${sceneLabel(node.data.sceneId)}, ` : "In any scene, "}${node.data.trigger === "any" ? "runs when the player touches any object." : `runs when the player touches ${node.data.trigger}.`}`;
    if (node.type === "eventInteract") return `${node.data.sceneId ? `In ${sceneLabel(node.data.sceneId)}, ` : "In any scene, "}${node.data.character === "any" ? "runs when the player interacts with any character." : `runs when the player interacts with ${interactionCharacterLabel(node.data.character, node.data.sceneId)}.`}`;
    if (node.type === "actionMessage") return Number(node.data.textLine) >= 0 ? `Shows ${textEventLabel(node.data.textLine)} to the player.` : `Shows: ${snippet(node.data.message, "Message shown.")}`;
    if (node.type === "actionDialogue") return `Starts the dialogue at ${textEventLabel(node.data.line)} and follows its saved path.`;
    if (node.type === "actionCheckpoint") return "Saves the player position so Reset can return here.";
    if (node.type === "actionSetVariable") return `Saves ${node.data.variable || "flag"} as ${node.data.value || "true"}.`;
    if (node.type === "actionChangeNumber") return `Adds ${Number(node.data.amount) || 0} to ${node.data.variable || "score"}.`;
    if (node.type === "logicVariable") return `Then runs when ${node.data.variable || "flag"} equals ${node.data.equals || "true"}. Otherwise Else runs.`;
    if (node.type === "logicCompareNumber") return `Then runs when ${node.data.variable || "score"} ${node.data.operator || ">="} ${Number(node.data.compare) || 0}. Otherwise Else runs.`;
    if (node.type === "actionMoveActor") return `Moves the player by X ${Number(node.data.dx) || 0} and Y ${Number(node.data.dy) || 0}.`;
    if (node.type === "actionAddItem") return `Adds ${node.data.item || "key"} to the player's inventory.`;
    if (node.type === "actionRemoveItem") return `Removes ${node.data.item || "key"} from the player's inventory.`;
    if (node.type === "logicHasItem") return `Then runs when inventory contains ${node.data.item || "key"}. Otherwise Else runs.`;
    if (node.type === "actionScene") return `Moves to ${sceneLabel(node.data.sceneId)} and runs that scene's beginning rules.`;
    if (node.type === "actionPlaySound") return `Plays ${audioLabel(node.data.audioAssetId)}${node.data.audioLoop ? " on a loop" : ""}.`;
    if (node.type === "actionStopSound") return `Stops ${node.data.audioStopScope === "music" ? "scene music" : node.data.audioStopScope === "sfx" ? "sound effects" : "all game audio"}.`;
    if (node.type === "actionFinish") return "Stops the game and shows the finish message.";
    return "Runs when another rule connects to it.";
  }

  function nodeEffect(node) {
    return conceptFor(node).label;
  }

  function routeLabels(ids = [], nodes = graph().nodes) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return ids.map(id => byId.get(id)).filter(Boolean).map(node => `${TYPES[node.type] || "Rule"}: ${node.name || "Untitled"}`);
  }

  function computeGraphIssues(data = graph()) {
    const nodes = data.nodes || [];
    const byId = new Map(nodes.map(node => [node.id, node]));
    const incoming = new Map(nodes.map(node => [node.id, 0]));
    nodes.forEach(node => nodeTargets(node).forEach(targetId => incoming.set(targetId, (incoming.get(targetId) || 0) + 1)));
    const roots = nodes.filter(node => EVENT_TYPES.has(node.type));
    const reachable = new Set();
    const queue = roots.map(node => node.id);
    while (queue.length) {
      const id = queue.shift();
      if (reachable.has(id)) continue;
      reachable.add(id);
      const node = byId.get(id);
      nodeTargets(node).forEach(targetId => { if (!reachable.has(targetId)) queue.push(targetId); });
    }
    const issues = [];
    const triggerOptions = sceneId => new Set(["any", ...(api?.getNodeTriggerOptions?.(sceneId) || []).map(option => String(option.id || ""))]);
    const interactionOptions = sceneId => new Set(["any", ...(api?.getInteractionCharacterOptions?.(sceneId) || []).map(option => String(option.id || ""))]);
    const textOptions = api?.getTextEventOptions?.() || [];
    const setters = new Set(nodes.filter(node => node.type === "actionSetVariable" || node.type === "actionChangeNumber").map(node => String(node.data.variable || "flag")));
    const initialItems = new Set((api?.getState?.()?.playMode?.inventory || []).map(item => String(item)));
    const itemSources = new Set([...initialItems, ...nodes.filter(node => node.type === "actionAddItem").map(node => String(node.data.item || "key"))]);
    const sceneOptions = new Set((api?.getSceneOptions?.() || []).map(option => String(option.id || "")));
    const audioOptions = new Set((api?.getAudioOptions?.() || []).map(option => String(option.id || "")));
    nodes.forEach(node => {
      if (EVENT_TYPES.has(node.type) && !node.next) issues.push({ id: node.id, text: `${node.name} does not connect to another rule.` });
      if (!EVENT_TYPES.has(node.type) && !reachable.has(node.id)) issues.push({ id: node.id, text: `${node.name} is not connected to a start rule.` });
      if (!EVENT_TYPES.has(node.type) && !incoming.get(node.id) && roots.length) issues.push({ id: node.id, text: `${node.name} is not connected from another rule.` });
      if (["eventStart", "eventTrigger", "eventInteract"].includes(node.type) && node.data.sceneId && !sceneOptions.has(String(node.data.sceneId))) issues.push({ id: node.id, text: `${node.name} uses a scene that no longer exists.` });
      if (node.type === "eventTrigger" && node.data.trigger !== "any" && !triggerOptions(node.data.sceneId).has(String(node.data.trigger || ""))) issues.push({ id: node.id, text: `${node.name} uses an object that is no longer available in its selected scene.` });
      if (node.type === "eventInteract" && node.data.character !== "any" && !interactionOptions(node.data.sceneId).has(String(node.data.character || ""))) issues.push({ id: node.id, text: `${node.name} uses a character that is no longer available in its selected scene.` });
      if (node.type === "actionMessage" && Number(node.data.textLine) >= 0 && !textOptions.some(option => Number(option.index) === Number(node.data.textLine))) issues.push({ id: node.id, text: `${node.name} uses saved text that no longer exists.` });
      if (node.type === "actionDialogue" && !textOptions.some(option => Number(option.index) === Number(node.data.line))) issues.push({ id: node.id, text: `${node.name} starts with dialogue that no longer exists.` });
      if (DECISION_TYPES.has(node.type)) {
        if (!node.next) issues.push({ id: node.id, text: `${node.name} does not have a Then connection.` });
        if (!node.alt) issues.push({ id: node.id, text: `${node.name} does not have an Else connection.` });
        if (node.type !== "logicHasItem" && !setters.has(String(node.data.variable || "flag"))) issues.push({ id: node.id, text: `${node.name} checks ${node.data.variable || "flag"}, but no rule saves or changes it.` });
        if (node.type === "logicHasItem" && !itemSources.has(String(node.data.item || "key"))) issues.push({ id: node.id, text: `${node.name} checks for ${node.data.item || "key"}, but the player never starts with or receives that item.` });
      }
      if (node.type === "eventStart" && node.data.sceneId && !sceneOptions.has(String(node.data.sceneId))) issues.push({ id: node.id, text: `${node.name} uses a scene that no longer exists.` });
      if (node.type === "actionScene" && (!node.data.sceneId || !sceneOptions.has(String(node.data.sceneId)))) issues.push({ id: node.id, text: `${node.name} needs a destination scene.` });
      if (node.type === "actionPlaySound" && (!node.data.audioAssetId || !audioOptions.has(String(node.data.audioAssetId)))) issues.push({ id: node.id, text: `${node.name} needs an Audio Studio clip.` });
    });
    if (!roots.length) issues.push({ id: "", text: "Add a start rule so the game knows where to begin." });
    return issues;
  }

  function issuesByNode(data = graph()) {
    const map = new Map();
    computeGraphIssues(data).forEach(issue => {
      const list = map.get(issue.id) || [];
      list.push(issue.text);
      map.set(issue.id, list);
    });
    return map;
  }

  function routeSummary(node, nodes = graph().nodes) {
    if (!node) return "No rule selected.";
    const byId = new Map(nodes.map(item => [item.id, item]));
    const next = byId.get(node.next);
    const alt = byId.get(node.alt);
    const parts = [];
    if (!supportsNext(node.type)) return "Stops here.";
    if (supportsAlt(node.type)) {
      parts.push(next ? `Then → ${TYPES[next.type] || "Rule"}: ${next.name}` : "Then is not connected");
      parts.push(alt ? `Else → ${TYPES[alt.type] || "Rule"}: ${alt.name}` : "Else is not connected");
    } else {
      parts.push(next ? `Next → ${TYPES[next.type] || "Rule"}: ${next.name}` : "Rule path ends here");
    }
    return parts.join(" · ");
  }

  function nodeTargets(node) {
    const targets = [];
    if (supportsNext(node?.type) && node?.next) targets.push(node.next);
    if (supportsAlt(node?.type) && node?.alt) targets.push(node.alt);
    return targets;
  }

  function wrangleGraph() {
    api.beginHistory?.();
    const data = graph();
    const roots = data.nodes.filter(node => EVENT_TYPES.has(node.type));
    const byId = new Map(data.nodes.map(node => [node.id, node]));
    const depth = new Map();
    const queue = roots.map((node, order) => ({ id: node.id, level: 0, order }));
    while (queue.length) {
      const item = queue.shift();
      const currentLevel = depth.get(item.id);
      if (currentLevel !== undefined && currentLevel <= item.level) continue;
      depth.set(item.id, item.level);
      const node = byId.get(item.id);
      nodeTargets(node).forEach((targetId, targetOrder) => queue.push({ id: targetId, level: item.level + 1, order: item.order + targetOrder }));
    }
    const orphanLevel = roots.length ? Math.max(1, ...Array.from(depth.values()), 1) + 1 : 0;
    data.nodes.forEach(node => { if (!depth.has(node.id)) depth.set(node.id, orphanLevel); });
    const rows = new Map();
    data.nodes.forEach((node, index) => {
      const level = depth.get(node.id) || 0;
      const row = rows.get(level) || [];
      row.push({ node, index });
      rows.set(level, row);
    });
    Array.from(rows.keys()).sort((a, b) => a - b).forEach(level => {
      rows.get(level).sort((a, b) => {
        if (a.node.type === "eventStart" && b.node.type !== "eventStart") return -1;
        if (b.node.type === "eventStart" && a.node.type !== "eventStart") return 1;
        if (a.node.type === "eventTrigger" && b.node.type !== "eventTrigger") return -1;
        if (b.node.type === "eventTrigger" && a.node.type !== "eventTrigger") return 1;
        return a.index - b.index;
      }).forEach((item, rowIndex) => {
        item.node.x = 44 + level * NODE_GAP_X;
        item.node.y = 44 + rowIndex * NODE_GAP_Y;
      });
    });
    selectedId = data.selectedId = selectedId || roots[0]?.id || data.nodes[0]?.id || "";
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    logRuntime("Arranged the rule map without changing any rules or connections.");
    api.setStatus("Rule map arranged.");
  }

  function playTesterStateLabel() {
    const runtime = api?.getPlayRuntime?.();
    return runtime?.running ? "Tester running" : "Tester stopped";
  }

  function button(textValue, labelValue, handler) {
    const node = document.createElement("button");
    node.type = "button";
    node.innerHTML = `${textValue}<span class="sr-only">, ${labelValue}</span>`;
    node.setAttribute("aria-label", labelValue);
    node.addEventListener("click", handler);
    return node;
  }

  function actionGroup(title, controls) {
    const group = document.createElement("div");
    group.className = "node-editor-action-group";
    const heading = document.createElement("strong");
    heading.textContent = title;
    const row = document.createElement("div");
    row.className = "node-editor-action-buttons";
    row.append(...controls);
    group.append(heading, row);
    return group;
  }

  function makeSelect(id, labelText, value, nodes, fieldName) {
    const wrap = document.createElement("label");
    wrap.className = "node-editor-field";
    wrap.setAttribute("for", id);
    const heading = document.createElement("span");
    heading.textContent = labelText;
    const select = document.createElement("select");
    select.id = id;
    select.dataset.field = fieldName || labelText.toLowerCase();
    select.setAttribute("aria-label", labelText);
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "None";
    select.appendChild(none);
    nodes.forEach(node => {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = label(node);
      select.appendChild(option);
    });
    select.value = value || "";
    wrap.append(heading, select);
    return wrap;
  }

  function triggerOptionsMarkup(current, sceneId = "") {
    const options = [{ id: "any", label: "Any object" }, ...(api?.getNodeTriggerOptions?.(sceneId) || [])];
    return options.map(option => `<option value="${escape(option.id)}"${String(current) === String(option.id) ? " selected" : ""}>${escape(option.label || option.id)}</option>`).join("");
  }

  function interactionOptionsMarkup(current, sceneId = "") {
    const options = [{ id: "any", label: "Any character" }, ...(api?.getInteractionCharacterOptions?.(sceneId) || [])];
    return options.map(option => `<option value="${escape(option.id)}"${String(current) === String(option.id) ? " selected" : ""}>${escape(option.label || option.name || option.id)}</option>`).join("");
  }

  function textEventOptionsMarkup(current, includeCustom = false) {
    const options = api?.getTextEventOptions?.() || [];
    const custom = includeCustom ? `<option value="-1"${Number(current) < 0 ? " selected" : ""}>Custom message text</option>` : "";
    return custom + options.map(option => `<option value="${option.index}"${Number(current) === Number(option.index) ? " selected" : ""}>${escape(option.label || `Line ${Number(option.index) + 1}`)}</option>`).join("");
  }

  function sceneOptionsMarkup(current, includeAny = false) {
    const activeId = api?.getState?.()?.playMode?.activeSceneId || "";
    const allOptions = api?.getSceneOptions?.() || [];
    const options = includeAny ? allOptions : allOptions.filter(option => String(option.id) !== String(activeId));
    const first = includeAny ? `<option value=""${!current ? " selected" : ""}>Any Scene</option>` : `<option value="">Choose a scene</option>`;
    return first + options.map(option => `<option value="${escape(option.id)}"${String(current) === String(option.id) ? " selected" : ""}>${escape(option.name || option.id)}</option>`).join("");
  }

  function audioOptionsMarkup(current) {
    const options = api?.getAudioOptions?.() || [];
    return `<option value="">Choose a clip</option>` + options.map(option => `<option value="${escape(option.id)}"${String(current) === String(option.id) ? " selected" : ""}>${escape(option.name || option.id)} · ${option.kind === "music" ? "Music" : "Effect"}</option>`).join("");
  }

  function fieldMarkup(node, prefix) {
    if (node.type === "eventStart") return `<label class="node-editor-field" for="${prefix}-scene-start"><span>Scene</span><select id="${prefix}-scene-start" data-field="sceneId" aria-label="Scene that starts this rule">${sceneOptionsMarkup(node.data.sceneId, true)}</select></label><p class="control-hint">Choose one scene, or use Any Scene for a rule that should run after every scene change.</p>`;
    if (node.type === "eventTrigger") return `<label class="node-editor-field" for="${prefix}-trigger-scene"><span>Scene</span><select id="${prefix}-trigger-scene" data-field="sceneId" aria-label="Scene for this touch rule">${sceneOptionsMarkup(node.data.sceneId, true)}</select></label><label class="node-editor-field" for="${prefix}-trigger"><span>Object to Touch</span><select id="${prefix}-trigger" data-field="trigger" aria-label="Object that starts this rule">${triggerOptionsMarkup(node.data.trigger, node.data.sceneId)}</select></label><p class="control-hint">Scope object names to one scene, or choose Any Scene for a deliberately global touch rule.</p>`;
    if (node.type === "eventInteract") return `<label class="node-editor-field" for="${prefix}-interact-scene"><span>Scene</span><select id="${prefix}-interact-scene" data-field="sceneId" aria-label="Scene for this interaction rule">${sceneOptionsMarkup(node.data.sceneId, true)}</select></label><label class="node-editor-field" for="${prefix}-character"><span>Character to Interact With</span><select id="${prefix}-character" data-field="character" aria-label="Character that starts this rule">${interactionOptionsMarkup(node.data.character, node.data.sceneId)}</select></label><p class="control-hint">Scope character interactions to one scene, or choose Any Scene for a deliberately global interaction.</p>`;
    if (node.type === "actionMessage") return `<label class="node-editor-field" for="${prefix}-text-line"><span>Saved Text</span><select id="${prefix}-text-line" data-field="textLine" aria-label="Saved text">${textEventOptionsMarkup(node.data.textLine, true)}</select></label><label class="node-editor-field" for="${prefix}-message"><span>Custom Text</span><textarea id="${prefix}-message" data-field="message" maxlength="180" aria-label="Custom message text"></textarea></label><p class="control-hint">Choose saved text or enter a custom message.</p>`;
    if (node.type === "actionFinish") return `<label class="node-editor-field" for="${prefix}-message"><span>Final Message</span><textarea id="${prefix}-message" data-field="message" maxlength="180" aria-label="Final game message"></textarea></label><p class="control-hint">Stops the game and shows this message.</p>`;
    if (node.type === "actionDialogue") return `<label class="node-editor-field" for="${prefix}-line"><span>First Dialogue Line</span><select id="${prefix}-line" data-field="line" aria-label="First dialogue line">${textEventOptionsMarkup(node.data.line, false)}</select></label><p class="control-hint">Dialogue starts here and follows the saved line links.</p>`;
    if (node.type === "actionSetVariable") return `<label class="node-editor-field" for="${prefix}-variable"><span>Value Name</span><input id="${prefix}-variable" data-field="variable" type="text" value="${escape(node.data.variable)}" aria-label="Saved value name" /></label><label class="node-editor-field" for="${prefix}-value"><span>Save As</span><input id="${prefix}-value" data-field="value" type="text" value="${escape(node.data.value)}" aria-label="Value to save" /></label><p class="control-hint">Give the value a name, such as doorOpen, then choose what to save.</p>`;
    if (node.type === "actionChangeNumber") return `<label class="node-editor-field" for="${prefix}-variable"><span>Number Name</span><input id="${prefix}-variable" data-field="variable" type="text" value="${escape(node.data.variable)}" aria-label="Saved number name" /></label><label class="node-editor-field" for="${prefix}-amount"><span>Amount to Add</span><input id="${prefix}-amount" data-field="amount" type="number" step="1" value="${escape(node.data.amount)}" aria-label="Amount added to the saved number" /></label><p class="control-hint">Use a positive number to count up or a negative number to count down.</p>`;
    if (node.type === "logicVariable") return `<label class="node-editor-field" for="${prefix}-variable"><span>Value Name</span><input id="${prefix}-variable" data-field="variable" type="text" value="${escape(node.data.variable)}" aria-label="Saved value name" /></label><label class="node-editor-field" for="${prefix}-equals"><span>Must Equal</span><input id="${prefix}-equals" data-field="equals" type="text" value="${escape(node.data.equals)}" aria-label="Value that makes Then run" /></label><p class="control-hint">Then runs when the values match. Else runs when they do not.</p>`;
    if (node.type === "logicCompareNumber") return `<label class="node-editor-field" for="${prefix}-variable"><span>Number Name</span><input id="${prefix}-variable" data-field="variable" type="text" value="${escape(node.data.variable)}" aria-label="Saved number name" /></label><label class="node-editor-field" for="${prefix}-operator"><span>Check</span><select id="${prefix}-operator" data-field="operator" aria-label="Number check"><option value="=">Equals</option><option value="!=">Does not equal</option><option value="<">Less than</option><option value="<=">Less than or equal</option><option value=">">Greater than</option><option value=">=">Greater than or equal</option></select></label><label class="node-editor-field" for="${prefix}-compare"><span>Check Against</span><input id="${prefix}-compare" data-field="compare" type="number" step="1" value="${escape(node.data.compare)}" aria-label="Number to check against" /></label><p class="control-hint">Then runs when the check passes. Else runs when it does not.</p>`;
    if (node.type === "actionMoveActor") return `<label class="node-editor-field" for="${prefix}-dx"><span>Move Left or Right</span><input id="${prefix}-dx" data-field="dx" type="number" step="1" value="${escape(node.data.dx)}" aria-label="Horizontal player movement" /></label><label class="node-editor-field" for="${prefix}-dy"><span>Move Up or Down</span><input id="${prefix}-dy" data-field="dy" type="number" step="1" value="${escape(node.data.dy)}" aria-label="Vertical player movement" /></label><p class="control-hint">Positive and negative numbers move the player in opposite directions.</p>`;
    if (["actionAddItem", "actionRemoveItem", "logicHasItem"].includes(node.type)) return `<label class="node-editor-field" for="${prefix}-item"><span>Item Name</span><input id="${prefix}-item" data-field="item" type="text" maxlength="40" value="${escape(node.data.item)}" aria-label="Inventory item name" /></label><p class="control-hint">Use the same item name in give, remove, and inventory check rules.</p>`;
    if (node.type === "actionScene") return `<label class="node-editor-field" for="${prefix}-scene"><span>Destination Scene</span><select id="${prefix}-scene" data-field="sceneId" aria-label="Destination scene">${sceneOptionsMarkup(node.data.sceneId)}</select></label><p class="control-hint">This ends the current rule path, changes scene, and runs the new scene's beginning rules.</p>`;
    if (node.type === "actionPlaySound") return `<label class="node-editor-field" for="${prefix}-audio"><span>Audio Clip</span><select id="${prefix}-audio" data-field="audioAssetId" aria-label="Audio clip">${audioOptionsMarkup(node.data.audioAssetId)}</select></label><label class="node-editor-field" for="${prefix}-audio-volume"><span>Volume</span><input id="${prefix}-audio-volume" data-field="audioVolume" type="number" min="0" max="1" step="0.05" value="${escape(node.data.audioVolume)}" aria-label="Audio volume" /></label><label class="node-editor-field node-editor-check-field" for="${prefix}-audio-loop"><span>Loop</span><input id="${prefix}-audio-loop" data-field="audioLoop" type="checkbox"${node.data.audioLoop ? " checked" : ""} aria-label="Loop audio clip" /></label><p class="control-hint">Choose a clip from Audio Studio. Looping sounds continue until a Stop Audio rule runs.</p>`;
    if (node.type === "actionStopSound") return `<label class="node-editor-field" for="${prefix}-audio-stop"><span>Stop</span><select id="${prefix}-audio-stop" data-field="audioStopScope" aria-label="Audio to stop"><option value="all"${node.data.audioStopScope === "all" ? " selected" : ""}>All Audio</option><option value="music"${node.data.audioStopScope === "music" ? " selected" : ""}>Music</option><option value="sfx"${node.data.audioStopScope === "sfx" ? " selected" : ""}>Sound Effects</option></select></label><p class="control-hint">Stop scene music, rule-played effects, or both.</p>`;
    return `<p class="control-hint">${escape(conceptFor(node).explanation)}</p>`;
  }

  function renderInspector(ctx) {
    if (!ctx?.inspector) return;
    const data = graph();
    const node = selectedNode();
    if (!node) {
      ctx.inspector.innerHTML = `<p class="control-hint">Choose a rule on the map to edit it.</p>`;
      return;
    }
    const prefix = `node-editor-${ctx.key}`;
    const selectedObject = api?.getSelectedNodeTriggerOption?.();
    const objectText = selectedObject ? `Selected scene object: ${escape(selectedObject.label)}` : "No scene object selected. Select one before making a touch rule.";
    const objectMarkup = node.type === "eventTrigger" ? `<p class="control-hint node-editor-object-hint">${objectText}</p>` : "";
    const linkMarkup = supportsNext(node.type) ? `<fieldset class="node-editor-fieldset"><legend>What Runs Next</legend><div class="node-editor-link-fields"></div></fieldset>` : "";
    const issueText = issuesByNode(data).get(node.id) || [];
    const concept = conceptFor(node);
    ctx.inspector.innerHTML = `<div class="node-editor-inspector-title"><div><span class="node-editor-concept-badge concept-${escape(concept.key)}">${escape(concept.label)}</span><strong>Edit This Rule</strong></div><button type="button" class="node-editor-test-from" aria-label="Test the selected rule in the game preview">Test Rule</button></div><div class="node-editor-rule-reading"><span>What this rule does</span><code>${escape(nodeStatement(node))}</code><p>${escape(concept.explanation)}</p></div>${objectMarkup}${issueText.length ? `<div class="node-editor-warning-box" role="status"><strong>Check This Rule</strong><span>${escape(issueText.join(" "))}</span></div>` : ""}<fieldset class="node-editor-fieldset"><legend>Name and Type</legend><div class="node-editor-core-fields"><label class="node-editor-field" for="${prefix}-type"><span>Rule Type</span><select id="${prefix}-type" data-field="type" aria-label="Rule type"></select></label><label class="node-editor-field" for="${prefix}-name"><span>Rule Name</span><input id="${prefix}-name" data-field="name" type="text" maxlength="48" value="${escape(node.name)}" aria-label="Rule name" /></label></div></fieldset>${linkMarkup}<fieldset class="node-editor-fieldset"><legend>Settings</legend><div id="${prefix}-fields" class="node-editor-fields">${fieldMarkup(node, prefix)}</div></fieldset>`;
    ctx.inspector.querySelector(".node-editor-test-from")?.addEventListener("click", runSelectedNode);
    const typeSelect = ctx.inspector.querySelector(`[data-field="type"]`);
    Object.entries(TYPES).forEach(([value, typeLabel]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = typeLabel;
      typeSelect.appendChild(option);
    });
    typeSelect.value = node.type;
    const linkFields = ctx.inspector.querySelector(".node-editor-link-fields");
    if (linkFields) {
      const routeTargets = data.nodes.filter(item => item.id !== node.id);
      linkFields.append(makeSelect(`${prefix}-next`, "Then", node.next, routeTargets, "next"));
      if (supportsAlt(node.type)) linkFields.append(makeSelect(`${prefix}-alt`, "Else", node.alt, routeTargets, "alt"));
    }
    const message = ctx.inspector.querySelector(`[data-field="message"]`);
    if (message) message.value = node.data.message || "";
    const textLine = ctx.inspector.querySelector(`[data-field="textLine"]`);
    if (textLine) textLine.value = String(Number.isFinite(Number(node.data.textLine)) ? Number(node.data.textLine) : -1);
    const operator = ctx.inspector.querySelector(`[data-field="operator"]`);
    if (operator) operator.value = node.data.operator || ">=";
    ctx.inspector.querySelectorAll("input, select, textarea").forEach(input => {
      const applyEdit = () => { api.beginHistory?.(); applyInspector(ctx, node); api.commitHistory?.(); };
      input.addEventListener("input", applyEdit);
      input.addEventListener("change", () => {
        const refreshScope = input.dataset.field === "sceneId" && ["eventTrigger", "eventInteract"].includes(node.type);
        applyEdit();
        if (refreshScope) renderInspector(ctx);
      });
    });
  }

  function applyInspector(ctx, node) {
    const type = ctx.inspector.querySelector(`[data-field="type"]`)?.value || node.type;
    const oldType = node.type;
    node.type = TYPES[type] ? type : node.type;
    node.name = text(ctx.inspector.querySelector(`[data-field="name"]`)?.value, TYPES[node.type]).slice(0, 48) || TYPES[node.type];
    const nextField = ctx.inspector.querySelector(`[data-field="next"]`);
    const altField = ctx.inspector.querySelector(`[data-field="alt"]`);
    node.next = supportsNext(node.type) ? (nextField ? nextField.value : node.next || "") : "";
    node.alt = supportsAlt(node.type) ? (altField ? altField.value : node.alt || "") : "";
    node.data.trigger = text(ctx.inspector.querySelector(`[data-field="trigger"]`)?.value, node.data.trigger).slice(0, 32) || "any";
    node.data.character = text(ctx.inspector.querySelector(`[data-field="character"]`)?.value, node.data.character).slice(0, 80) || "any";
    const message = ctx.inspector.querySelector(`[data-field="message"]`);
    if (message) node.data.message = String(message.value || "").slice(0, 180);
    const textLine = ctx.inspector.querySelector(`[data-field="textLine"]`);
    if (textLine) node.data.textLine = Math.max(-1, Number(textLine.value));
    const line = ctx.inspector.querySelector(`[data-field="line"]`);
    if (line) node.data.line = Math.max(0, Number(line.value) || 0);
    node.data.variable = text(ctx.inspector.querySelector(`[data-field="variable"]`)?.value, node.data.variable).slice(0, 32) || "flag";
    node.data.value = text(ctx.inspector.querySelector(`[data-field="value"]`)?.value, node.data.value).slice(0, 48) || "true";
    node.data.equals = text(ctx.inspector.querySelector(`[data-field="equals"]`)?.value, node.data.equals).slice(0, 48) || "true";
    node.data.amount = number(ctx.inspector.querySelector(`[data-field="amount"]`)?.value, node.data.amount, -1000, 1000);
    const operator = ctx.inspector.querySelector(`[data-field="operator"]`)?.value;
    if (["=", "!=", "<", "<=", ">", ">="].includes(operator)) node.data.operator = operator;
    node.data.compare = number(ctx.inspector.querySelector(`[data-field="compare"]`)?.value, node.data.compare, -1000000, 1000000);
    node.data.dx = number(ctx.inspector.querySelector(`[data-field="dx"]`)?.value, node.data.dx, -1000, 1000);
    node.data.dy = number(ctx.inspector.querySelector(`[data-field="dy"]`)?.value, node.data.dy, -1000, 1000);
    node.data.item = text(ctx.inspector.querySelector(`[data-field="item"]`)?.value, node.data.item).slice(0, 40) || "key";
    node.data.sceneId = text(ctx.inspector.querySelector(`[data-field="sceneId"]`)?.value, node.data.sceneId).slice(0, 48);
    node.data.audioAssetId = text(ctx.inspector.querySelector(`[data-field="audioAssetId"]`)?.value, node.data.audioAssetId).slice(0, 48);
    node.data.audioVolume = number(ctx.inspector.querySelector(`[data-field="audioVolume"]`)?.value, node.data.audioVolume, 0, 1);
    const audioLoop = ctx.inspector.querySelector(`[data-field="audioLoop"]`);
    if (audioLoop) node.data.audioLoop = audioLoop.checked;
    const audioStopScope = ctx.inspector.querySelector(`[data-field="audioStopScope"]`)?.value;
    if (["all", "music", "sfx"].includes(audioStopScope)) node.data.audioStopScope = audioStopScope;
    if (oldType !== node.type) {
      renderAllContexts(false);
    } else {
      renderNodes(inlineContext);
      if (overlayOpen) renderNodes(overlayContext);
    }
    api.saveLocal();
  }

  function contextFromElement(element) {
    return element?.closest(".node-editor-large") ? overlayContext : inlineContext;
  }

  function select(id, quiet = false) {
    const data = graph();
    if (!data.nodes.some(node => node.id === id)) return;
    selectedId = id;
    data.selectedId = id;
    if (!quiet) renderAllContexts();
    api.saveLocal();
  }

  function portTitle(port, type = "") {
    if (port === "alt") return "Else";
    return DECISION_TYPES.has(type) ? "Then" : "Next";
  }

  function boardLabel(ctx) {
    return ctx?.key === "large" ? "Large visual game rule map" : "Visual game rule map";
  }

  function clearConnectionVisuals(ctx, sourceElement) {
    sourceElement?.classList.remove("connection-source", "connection-next", "connection-alt");
    ctx?.board?.classList.remove("connecting", "node-editor-board-live");
    ctx?.board?.setAttribute("aria-label", boardLabel(ctx));
    clearBoardMotion(ctx);
  }

  function cancelPendingConnection(message = "") {
    if (!pendingConnection) return false;
    const ctx = pendingConnection.contextKey === "large" ? overlayContext : inlineContext;
    const sourceElement = ctx?.nodeLayer?.querySelector(`[data-node-id="${cssEscape(pendingConnection.sourceId)}"]`);
    clearConnectionVisuals(ctx, sourceElement);
    pendingConnection = null;
    if (message) api.setStatus(message);
    return true;
  }

  function connectNodes(sourceId, port, targetId) {
    const data = graph();
    const source = data.nodes.find(node => node.id === sourceId);
    const target = data.nodes.find(node => node.id === targetId);
    if (!source || !target || source.id === target.id) return false;
    if (port === "alt" && !supportsAlt(source.type)) return false;
    if (port === "next" && !supportsNext(source.type)) return false;
    api.beginHistory?.();
    source[port] = target.id;
    selectedId = source.id;
    data.selectedId = source.id;
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus(`${portTitle(port, source.type)} connection created from ${source.name} to ${target.name}.`);
    return true;
  }

  function armPendingConnection(id, port, ctx, sourceElement) {
    if (!ctx) return;
    if (pendingConnection?.sourceId === id && pendingConnection?.port === port && pendingConnection?.contextKey === ctx.key) return;
    cancelPendingConnection();
    const source = graph().nodes.find(node => node.id === id);
    if (!source) return;
    pendingConnection = { sourceId: source.id, port, contextKey: ctx.key };
    select(id, true);
    sourceElement?.classList.add("connection-source", `connection-${port}`);
    ctx.board.classList.add("connecting", "node-editor-board-live");
    ctx.board.setAttribute("aria-label", `Connecting ${portTitle(port, source.type)} from ${source.name}. Click another rule or press Escape to cancel.`);
    api.setStatus(`${portTitle(port, source.type)} connection ready. Click the rule that should run next.`);
  }

  function completePendingConnection(targetId) {
    if (!pendingConnection) return false;
    if (!targetId || targetId === pendingConnection.sourceId) {
      api.setStatus("Choose a different rule to finish the connection, or press Escape to cancel.");
      return true;
    }
    const pending = { ...pendingConnection };
    cancelPendingConnection();
    if (!connectNodes(pending.sourceId, pending.port, targetId)) {
      api.setStatus("That connection could not be created.");
      return true;
    }
    renderAllContexts();
    return true;
  }

  function startConnection(event, id, port) {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingConnection();
    const ctx = contextFromElement(event.currentTarget);
    const source = graph().nodes.find(node => node.id === id);
    if (!source || !ctx) return;
    const sourceElement = event.currentTarget.closest(".node-editor-node");
    connection = { source, port, ctx, sourceElement, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    select(id, true);
    sourceElement?.classList.add("connection-source", `connection-${port}`);
    ctx.board.classList.add("connecting", "node-editor-board-live");
    ctx.board.setAttribute("aria-label", `Connecting ${portTitle(port, source.type)} from ${source.name}. Drag to another rule or release to use click connection.`);
    setBoardMotion(ctx, 8, 0);
    document.addEventListener("pointermove", moveConnection, true);
    document.addEventListener("pointerup", endConnection, true);
    drawLinks(ctx);
  }

  function moveConnection(event) {
    if (!connection) return;
    connection.x = event.clientX;
    connection.y = event.clientY;
    if (Math.abs(event.clientX - connection.startX) + Math.abs(event.clientY - connection.startY) > 5) connection.moved = true;
    const p = boardPoint(connection.ctx, event.clientX, event.clientY);
    setBoardMotion(connection.ctx, p.x - connection.source.x, p.y - connection.source.y);
    drawLinks(connection.ctx);
  }

  function endConnection(event) {
    if (!connection) return;
    const active = connection;
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".node-editor-node");
    let targetId = targetElement?.dataset?.nodeId || "";
    if (!targetId) {
      const p = boardPoint(active.ctx, event.clientX, event.clientY);
      const hit = graph().nodes.find(node => p.x >= node.x && p.x <= node.x + NODE_WIDTH && p.y >= node.y && p.y <= node.y + NODE_HEIGHT);
      targetId = hit?.id || "";
    }
    clearConnectionVisuals(active.ctx, active.sourceElement);
    document.removeEventListener("pointermove", moveConnection, true);
    document.removeEventListener("pointerup", endConnection, true);
    connection = null;
    if (targetId && targetId !== active.source.id) {
      ignorePortClickUntil = performance.now() + 250;
      connectNodes(active.source.id, active.port, targetId);
      renderAllContexts();
      return;
    }
    if (!active.moved) {
      armPendingConnection(active.source.id, active.port, active.ctx, active.sourceElement);
      drawLinks(active.ctx);
      return;
    }
    ignorePortClickUntil = performance.now() + 250;
    api.setStatus("Connection not changed. Drag onto another rule, or click Connect and then click the target rule.");
    renderAllContexts();
  }

  function drawLine(ctx, x1, y1, x2, y2, route = "next", active = false, running = false, audioPath = false) {
    const line = document.createElement("div");
    const length = Math.hypot(x2 - x1, y2 - y1);
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    line.className = `node-editor-link-line route-${route} ${audioPath ? "audio-path-route" : ""} ${active ? "active-route" : ""} ${running ? "route-running" : ""}`;
    line.style.left = `${x1}px`;
    line.style.top = `${y1}px`;
    line.style.width = `${length}px`;
    line.style.transform = `rotate(${angle}deg)`;
    line.dataset.audioPath = String(audioPath);
    line.setAttribute("aria-hidden", "true");
    if (audioPath) {
      const signal = audioRouteSignalElement();
      signal.style.transform = `translate(-50%, -50%) rotate(${-angle}deg)`;
      line.appendChild(signal);
    }
    ctx.board.appendChild(line);
  }

  function boardPoint(ctx, clientX, clientY) {
    const rect = ctx.board.getBoundingClientRect();
    return { x: clientX - rect.left + ctx.board.scrollLeft, y: clientY - rect.top + ctx.board.scrollTop };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setBoardMotion(ctx, dx = 0, dy = 0) {
    if (!ctx?.board) return;
    ctx.board.style.setProperty("--node-map-x", `${clamp(dx / 8, -18, 18)}px`);
    ctx.board.style.setProperty("--node-map-y", `${clamp(dy / 8, -18, 18)}px`);
  }

  function clearBoardMotion(ctx) {
    if (!ctx?.board) return;
    ctx.board.style.removeProperty("--node-map-x");
    ctx.board.style.removeProperty("--node-map-y");
  }

  function drawLinks(ctx) {
    if (!ctx?.board) return;
    ctx.board.querySelectorAll(".node-editor-link-line, .node-editor-link-preview").forEach(item => item.remove());
    const data = graph();
    const byId = new Map(data.nodes.map(node => [node.id, node]));
    const audioPaths = audioReachability(data);
    byId.forEach(node => {
      [[node.next, "next"], [node.alt, "alt"]].forEach(([targetId, route]) => {
        const target = byId.get(targetId);
        if (!target) return;
        const sourceY = node.y + (route === "alt" ? 66 : 42);
        const leadsToAudio = audioPaths.get(target.id) === true;
        drawLine(ctx, node.x + NODE_WIDTH, sourceY, target.x, target.y + 46, route, node.id === selectedId || target.id === selectedId, isLinkActive(node.id, target.id), leadsToAudio);
      });
    });
    if (connection?.ctx === ctx) {
      const p = boardPoint(ctx, connection.x, connection.y);
      const line = document.createElement("div");
      const x1 = connection.source.x + NODE_WIDTH;
      const y1 = connection.source.y + (connection.port === "alt" ? 66 : 42);
      const length = Math.hypot(p.x - x1, p.y - y1);
      const angle = Math.atan2(p.y - y1, p.x - x1) * 180 / Math.PI;
      line.className = `node-editor-link-preview route-${connection.port}`;
      line.style.left = `${x1}px`;
      line.style.top = `${y1}px`;
      line.style.width = `${length}px`;
      line.style.transform = `rotate(${angle}deg)`;
      line.setAttribute("aria-hidden", "true");
      ctx.board.appendChild(line);
    }
  }

  function renderRuntime(ctx) {
    if (!ctx?.runtime) return;
    const data = graph();
    const nextLabels = routeLabels(runtimeState.nextIds || [], data.nodes);
    const actionItems = runtimeState.actions.length ? runtimeState.actions.map(item => `<li>${escape(item)}</li>`).join("") : `<li>No rules have run yet.</li>`;
    const logItems = runtimeLog.length ? runtimeLog.map(item => `<li>${escape(item)}</li>`).join("") : `<li>Press Run, touch an object with a rule, or use Test Rule here.</li>`;
    const variableEntries = Object.entries(data.runtime?.variables || {}).slice(0, 5);
    const variableText = variableEntries.length ? variableEntries.map(([key, value]) => `${key}=${value}`).join(" · ") : "Nothing saved yet";
    const inventory = Array.isArray(data.runtime?.inventory) ? data.runtime.inventory : [];
    const inventoryText = inventory.length ? inventory.slice(0, 6).join(" · ") : "Empty";
    ctx.runtime.innerHTML = `<div class="node-editor-section-head"><strong>Test Results</strong><span>${escape(playTesterStateLabel())}</span></div><div class="node-editor-activity-grid" aria-live="polite"><div><strong>Current Rule</strong><span>${escape(runtimeState.currentLabel || "None")}</span></div><div><strong>Started By</strong><span>${escape(runtimeState.lastTrigger || "None")}</span></div><div><strong>Up Next</strong><span>${escape(nextLabels.length ? nextLabels.join(" · ") : "Nothing queued")}</span></div><div><strong>Saved Values</strong><span>${escape(variableText)}</span></div><div><strong>Inventory</strong><span>${escape(inventoryText)}</span></div></div><div class="node-editor-log-columns"><div><strong>Rules Run</strong><ul>${actionItems}</ul></div><div><strong>Test Log</strong><ul>${logItems}</ul></div></div><p class="sr-only">This panel updates when a rule starts, another rule runs, inventory changes, a saved value changes, or the next rule is chosen.</p>`;
  }


  function renderOutline(ctx) {
    if (!ctx?.outline) return;
    const data = graph();
    const byId = new Map(data.nodes.map(node => [node.id, node]));
    const roots = data.nodes.filter(node => EVENT_TYPES.has(node.type));
    const reachable = new Set();
    const heading = document.createElement("div");
    heading.className = "node-editor-section-head";
    heading.innerHTML = `<strong>Rule Outline</strong><span>${roots.length ? `${roots.length} way${roots.length === 1 ? "" : "s"} to start` : "Add a start rule"}</span>`;
    const note = document.createElement("p");
    note.className = "node-editor-bind-note";
    note.textContent = "Read each rule path from top to bottom. Choose a step to edit it on the map.";
    ctx.outline.replaceChildren(heading, note);

    function appendBranch(parent, node, edge, path, depth = 0) {
      if (!node || depth > 24) return;
      reachable.add(node.id);
      const item = document.createElement("li");
      item.className = `node-outline-item concept-${conceptFor(node).key}`;
      if (edge) {
        const route = document.createElement("span");
        route.className = `node-outline-route route-${edge === "Else" ? "alt" : "next"}`;
        route.textContent = edge;
        item.appendChild(route);
      }
      const buttonNode = document.createElement("button");
      buttonNode.type = "button";
      buttonNode.dataset.outlineNode = node.id;
      buttonNode.className = node.id === selectedId ? "active" : "";
      buttonNode.innerHTML = `<span>${escape(conceptFor(node).label)}</span><strong>${escape(node.name)}</strong><small>${escape(nodeStatement(node))}</small>`;
      buttonNode.setAttribute("aria-label", `Edit ${node.name}. ${nodeDetail(node)}`);
      buttonNode.addEventListener("click", () => {
        if (ctx.mapDetails) ctx.mapDetails.open = true;
        select(node.id);
        requestAnimationFrame(() => scrollNodeIntoView(ctx, node.id));
      });
      item.appendChild(buttonNode);
      if (path.has(node.id)) {
        const loop = document.createElement("small");
        loop.className = "node-outline-loop";
        loop.textContent = "This path returns here.";
        item.appendChild(loop);
        parent.appendChild(item);
        return;
      }
      const nextPath = new Set(path);
      nextPath.add(node.id);
      const branches = [];
      if (node.next && byId.has(node.next)) branches.push([supportsAlt(node.type) ? "Then" : "Next", byId.get(node.next)]);
      if (supportsAlt(node.type) && node.alt && byId.has(node.alt)) branches.push(["Else", byId.get(node.alt)]);
      if (branches.length) {
        const list = document.createElement("ul");
        branches.forEach(([route, target]) => appendBranch(list, target, route, nextPath, depth + 1));
        item.appendChild(list);
      } else if (supportsNext(node.type)) {
        const stop = document.createElement("small");
        stop.className = supportsAlt(node.type) ? "node-outline-stop" : "node-outline-end";
        stop.textContent = supportsAlt(node.type) ? "Connect Then and Else." : "Rule path ends here.";
        item.appendChild(stop);
      }
      parent.appendChild(item);
    }

    if (!roots.length) {
      const empty = document.createElement("p");
      empty.className = "node-editor-empty";
      empty.textContent = "Add When Scene Starts, When Player Touches, or When Player Interacts.";
      ctx.outline.appendChild(empty);
    } else {
      const list = document.createElement("ol");
      list.className = "node-editor-outline-list";
      roots.forEach(root => appendBranch(list, root, "", new Set()));
      ctx.outline.appendChild(list);
    }
    const orphans = data.nodes.filter(node => !reachable.has(node.id));
    if (orphans.length) {
      const box = document.createElement("div");
      box.className = "node-editor-orphans";
      const title = document.createElement("strong");
      title.textContent = "Unconnected Rules";
      const row = document.createElement("div");
      orphans.forEach(node => {
        const buttonNode = document.createElement("button");
        buttonNode.type = "button";
        buttonNode.textContent = node.name;
        buttonNode.addEventListener("click", () => { select(node.id); scrollNodeIntoView(ctx, node.id); });
        row.appendChild(buttonNode);
      });
      box.append(title, row);
      ctx.outline.appendChild(box);
    }
  }

  function getSummary() {
    const data = graph();
    return { nodeCount: data.nodes.length, startCount: data.nodes.filter(node => EVENT_TYPES.has(node.type)).length, issueCount: computeGraphIssues(data).length };
  }

  function renderCheck(ctx) {
    if (!ctx?.check) return;
    const issues = computeGraphIssues();
    const rows = issues.slice(0, 8).map((issue, index) => `<li>${issue.id ? `<button type="button" data-node-issue="${escape(issue.id)}">Open</button>` : ""}<span>${escape(issue.text)}</span></li>`).join("");
    ctx.check.innerHTML = `<div class="node-editor-section-head"><strong>Rule Check</strong><span>${issues.length ? `${issues.length} found` : "All good"}</span></div>${issues.length ? `<ul>${rows}</ul>` : `<p class="node-editor-bind-note">No problems found. Each start rule connects to something the game can run.</p>`}<p class="sr-only">Rule check warnings point out rules that may not run in the tester or exported game.</p>`;
    ctx.check.querySelectorAll("[data-node-issue]").forEach(button => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.nodeIssue || selectedId;
        graph().selectedId = selectedId;
        renderAllContexts();
        scrollNodeIntoView(ctx, selectedId);
      });
    });
  }

  function nodeCountForTrigger(triggerId) {
    const id = String(triggerId || ""), sceneId = String(api?.getState?.()?.playMode?.activeSceneId || "");
    return graph().nodes.filter(node => node.type === "eventTrigger" && String(node.data.trigger || "") === id && (!node.data.sceneId || String(node.data.sceneId) === sceneId)).length;
  }

  function nodeCountForCharacter(characterId) {
    const sceneId = String(api?.getState?.()?.playMode?.activeSceneId || "");
    return graph().nodes.filter(node => node.type === "eventInteract" && String(node.data.character || "any") === String(characterId || "") && (!node.data.sceneId || String(node.data.sceneId) === sceneId)).length;
  }

  function lessonNode(type, name, x, y, data = {}) {
    const nextData = EVENT_TYPES.has(type) && !data.sceneId ? { ...data, sceneId: api?.getState?.()?.playMode?.activeSceneId || "" } : data;
    return normalizeNode({ id: makeId(type), type, name, x, y, next: "", alt: "", data: nextData }, 0);
  }

  function ensureSwitchDoorObjects() {
    const state = api?.getState?.();
    if (!state?.playMode) return [];
    if (!Array.isArray(state.playMode.props)) state.playMode.props = [];
    const frameCount = Math.max(1, Array.isArray(state.frames) ? state.frames.length : 1);
    const artHeight = Math.max(1, Number(state.height || state.size) || 32);
    const groundY = Math.max(32, Number(state.playMode.groundY) || 300);
    const actorScale = Math.max(1, Number(state.playMode.actorScale) || 3);
    const settings = [
      { id: "switch", frame: Math.min(1, frameCount - 1), x: 220, scale: 1, solid: false, openVariable: "" },
      { id: "door", frame: Math.min(2, frameCount - 1), x: 500, scale: Math.max(2, actorScale), solid: true, openVariable: "doorOpen" }
    ];
    const results = settings.map(setting => {
      let index = state.playMode.props.findIndex(prop => String(prop?.nodeTriggerId || "") === setting.id);
      if (index < 0) {
        state.playMode.props.push({
          frame: setting.frame,
          x: setting.x,
          y: Math.max(0, groundY - artHeight * setting.scale),
          scale: setting.scale,
          solid: setting.solid,
          dialogueCharacterId: "",
          nodeTriggerId: setting.id,
          openVariable: setting.openVariable
        });
        index = state.playMode.props.length - 1;
      } else {
        state.playMode.props[index].nodeTriggerId = setting.id;
        state.playMode.props[index].solid = setting.solid;
        state.playMode.props[index].openVariable = setting.openVariable;
      }
      const prop = state.playMode.props[index];
      return { id: setting.id, index, frame: Number(prop.frame) || 0, label: `${setting.id === "switch" ? "Switch" : "Door"} · Object ${index + 1} · Frame ${(Number(prop.frame) || 0) + 1}` };
    });
    api.renderPlayPanel?.();
    api.drawPlayScene?.();
    return results;
  }

  function buildLesson(id) {
    let options = api?.getNodeTriggerOptions?.() || [];
    if (id === "sequence") {
      const start = lessonNode("eventStart", "Scene Begins", 44, 54);
      const message = lessonNode("actionMessage", "Explain the Goal", 360, 54, { message: "This is a sequence: each rule runs in order from left to right." });
      const checkpoint = lessonNode("actionCheckpoint", "Remember Start", 676, 54);
      start.next = message.id;
      message.next = checkpoint.id;
      return { nodes: [start, message, checkpoint], selectedId: start.id, message: "First Sequence loaded. Press Test Start to watch the order." };
    }
    if (id === "touch-win") {
      const triggerId = options[0]?.id || "any";
      const start = lessonNode("eventStart", "Give the Goal", 44, 54);
      const intro = lessonNode("actionMessage", "Goal Message", 360, 54, { message: "Touch the goal object to win." });
      const trigger = lessonNode("eventTrigger", "Goal Touched", 44, 250, { trigger: triggerId });
      const success = lessonNode("actionMessage", "Celebrate", 360, 250, { message: "You reached the goal!" });
      const finish = lessonNode("actionFinish", "Win", 676, 250, { message: "You win!" });
      start.next = intro.id;
      trigger.next = success.id;
      success.next = finish.id;
      return { nodes: [start, intro, trigger, success, finish], selectedId: trigger.id, message: options.length ? `Touch to Win loaded and bound to ${options[0].label || triggerId}.` : "Touch to Win loaded. Place an object, then bind the touch event." };
    }
    if (id === "count-three") {
      const triggerId = options[0]?.id || "any";
      const start = lessonNode("eventStart", "Reset Counter", 44, 54);
      const reset = lessonNode("actionSetVariable", "Score Starts at Zero", 360, 54, { variable: "score", value: "0" });
      const intro = lessonNode("actionMessage", "Counting Goal", 676, 54, { message: "Touch the counter object three times. Leave it and come back between touches." });
      const trigger = lessonNode("eventTrigger", "Count a Touch", 44, 300, { trigger: triggerId });
      const add = lessonNode("actionChangeNumber", "Add One", 360, 300, { variable: "score", amount: 1 });
      const compare = lessonNode("logicCompareNumber", "Reached Three?", 676, 300, { variable: "score", operator: ">=", compare: 3 });
      const finish = lessonNode("actionFinish", "Counting Complete", 992, 240, { message: "Three touches! You win." });
      const keepGoing = lessonNode("actionMessage", "Keep Counting", 992, 370, { message: "Not three yet. Touch it again." });
      start.next = reset.id;
      reset.next = intro.id;
      trigger.next = add.id;
      add.next = compare.id;
      compare.next = finish.id;
      compare.alt = keepGoing.id;
      return { nodes: [start, reset, intro, trigger, add, compare, finish, keepGoing], selectedId: compare.id, message: options.length ? `Count to Three loaded and bound to ${options[0].label || triggerId}.` : "Count to Three loaded. Place an object, then bind the touch event." };
    }
    if (id === "switch-door") {
      options = ensureSwitchDoorObjects();
      const switchObject = options[0];
      const doorObject = options[1];
      if (!switchObject || !doorObject) return { error: "The Switch and Door example could not create its scene objects." };
      const start = lessonNode("eventStart", "Reset Door", 44, 54);
      const closeDoor = lessonNode("actionSetVariable", "Door Starts Closed", 360, 54, { variable: "doorOpen", value: "no" });
      const intro = lessonNode("actionMessage", "Explain the Goal", 676, 54, { message: "Walk right. Touch the small switch, then touch the large door." });
      const switchTrigger = lessonNode("eventTrigger", "Touch Switch", 44, 250, { trigger: switchObject.id });
      const openDoor = lessonNode("actionSetVariable", "Open Door", 360, 250, { variable: "doorOpen", value: "yes" });
      const openMessage = lessonNode("actionMessage", "Switch Message", 676, 250, { message: "The switch opened the door. Keep walking right to the door." });
      const doorTrigger = lessonNode("eventTrigger", "Touch Door", 44, 470, { trigger: doorObject.id });
      const checkDoor = lessonNode("logicVariable", "Is Door Open?", 360, 470, { variable: "doorOpen", equals: "yes" });
      const finish = lessonNode("actionFinish", "Leave Room", 676, 410, { message: "The door was open. You escaped!" });
      const locked = lessonNode("actionMessage", "Locked Message", 676, 540, { message: "The door is locked. Find the switch." });
      start.next = closeDoor.id;
      closeDoor.next = intro.id;
      switchTrigger.next = openDoor.id;
      openDoor.next = openMessage.id;
      doorTrigger.next = checkDoor.id;
      checkDoor.next = finish.id;
      checkDoor.alt = locked.id;
      return { nodes: [start, closeDoor, intro, switchTrigger, openDoor, openMessage, doorTrigger, checkDoor, finish, locked], selectedId: switchTrigger.id, message: "Switch and Door loaded. A small switch and a large door were placed in Play Mode. Press Run and walk right." };
    }
    return { error: "That guided build is not available." };
  }

  function applyLesson(id) {
    const lesson = buildLesson(id);
    if (lesson.error) {
      api.setStatus(lesson.error);
      return;
    }
    api.beginHistory?.();
    const data = { selectedId: lesson.selectedId, runtime: { variables: {}, inventory: [], checkpoint: null }, nodes: lesson.nodes };
    api.getState().playMode.nodeEditor = data;
    selectedId = data.selectedId;
    lastEntered = new Set();
    runtimeLog = [];
    activeIds = new Map();
    activeLinks = new Map();
    resetRuntimeState();
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    logRuntime(lesson.message);
    api.setStatus(lesson.message);
  }

  function renderLessons(ctx) {
    if (!ctx?.lessons) return;
    ctx.lessons.innerHTML = `<div class="node-editor-section-head"><strong>Examples</strong><span>Load and try one</span></div><p class="node-editor-bind-note">Each example replaces the current rule map. You can test it, change it, and include it in the exported game.</p>`;
    const grid = document.createElement("div");
    grid.className = "node-editor-lesson-grid";
    LESSONS.forEach(lesson => {
      const buttonNode = document.createElement("button");
      buttonNode.type = "button";
      buttonNode.className = "node-editor-lesson";
      buttonNode.innerHTML = `<span>${escape(lesson.concept)}</span><strong>${escape(lesson.title)}</strong><small>${escape(lesson.detail)}</small>`;
      buttonNode.setAttribute("aria-label", `Load example ${lesson.title}. This replaces the current rule map.`);
      buttonNode.addEventListener("click", () => applyLesson(lesson.id));
      grid.appendChild(buttonNode);
    });
    ctx.lessons.appendChild(grid);
  }

  function renderBindings(ctx) {
    if (!ctx?.bindings) return;
    const options = api?.getNodeTriggerOptions?.() || [];
    const characters = api?.getInteractionCharacterOptions?.() || [];
    ctx.bindings.innerHTML = "";
    const touchSection = document.createElement("section");
    touchSection.className = "node-editor-binding-section";
    if (!options.length) {
      touchSection.innerHTML = `<div class="node-editor-section-head"><strong>Touch Rules</strong><span>First add an object</span></div><p class="node-editor-bind-note">Place an object in Play Mode, then make a rule that starts when the player touches it.</p><ol class="node-editor-mini-steps"><li>Choose a frame in Place Frame Art.</li><li>Click Place Object.</li><li>Use Make Rule here or in Scene Objects.</li></ol><p class="sr-only">No scene objects are available for touch rules.</p>`;
    } else {
      touchSection.innerHTML = `<div class="node-editor-section-head"><strong>Touch Rules</strong><span>Objects in the scene</span></div><p class="node-editor-bind-note">Make or open the rule that runs when the player touches each object.</p>`;
      options.forEach(option => {
        const count = nodeCountForTrigger(option.id);
        const row = document.createElement("div");
        row.className = `node-editor-binding-row ${count ? "bound" : ""}`;
        const labelWrap = document.createElement("span");
        labelWrap.innerHTML = `<span>${escape(option.label || option.id)}</span><small>${count ? `${count} touch rule${count === 1 ? "" : "s"} · used in testing and export` : "Not connected yet · make a touch rule"}</small>`;
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = count ? "Open Rule" : "Make Rule";
        action.setAttribute("aria-label", `${count ? "Open" : "Create"} touch rule for ${option.label || option.id}`);
        action.addEventListener("click", () => createTriggerForObject(option));
        row.append(labelWrap, action);
        touchSection.appendChild(row);
      });
    }
    const characterSection = document.createElement("section");
    characterSection.className = "node-editor-binding-section";
    if (!characters.length) {
      characterSection.innerHTML = `<div class="node-editor-section-head"><strong>Character Interactions</strong><span>First add an NPC</span></div><p class="node-editor-bind-note">Add an NPC in Character Manager to create a rule for the Interact button.</p><p class="sr-only">No NPC characters are available for interaction rules.</p>`;
    } else {
      characterSection.innerHTML = `<div class="node-editor-section-head"><strong>Character Interactions</strong><span>Interact button rules</span></div><p class="node-editor-bind-note">Make or open the rule that runs when the player presses Interact near a character or an assigned scene object.</p>`;
      characters.forEach(character => {
        const count = nodeCountForCharacter(character.id);
        const row = document.createElement("div");
        row.className = `node-editor-binding-row ${count ? "bound" : ""}`;
        const labelWrap = document.createElement("span");
        labelWrap.innerHTML = `<span>${escape(character.label || character.name || character.id)}</span><small>${count ? `${count} interaction rule${count === 1 ? "" : "s"} · used in testing and export` : `Starts at text event ${Number(character.startLine || 0) + 1} · make an interaction rule`}</small>`;
        const action = document.createElement("button");
        action.type = "button";
        action.textContent = count ? "Open Rule" : "Make Rule";
        action.setAttribute("aria-label", `${count ? "Open" : "Create"} interaction rule for ${character.name || character.id}`);
        action.addEventListener("click", () => createInteractionForCharacter(character));
        row.append(labelWrap, action);
        characterSection.appendChild(row);
      });
    }
    ctx.bindings.append(touchSection, characterSection);
  }

  function renderNodes(ctx) {
    if (!ctx?.nodeLayer) return;
    ctx.nodeLayer.innerHTML = "";
    const data = graph();
    const nodeIssues = issuesByNode(data);
    const audioPaths = audioReachability(data);
    data.nodes.forEach(node => {
      const issueText = nodeIssues.get(node.id) || [];
      const concept = conceptFor(node);
      const directAudio = isAudioNode(node);
      const audioPath = !directAudio && audioPaths.get(node.id) === true;
      const item = document.createElement("div");
      const pendingSource = pendingConnection?.sourceId === node.id && pendingConnection?.contextKey === ctx.key;
      item.className = `node-editor-node concept-${concept.key} ${directAudio ? "audio-action" : ""} ${audioPath ? "audio-path" : ""} ${node.id === selectedId ? "active" : ""} ${EVENT_TYPES.has(node.type) ? "event" : ""} ${isActive(node.id) ? "running" : ""} ${node.id === highlightedId ? "just-created" : ""} ${node.id === settlingId ? "settling" : ""} ${node.type === "eventTrigger" && node.data.trigger && node.data.trigger !== "any" ? "bound" : ""} ${issueText.length ? "warning" : ""} ${pendingSource ? `connection-source connection-${pendingConnection.port}` : ""}`;
      item.style.left = `${Math.round(node.x)}px`;
      item.style.top = `${Math.round(node.y)}px`;
      item.dataset.nodeId = node.id;
      item.dataset.concept = concept.key;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      const connectionCopy = !supportsNext(node.type) ? "This rule ends the path." : supportsAlt(node.type) ? "Connect Then and Else to other rules." : "Connect Then to another rule.";
      const audioCopy = directAudio ? "This is an audio rule." : audioPath ? "This rule path contains audio." : "";
      item.setAttribute("aria-label", `${node.name}. ${concept.label} rule. ${nodeStatement(node)}. ${audioCopy} ${issueText.length ? `Warning: ${issueText.join(" ")}` : "No warnings."} Drag to move. ${connectionCopy}`);
      item.setAttribute("aria-pressed", String(node.id === selectedId));
      const body = document.createElement("div");
      body.className = "node-editor-node-body";
      const title = document.createElement("strong");
      title.textContent = node.name;
      const meta = document.createElement("div");
      meta.className = "node-editor-node-meta";
      const conceptBadge = document.createElement("span");
      conceptBadge.className = `node-editor-concept-badge concept-${concept.key}`;
      conceptBadge.textContent = concept.label;
      const type = document.createElement("span");
      type.className = "node-editor-type-label";
      type.textContent = TYPES[node.type] || "Rule";
      meta.append(conceptBadge, type);
      if (directAudio) meta.appendChild(audioBadgeElement("Audio"));
      else if (audioPath) meta.appendChild(audioBadgeElement("Leads to Audio"));
      const statement = document.createElement("code");
      statement.className = "node-editor-node-statement";
      statement.textContent = nodeStatement(node);
      const flow = document.createElement("span");
      flow.className = "node-editor-node-route";
      flow.textContent = issueText.length ? issueText[0] : routeSummary(node);
      body.append(title, meta);
      if (directAudio) body.appendChild(audioWaveElement());
      body.append(statement, flow);
      const ports = document.createElement("div");
      ports.className = "node-editor-ports";
      const availablePorts = [];
      if (supportsNext(node.type)) availablePorts.push("next");
      if (supportsAlt(node.type)) availablePorts.push("alt");
      availablePorts.forEach(port => {
        const portButton = document.createElement("button");
        portButton.type = "button";
        portButton.className = `node-editor-port ${port}`;
        portButton.innerHTML = `<span>Connect</span><strong>${portTitle(port, node.type)}</strong><span aria-hidden="true">→</span><span class="sr-only"> from ${escape(node.name)} to another rule</span>`;
        portButton.setAttribute("aria-label", `Connect ${portTitle(port, node.type)} from ${node.name} to another rule`);
        portButton.addEventListener("pointerdown", event => startConnection(event, node.id, port));
        portButton.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          if (performance.now() < ignorePortClickUntil) return;
          armPendingConnection(node.id, port, ctx, portButton.closest(".node-editor-node"));
        });
        ports.appendChild(portButton);
      });
      item.append(body);
      if (availablePorts.length) item.append(ports);
      item.addEventListener("click", () => {
        if (drag?.moved) return;
        if (completePendingConnection(node.id)) return;
        select(node.id);
      });
      item.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (completePendingConnection(node.id)) return;
          select(node.id);
        }
      });
      item.addEventListener("pointerdown", startDrag);
      ctx.nodeLayer.appendChild(item);
    });
    requestAnimationFrame(() => drawLinks(ctx));
  }

  function newNodePosition(data, anchor, ctx) {
    const board = ctx?.board;
    const viewLeft = board?.scrollLeft || 0;
    const viewTop = board?.scrollTop || 0;
    const viewWidth = board?.clientWidth || 900;
    const viewHeight = board?.clientHeight || 620;
    let x = (anchor?.x ?? viewLeft + 40) + (anchor ? NODE_GAP_X : 0);
    let y = (anchor?.y ?? viewTop + 44) + (anchor ? 34 : 0);
    if (x + NODE_WIDTH > viewLeft + viewWidth - 24) x = viewLeft + 44;
    if (y + NODE_HEIGHT > viewTop + viewHeight - 24) y = viewTop + 44;
    const occupied = candidate => data.nodes.some(node => Math.abs(node.x - candidate.x) < NODE_WIDTH + 20 && Math.abs(node.y - candidate.y) < NODE_HEIGHT + 20);
    let candidate = { x, y };
    for (let attempt = 0; attempt < 12 && occupied(candidate); attempt += 1) {
      candidate.y += NODE_GAP_Y;
      if (candidate.y + NODE_HEIGHT > viewTop + viewHeight - 20) {
        candidate.y = viewTop + 44;
        candidate.x += NODE_GAP_X;
      }
    }
    return candidate;
  }

  function revealAddedNode(ctx, id) {
    highlightedId = id;
    requestAnimationFrame(() => {
      scrollNodeIntoView(ctx, id);
      const item = ctx?.nodeLayer?.querySelector?.(`[data-node-id="${cssEscape(id)}"]`);
      item?.focus?.({ preventScroll: true });
    });
    window.setTimeout(() => {
      if (highlightedId !== id) return;
      highlightedId = "";
      renderAllContexts(false);
    }, 1600);
  }

  function addNode(type, ctx = inlineContext) {
    if (!TYPES[type]) return false;
    if (ctx?.mapDetails) ctx.mapDetails.open = true;
    cancelPendingConnection();
    const data = graph();
    const anchor = selectedNode();
    const position = newNodePosition(data, anchor, ctx);
    api.beginHistory?.();
    const node = normalizeNode({ id: makeId(type), type, name: TYPES[type], x: position.x, y: position.y, data: defaultDataForType(type) }, data.nodes.length);
    data.nodes.push(node);
    if (anchor && supportsNext(anchor.type) && !anchor.next && !EVENT_TYPES.has(node.type)) anchor.next = node.id;
    selectedId = node.id;
    data.selectedId = node.id;
    renderAllContexts();
    revealAddedNode(ctx, node.id);
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus(`${TYPES[type]} rule added and selected.`);
    return true;
  }

  function makeAddMenu(ctx) {
    const menu = document.createElement("details");
    menu.className = "node-add-menu";
    const summary = document.createElement("summary");
    summary.textContent = "Add Rule";
    summary.setAttribute("aria-label", "Add a game rule");
    const panel = document.createElement("div");
    panel.className = "node-add-panel";
    panel.setAttribute("role", "menu");
    NODE_GROUPS.forEach(group => {
      const groupWrap = document.createElement("div");
      groupWrap.className = "node-add-group";
      const heading = document.createElement("strong");
      heading.textContent = group.label;
      const hint = document.createElement("span");
      hint.textContent = group.hint;
      groupWrap.append(heading, hint);
      group.items.forEach(itemData => {
        const item = document.createElement("button");
        item.type = "button";
        item.innerHTML = `<strong>${escape(itemData.name)}</strong><small>${escape(itemData.detail)}</small>`;
        item.setAttribute("role", "menuitem");
        item.setAttribute("aria-label", `Add ${itemData.name} rule. ${itemData.detail}`);
        item.addEventListener("click", () => {
          menu.open = false;
          addNode(itemData.type, ctx);
          ctx?.board?.focus?.();
        });
        groupWrap.appendChild(item);
      });
      panel.appendChild(groupWrap);
    });
    menu.append(summary, panel);
    return menu;
  }

  function cssEscape(value) {
    return String(value || "").replace(/"/g, "");
  }

  function scrollNodeIntoView(ctx, id) {
    const item = ctx?.nodeLayer?.querySelector?.(`[data-node-id="${cssEscape(id)}"]`);
    if (!item) return;
    item.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }

  function showNode(id) {
    highlightedId = String(id || "");
    window.setTimeout(() => { if (highlightedId === String(id || "")) { highlightedId = ""; renderAllContexts(false); } }, 1600);
    openOverlay();
    renderAllContexts(false);
    scrollNodeIntoView(overlayContext, id);
    scrollNodeIntoView(inlineContext, id);
  }

  function createTriggerForObject(option = api?.getSelectedNodeTriggerOption?.()) {
    if (!option?.id) { api.setStatus("Select or place a Play Mode object before making a touch rule."); return false; }
    api?.selectNodeTriggerObject?.(option.index);
    api.beginHistory?.();
    const data = graph();
    const sceneId = String(option.sceneId || api?.getState?.()?.playMode?.activeSceneId || "");
    let event = data.nodes.find(node => node.type === "eventTrigger" && String(node.data.trigger || "") === String(option.id) && String(node.data.sceneId || "") === sceneId);
    if (!event) {
      const baseX = 56 + Math.min(data.nodes.length, 6) * 28;
      event = normalizeNode({ id: makeId("trigger"), type: "eventTrigger", name: option.id, x: baseX, y: 180 + Math.min(data.nodes.length, 6) * 22, data: { trigger: option.id, sceneId } }, data.nodes.length);
      const action = normalizeNode({ id: makeId("message"), type: "actionMessage", name: `${option.id} Message`, x: event.x + NODE_GAP_X, y: event.y, data: { message: `${option.id} triggered.` } }, data.nodes.length + 1);
      event.next = action.id;
      data.nodes.push(event, action);
    } else {
      event.data.trigger = option.id;
      event.data.sceneId = sceneId;
    }
    selectedId = event.id;
    data.selectedId = event.id;
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    logRuntime(`Bound ${option.label || option.id}.`);
    api.setStatus(`Touch rule connected to ${option.label || option.id}.`);
    showNode(event.id);
    return true;
  }

  function createInteractionForCharacter(option = {}) {
    if (!option?.id) return false;
    const data = graph();
    const sceneId = String(option.sceneId || api?.getState?.()?.playMode?.activeSceneId || "");
    const existing = data.nodes.find(node => node.type === "eventInteract" && String(node.data.character || "any") === String(option.id) && String(node.data.sceneId || "") === sceneId);
    if (existing) {
      select(existing.id);
      showNode(existing.id);
      api.setStatus(`Opened the interaction rule for ${option.name || option.id}.`);
      return true;
    }
    api.beginHistory?.();
    const eventPosition = newNodePosition(data, null, inlineContext);
    const eventNode = normalizeNode({ id: makeId("interact"), type: "eventInteract", name: `Interact with ${String(option.name || option.id).slice(0, 28)}`, x: eventPosition.x, y: eventPosition.y, data: { character: option.id, sceneId } }, data.nodes.length);
    const dialogueNode = normalizeNode({ id: makeId("dialogue"), type: "actionDialogue", name: `Talk with ${String(option.name || option.id).slice(0, 31)}`, x: eventPosition.x + NODE_GAP_X, y: eventPosition.y, data: { line: Math.max(0, Number(option.startLine) || 0), character: option.id } }, data.nodes.length + 1);
    eventNode.next = dialogueNode.id;
    data.nodes.push(eventNode, dialogueNode);
    selectedId = data.selectedId = eventNode.id;
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus(`Interaction rule created for ${option.name || option.id}. Press Interact near that character to test it.`);
    showNode(eventNode.id);
    revealAddedNode(inlineContext, eventNode.id);
    return true;
  }

  function runSelectedNode() {
    const node = selectedNode();
    if (!node) return;
    activeIds = new Map();
    activeLinks = new Map();
    resetRuntimeState();
    setRuntimeState({ testRoot: label(node), lastTrigger: `Manual test: ${node.name || TYPES[node.type]}` });
    if (EVENT_TYPES.has(node.type)) {
      pulseNode(node.id);
      logRuntime(`Tested from ${node.name}.`);
      const nextId = node.next || "";
      setRuntimeState({ currentId: node.id, currentLabel: label(node), nextIds: nextId ? [nextId] : [] });
      pulseLink(node.id, nextId);
      executeNode(nextId, {}, new Set([node.id]));
    } else {
      logRuntime(`Tested from ${node.name}.`);
      executeNode(node.id, {}, new Set());
    }
    renderAllContexts(false);
  }

  function runSceneStart() {
    resetRuntime();
    setRuntimeState({ lastTrigger: "Manual Scene Start", testRoot: "Scene Start" });
    logRuntime("Manual Scene Start test.");
    runEvent("sceneStart", {});
    renderAllContexts(false);
  }

  function deleteNode() {
    const data = graph();
    if (data.nodes.length <= 1) return;
    const node = selectedNode();
    api.beginHistory?.();
    data.nodes = data.nodes.filter(item => item.id !== node.id);
    data.nodes.forEach(item => {
      if (item.next === node.id) item.next = "";
      if (item.alt === node.id) item.alt = "";
    });
    selectedId = data.nodes[0]?.id || "";
    data.selectedId = selectedId;
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus("Rule deleted.");
  }

  function resetGraph() {
    api.beginHistory?.();
    const data = defaultGraph();
    api.getState().playMode.nodeEditor = data;
    selectedId = data.selectedId;
    lastEntered = new Set();
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus("Rule map reset.");
  }

  function clearConnection() {
    const node = selectedNode();
    if (!node) return;
    api.beginHistory?.();
    node.next = "";
    node.alt = "";
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus("Rule connections cleared.");
  }

  function startDrag(event) {
    if (event.target.closest(".node-editor-port")) return;
    const node = graph().nodes.find(item => item.id === event.currentTarget.dataset.nodeId);
    if (!node) return;
    if (pendingConnection && node.id !== pendingConnection.sourceId) {
      event.preventDefault();
      event.stopPropagation();
      completePendingConnection(node.id);
      return;
    }
    event.preventDefault();
    const ctx = contextFromElement(event.currentTarget);
    selectedId = node.id;
    graph().selectedId = node.id;
    drag = { node, ctx, element: event.currentTarget, startX: event.clientX, startY: event.clientY, nodeX: node.x, nodeY: node.y, moved: false };
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (err) {}
    event.currentTarget.classList.add("dragging");
    ctx?.board?.classList.add("node-editor-board-live", "dragging-node");
    setBoardMotion(ctx, 0, 0);
    document.addEventListener("pointermove", moveDrag, true);
    document.addEventListener("pointerup", endDrag, true);
    renderInspector(ctx);
  }

  function moveDrag(event) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 2 && !drag.moved) { api.beginHistory?.(); drag.moved = true; }
    drag.node.x = number(drag.nodeX + dx, drag.nodeX, 0, 2200);
    drag.node.y = number(drag.nodeY + dy, drag.nodeY, 0, 1400);
    drag.element.style.left = `${Math.round(drag.node.x)}px`;
    drag.element.style.top = `${Math.round(drag.node.y)}px`;
    drag.element.style.setProperty("--node-tilt", `${clamp(dx / 22, -7, 7)}deg`);
    drag.element.style.setProperty("--node-lift-x", `${clamp(dx / 40 - 6, -9, -2)}px`);
    drag.element.style.setProperty("--node-lift-y", `${clamp(dy / 40 - 6, -9, -2)}px`);
    setBoardMotion(drag.ctx, dx, dy);
    drawLinks(drag.ctx);
  }

  function endDrag() {
    if (!drag) return;
    const element = drag.element;
    const ctx = drag.ctx;
    const nodeId = drag.node.id;
    element.classList.remove("dragging");
    element.style.removeProperty("--node-tilt");
    element.style.removeProperty("--node-lift-x");
    element.style.removeProperty("--node-lift-y");
    ctx?.board?.classList.remove("node-editor-board-live", "dragging-node");
    clearBoardMotion(ctx);
    document.removeEventListener("pointermove", moveDrag, true);
    document.removeEventListener("pointerup", endDrag, true);
    const moved = drag.moved;
    settlingId = moved ? nodeId : "";
    drag = null;
    renderAllContexts();
    if (moved) api.commitHistory?.();
    if (moved) window.setTimeout(() => { if (settlingId === nodeId) { settlingId = ""; renderAllContexts(false); } }, 420);
    api.saveLocal();
    if (moved) api.setStatus("Rule moved.");
  }

  function renderMapTools(ctx) {
    if (!ctx?.mapTools) return;
    ctx.mapTools.innerHTML = "";
    const addMenu = makeAddMenu(ctx);
    addMenu.classList.add("node-add-menu-map");
    const remove = button("Delete Rule", "delete the selected game rule", deleteNode);
    remove.classList.add("node-editor-delete-rule");
    const unavailable = graph().nodes.length <= 1 || !selectedNode();
    remove.disabled = unavailable;
    if (unavailable) remove.setAttribute("aria-describedby", `${ctx.key}-delete-rule-help`);
    const help = document.createElement("span");
    help.id = `${ctx.key}-delete-rule-help`;
    help.className = "sr-only";
    help.textContent = unavailable ? "At least one rule must remain on the map." : "Deletes the selected rule and removes connections to it.";
    ctx.mapTools.append(addMenu, remove, help);
  }

  function makeActions(ctx) {
    if (!ctx?.actions || ctx.actions.dataset.ready) return;
    ctx.actions.dataset.ready = "true";
    const historyControls = [
      button("Undo", "undo the last Play Mode authoring edit", () => api.undoPlay?.()),
      button("Redo", "redo the last undone Play Mode authoring edit", () => api.redoPlay?.())
    ];
    const testControls = [
      button("Test Rule", "test from the selected rule in the game preview", runSelectedNode),
      button("Test Scene Start", "run every matching When Scene Starts rule without starting movement", runSceneStart)
    ];
    const mapControls = [
      button("Auto Arrange", "arrange the rule map without changing its rules or connections", wrangleGraph),
      button("Clear Connections", "clear the Then and Else connections from the selected rule", clearConnection)
    ];
    const more = document.createElement("details");
    more.className = "node-editor-action-more";
    const summary = document.createElement("summary");
    summary.textContent = "More";
    summary.setAttribute("aria-label", "Show more rule tools");
    const panel = document.createElement("div");
    panel.className = "node-editor-action-more-panel";
    panel.append(button("Reset Lessons", "reset the rule map to the first sequence lesson", resetGraph));
    more.append(summary, panel);
    ctx.actions.setAttribute("aria-label", "Rule testing and map tools");
    ctx.actions.append(
      actionGroup("History", historyControls),
      actionGroup("Try It", testControls),
      actionGroup("Organize", mapControls),
      more
    );
  }

  function renderLauncher(ctx) {
    if (!ctx?.root) return;
    const summary = getSummary();
    const ready = summary.startCount > 0 && summary.issueCount === 0;
    const status = ctx.root.querySelector("[data-node-editor-launch-status]");
    const ruleCount = ctx.root.querySelector("[data-node-editor-rule-count]");
    const startCount = ctx.root.querySelector("[data-node-editor-start-count]");
    const issueCount = ctx.root.querySelector("[data-node-editor-issue-count]");
    if (status) {
      status.textContent = ready ? "Ready" : summary.nodeCount ? "Needs review" : "Not started";
      status.dataset.state = ready ? "ready" : summary.nodeCount ? "check" : "todo";
    }
    if (ruleCount) ruleCount.textContent = String(summary.nodeCount);
    if (startCount) startCount.textContent = String(summary.startCount);
    if (issueCount) issueCount.textContent = String(summary.issueCount);
    ctx.root.setAttribute("aria-label", `Game Rules. ${summary.nodeCount} rules, ${summary.startCount} start rules, ${summary.issueCount} checks.`);
  }

  function renderContext(ctx) {
    if (!ctx) return;
    if (ctx.launcher) {
      renderLauncher(ctx);
      return;
    }
    if (!ctx.board.dataset.connectionReady) {
      ctx.board.dataset.connectionReady = "true";
      ctx.board.addEventListener("click", event => {
        if (!pendingConnection || pendingConnection.contextKey !== ctx.key) return;
        if (event.target === ctx.board || event.target === ctx.nodeLayer) cancelPendingConnection("Connection cancelled.");
      });
    }
    const pendingHere = pendingConnection?.contextKey === ctx.key;
    ctx.board.classList.toggle("connecting", pendingHere);
    if (pendingHere) ctx.board.setAttribute("aria-label", `Connecting ${portTitle(pendingConnection.port, graph().nodes.find(node => node.id === pendingConnection.sourceId)?.type)}. Click another rule or press Escape to cancel.`);
    makeActions(ctx);
    renderMapTools(ctx);
    renderOutline(ctx);
    renderLessons(ctx);
    renderBindings(ctx);
    renderRuntime(ctx);
    renderCheck(ctx);
    renderNodes(ctx);
    renderInspector(ctx);
  }

  function renderAllContexts(save = true) {
    renderContext(inlineContext);
    if (overlayOpen) renderContext(overlayContext);
    if (save) api?.saveLocal?.();
    window.PixelBugPlayGuide?.render?.();
  }

  function buildInline() {
    const toolbar = document.querySelector(".play-stage-rail .play-toolbar");
    if (!toolbar) return null;
    let card = document.getElementById("node-editor-card");
    if (!card) {
      card = document.createElement("section");
      card.id = "node-editor-card";
      card.className = "play-toolbar-group node-editor-card node-editor-launcher-card node-editor-rail-card";
      card.innerHTML = `<div class="node-editor-launcher-head"><div><span class="play-mode-eyebrow">Rules Workspace</span><strong>Game Rules</strong></div><span class="node-editor-launch-status" data-node-editor-launch-status data-state="todo">Not started</span></div><p class="control-hint" id="node-editor-help">Manage rule triggers, conditions, actions, and connections.</p><div class="node-editor-launcher-stats" aria-live="polite"><div><strong data-node-editor-rule-count>0</strong><span>Rules</span></div><div><strong data-node-editor-start-count>0</strong><span>Starts</span></div><div><strong data-node-editor-issue-count>0</strong><span>Checks</span></div></div><button type="button" class="node-editor-large-open node-editor-launch-button" aria-describedby="node-editor-large-open-help">Open Rule Editor <span aria-hidden="true">→</span></button><span class="sr-only" id="node-editor-large-open-help">Open the full game rule workspace with the rule outline, visual node map, examples, testing tools, and rule checks.</span>`;
      toolbar.append(card);
    }
    const largeButton = card.querySelector(".node-editor-large-open");
    if (largeButton && !largeButton.dataset.ready) {
      largeButton.dataset.ready = "true";
      largeButton.addEventListener("click", openOverlay);
    }
    return {
      key: "launcher",
      launcher: true,
      root: card
    };
  }

  function buildOverlay() {
    let overlay = document.getElementById("node-editor-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "node-editor-overlay";
      overlay.className = "modal-overlay";
      overlay.hidden = true;
      overlay.innerHTML = `<div class="modal-card node-editor-large" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="node-editor-large-title" aria-describedby="node-editor-large-help"><div class="modal-head"><div><span class="play-mode-eyebrow">Play Mode</span><h2 id="node-editor-large-title">Game Rules</h2></div><button type="button" class="node-editor-close" aria-label="Close large rule editor">Close<span class="sr-only"> rule editor</span></button></div><p class="control-hint" id="node-editor-large-help">Create and connect rules. The outline and map show the same rule data.</p><div class="node-editor-outline" aria-label="Plain language rule outline"></div><details class="node-editor-support"><summary>Examples and Connections</summary><div class="node-editor-lessons" aria-label="Game rule examples"></div><div class="node-editor-bindings" aria-label="Scene object touch rules"></div></details><div class="button-row action-row play-actions node-editor-actions"></div><details class="node-editor-map-details"><summary>Visual Rule Map</summary><div class="node-editor-workspace"><div class="node-editor-map-column"><div class="node-editor-map-head"><div class="node-editor-map-copy"><strong>Rule Map</strong><span id="node-editor-large-connect-help">Click Connect, then choose the rule that runs next. Decisions can use both Then and Else. Waveform markers show the exact branches that lead to audio.</span></div><div class="node-editor-map-controls"><div class="node-editor-map-tools" aria-label="Add and delete rules"></div><div class="node-editor-route-key" aria-label="Connection colors. Audio Path overlays a Next or Else branch that eventually reaches Play Sound or Stop Audio."><span class="route-next">Next / Then</span><span class="route-alt">Else</span><span class="route-audio" title="Overlay on a Next or Else branch that leads to Play Sound or Stop Audio">Audio Path</span></div></div></div><div class="node-editor-board node-editor-large-board" role="application" tabindex="0" aria-label="Large visual game rule map" aria-describedby="node-editor-large-help node-editor-large-connect-help"><div class="node-editor-nodes"></div></div></div><div class="node-editor-inspector" aria-label="Large selected game rule editor"></div></div></details><div class="node-editor-feedback-grid"><div class="node-editor-runtime" aria-live="polite"></div><div class="node-editor-check" aria-live="polite"></div></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector(".node-editor-close")?.addEventListener("click", closeOverlay);
      overlay.addEventListener("click", event => { if (event.target === overlay) closeOverlay(); });
    }
    return {
      key: "large",
      root: overlay,
      board: overlay.querySelector(".node-editor-board"),
      nodeLayer: overlay.querySelector(".node-editor-nodes"),
      inspector: overlay.querySelector(".node-editor-inspector"),
      actions: overlay.querySelector(".node-editor-actions"),
      runtime: overlay.querySelector(".node-editor-runtime"),
      check: overlay.querySelector(".node-editor-check"),
      bindings: overlay.querySelector(".node-editor-bindings"),
      lessons: overlay.querySelector(".node-editor-lessons"),
      outline: overlay.querySelector(".node-editor-outline"),
      mapDetails: overlay.querySelector(".node-editor-map-details"),
      mapTools: overlay.querySelector(".node-editor-map-tools")
    };
  }

  function openOverlay() {
    if (!overlayOpen) {
      const active = document.activeElement;
      overlayReturnFocus = active instanceof HTMLElement && active !== document.body && active !== document.documentElement ? active : null;
    }
    overlayContext = buildOverlay();
    overlayOpen = true;
    overlayContext.root.hidden = false;
    if (overlayContext.mapDetails) overlayContext.mapDetails.open = true;
    renderContext(overlayContext);
    overlayContext.root.querySelector("[role=dialog]")?.focus?.({ preventScroll: true });
  }

  function closeOverlay() {
    if (!overlayContext?.root) return;
    overlayOpen = false;
    overlayContext.root.hidden = true;
    renderContext(inlineContext);
    const target = overlayReturnFocus?.isConnected ? overlayReturnFocus : inlineContext?.root?.querySelector?.(".node-editor-large-open");
    overlayReturnFocus = null;
    target?.focus?.({ preventScroll: true });
  }

  function compareNumbers(left, operator, right) {
    if (operator === "=") return left === right;
    if (operator === "!=") return left !== right;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }

  function executeNode(id, payload = {}, seen = new Set()) {
    const data = graph();
    const node = data.nodes.find(item => item.id === id);
    if (!node || seen.has(id) || seen.size > 40) return;
    seen.add(id);
    pulseNode(id);
    logRuntime(`Ran ${TYPES[node.type] || "Node"}: ${node.name || id}.`);
    let nextId = node.next;
    let nextDelay = 0;
    const actions = [...(runtimeState.actions || [])];
    function addAction(copy) {
      actions.unshift(copy);
      actions.splice(6);
    }
    if (node.type === "actionMessage") {
      const textEventMessage = Number(node.data.textLine) >= 0 ? api.getTextEventMessage?.(Number(node.data.textLine)) : "";
      api.showPlayMessage?.(textEventMessage || node.data.message || node.name || "Message");
      addAction(`Showed text from ${node.name}.`);
      if (nextId) nextDelay = MESSAGE_STEP_DELAY;
    }
    if (node.type === "actionFinish") {
      api.finishPlayMode?.(node.data.message || "Finished.");
      addAction(`Finished the game at ${node.name}.`);
      nextId = "";
    }
    if (node.type === "actionDialogue") {
      const dialogueNext = nextId;
      nextId = "";
      api.startPlayDialogue?.(Math.max(0, Number(node.data.line) || 0), () => {
        if (!dialogueNext) return;
        pulseLink(node.id, dialogueNext);
        executeNode(dialogueNext, payload, seen);
      });
      addAction(`Started dialogue at ${textEventLabel(node.data.line)}.`);
      setRuntimeState({ currentId: node.id, currentLabel: label(node), actions, nextIds: dialogueNext ? [dialogueNext] : [] });
      return;
    }
    if (node.type === "actionCheckpoint") {
      api.setPlayCheckpoint?.();
      addAction(`Saved checkpoint at ${node.name}.`);
    }
    if (node.type === "actionMoveActor") {
      api.movePlayActor?.(Number(node.data.dx) || 0, Number(node.data.dy) || 0);
      addAction(`Moved actor by ${Number(node.data.dx) || 0}, ${Number(node.data.dy) || 0}.`);
    }
    if (node.type === "actionSetVariable") {
      data.runtime.variables[node.data.variable] = String(node.data.value ?? "true");
      syncRuntimeVariables(data);
      api.drawPlayScene?.();
      addAction(`Set ${node.data.variable} to ${node.data.value}.`);
    }
    if (node.type === "actionChangeNumber") {
      const current = Number(data.runtime.variables[node.data.variable]) || 0;
      const changed = current + (Number(node.data.amount) || 0);
      data.runtime.variables[node.data.variable] = String(changed);
      syncRuntimeVariables(data);
      addAction(`Changed ${node.data.variable} from ${current} to ${changed}.`);
    }
    if (node.type === "actionAddItem") {
      if (!data.runtime.inventory.includes(node.data.item)) data.runtime.inventory.push(node.data.item);
      syncRuntimeInventory(data);
      addAction(`Added ${node.data.item} to inventory.`);
    }
    if (node.type === "actionRemoveItem") {
      data.runtime.inventory = data.runtime.inventory.filter(item => item !== node.data.item);
      syncRuntimeInventory(data);
      addAction(`Removed ${node.data.item} from inventory.`);
    }
    if (node.type === "actionScene") {
      const changed = api.switchPlayScene?.(node.data.sceneId);
      addAction(changed ? `Changed scene to ${sceneLabel(node.data.sceneId)}.` : "Scene did not change.");
      nextId = "";
    }
    if (node.type === "actionPlaySound") {
      const played = api.playGameAudio?.(node.data.audioAssetId, { volume: node.data.audioVolume, loop: node.data.audioLoop });
      addAction(played ? `Played ${audioLabel(node.data.audioAssetId)}.` : "Audio clip could not be played.");
    }
    if (node.type === "actionStopSound") {
      api.stopGameAudio?.(node.data.audioStopScope);
      addAction(`Stopped ${node.data.audioStopScope === "music" ? "music" : node.data.audioStopScope === "sfx" ? "sound effects" : "all audio"}.`);
    }
    if (node.type === "logicVariable") {
      const matched = String(data.runtime.variables[node.data.variable] ?? "") === String(node.data.equals);
      nextId = matched ? node.next : node.alt;
      addAction(`Checked ${node.data.variable}: ${matched ? "true" : "false"}.`);
    }
    if (node.type === "logicCompareNumber") {
      const current = Number(data.runtime.variables[node.data.variable]) || 0;
      const matched = compareNumbers(current, node.data.operator, Number(node.data.compare) || 0);
      nextId = matched ? node.next : node.alt;
      addAction(`Compared ${current} ${node.data.operator || ">="} ${Number(node.data.compare) || 0}: ${matched ? "true" : "false"}.`);
    }
    if (node.type === "logicHasItem") {
      const matched = data.runtime.inventory.includes(node.data.item);
      nextId = matched ? node.next : node.alt;
      addAction(`Checked inventory for ${node.data.item}: ${matched ? "found" : "not found"}.`);
    }
    const nextIds = nextId ? [nextId] : [];
    setRuntimeState({ currentId: node.id, currentLabel: label(node), actions, nextIds });
    if (nextId) {
      pulseLink(node.id, nextId);
      window.setTimeout(() => executeNode(nextId, payload, seen), nextDelay);
    }
  }

  function runEvent(type, payload = {}) {
    if (type === "sceneStart") lastEntered.clear();
    const nodes = graph().nodes.filter(node => {
      if (type === "sceneStart") return node.type === "eventStart" && (!node.data.sceneId || String(node.data.sceneId) === String(payload.sceneId || ""));
      if (type === "triggerEnter") {
        const choices = new Set(["any", payload.name, payload.id, ...(Array.isArray(payload.ids) ? payload.ids : [])].map(item => String(item || "")));
        return node.type === "eventTrigger" && (!node.data.sceneId || String(node.data.sceneId) === String(payload.sceneId || api?.getState?.()?.playMode?.activeSceneId || "")) && choices.has(String(node.data.trigger || "any"));
      }
      if (type === "characterInteract") {
        const choices = new Set(["any", payload.name, payload.id].map(item => String(item || "")));
        return node.type === "eventInteract" && (!node.data.sceneId || String(node.data.sceneId) === String(payload.sceneId || api?.getState?.()?.playMode?.activeSceneId || "")) && choices.has(String(node.data.character || "any"));
      }
      return false;
    });
    if (nodes.length) {
      const message = type === "triggerEnter" ? `Player touched ${payload?.name || "an object"}.` : type === "characterInteract" ? `Player interacted with ${payload?.name || "a character"}.` : "Scene start rules began.";
      logRuntime(message);
      setRuntimeState({ lastTrigger: message.replace(/\.$/, "") });
    }
    nodes.forEach(node => {
      const nextId = node.next || "";
      pulseNode(node.id);
      pulseLink(node.id, nextId);
      setRuntimeState({ currentId: node.id, currentLabel: label(node), nextIds: nextId ? [nextId] : [] });
      executeNode(nextId, payload, new Set([node.id]));
    });
    return nodes.length;
  }

  function rectsOverlap(a, b) {
    return a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function expandRect(rect, pad = 6) {
    return rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : rect;
  }

  function syncPlayMode() {
    const runtime = api?.getPlayRuntime?.();
    if (!runtime?.running) return;
    const entered = new Set();
    const fired = new Set();
    const actorTouch = expandRect(runtime.actor, 8);
    (runtime.props || []).forEach(prop => {
      if (!rectsOverlap(actorTouch, prop.rect)) return;
      const triggerId = prop.prop?.nodeTriggerId || `prop-${prop.index + 1}`;
      const ids = [triggerId, `prop-${prop.index + 1}`, `prop-${prop.index}`, "any"];
      ids.forEach(id => entered.add(id));
      if (!lastEntered.has(triggerId) && !fired.has(triggerId)) {
        fired.add(triggerId);
        runEvent("triggerEnter", { id: triggerId, name: triggerId, ids, prop });
      }
    });
    lastEntered = entered;
  }

  function createTextEventNode(option = {}) {
    const data = graph();
    const index = Math.max(0, Number(option.index) || 0);
    const kind = option.kind === "dialogue" ? "dialogue" : "message";
    const type = kind === "dialogue" ? "actionDialogue" : "actionMessage";
    const anchor = selectedNode();
    api.beginHistory?.();
    const node = normalizeNode({
      id: makeId(kind === "dialogue" ? "dialogue" : "message"),
      type,
      name: kind === "dialogue" ? `Start ${option.speaker || "Dialogue"}` : `Message ${Number(index) + 1}`,
      x: (anchor?.x ?? 56) + NODE_GAP_X,
      y: (anchor?.y ?? 88) + 24,
      data: kind === "dialogue" ? { line: index } : { textLine: index, message: option.text || "Message shown." }
    }, data.nodes.length);
    data.nodes.push(node);
    if (anchor && supportsNext(anchor.type) && !anchor.next && !EVENT_TYPES.has(node.type)) anchor.next = node.id;
    selectedId = node.id;
    data.selectedId = node.id;
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus(`${kind === "dialogue" ? "Dialogue" : "Message"} rule created from Text Events.`);
    showNode(node.id);
    return true;
  }

  function createAudioAssignment(option = {}) {
    const data = graph();
    if (data.nodes.length > 98) { api.setStatus("The rule map is full."); return false; }
    const eventKind = ["sceneStart", "objectTouch", "characterInteract"].includes(option.eventType) ? option.eventType : "sceneStart";
    const eventType = eventKind === "objectTouch" ? "eventTrigger" : eventKind === "characterInteract" ? "eventInteract" : "eventStart";
    const target = text(option.target || "").slice(0, eventType === "eventInteract" ? 80 : 48);
    if (!target) { api.setStatus("Choose where this sound should play."); return false; }
    const audioAssetId = text(option.audioAssetId || "").slice(0, 48);
    if (!audioAssetId) { api.setStatus("Choose an Audio Studio clip."); return false; }
    api.beginHistory?.();
    const targetLabel = text(option.targetLabel || target).slice(0, 40) || target;
    const clipLabel = text(option.audioLabel || "Sound").slice(0, 40) || "Sound";
    const row = data.nodes.filter(node => EVENT_TYPES.has(node.type)).length;
    const x = 56 + Math.floor(row / 7) * 42;
    const y = 120 + row % 7 * 156;
    const activeSceneId = api?.getState?.()?.playMode?.activeSceneId || "";
    const eventData = eventType === "eventTrigger" ? { trigger: target, sceneId: activeSceneId } : eventType === "eventInteract" ? { character: target, sceneId: activeSceneId } : { sceneId: target };
    const eventName = eventType === "eventTrigger" ? `Touch ${targetLabel}` : eventType === "eventInteract" ? `Interact ${targetLabel}` : `${targetLabel} Starts`;
    const event = normalizeNode({ id: makeId("audio-event"), type: eventType, name: eventName, x, y, data: eventData }, data.nodes.length);
    const action = normalizeNode({ id: makeId("audio"), type: "actionPlaySound", name: `Play ${clipLabel}`, x: x + NODE_GAP_X, y, data: { audioAssetId, audioVolume: number(option.volume, 1, 0, 1), audioLoop: option.loop === true } }, data.nodes.length + 1);
    event.next = action.id;
    data.nodes.push(event, action);
    selectedId = action.id;
    data.selectedId = action.id;
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus(`${clipLabel} assigned to ${targetLabel}.`);
    showNode(action.id);
    return true;
  }

  function getAudioAssignments() {
    const data = graph();
    return data.nodes.filter(node => EVENT_TYPES.has(node.type)).map(event => {
      const action = data.nodes.find(node => node.id === event.next && node.type === "actionPlaySound");
      if (!action) return null;
      const target = event.type === "eventTrigger" ? event.data.trigger : event.type === "eventInteract" ? event.data.character : event.data.sceneId;
      return { id: event.id, eventType: event.type, target, eventName: event.name, actionId: action.id, audioAssetId: action.data.audioAssetId, volume: action.data.audioVolume, loop: action.data.audioLoop };
    }).filter(Boolean);
  }

  function attachTextEventToSelectedNode(option = {}) {
    const node = selectedNode();
    if (!node) return createTextEventNode({ ...option, kind: "message" });
    const index = Math.max(0, Number(option.index) || 0);
    api.beginHistory?.();
    if (node.type === "actionDialogue") {
      node.data.line = index;
    } else if (node.type === "actionMessage") {
      node.data.textLine = index;
      node.data.message = String(option.text || node.data.message || "Message shown.").slice(0, 180);
    } else {
      api.rollbackHistory?.();
      return createTextEventNode({ ...option, kind: "message" });
    }
    renderAllContexts();
    api.commitHistory?.();
    api.saveLocal();
    api.setStatus("Text Event added to the selected rule.");
    showNode(node.id);
    return true;
  }

  function getRuntimeState() {
    return { ...runtimeState, actions: [...(runtimeState.actions || [])], nextIds: [...(runtimeState.nextIds || [])] };
  }

  function resetRuntime() {
    lastEntered = new Set();
    runtimeLog = [];
    activeIds = new Map();
    activeLinks = new Map();
    resetRuntimeState();
    const data = graph();
    data.runtime = data.runtime && typeof data.runtime === "object" ? data.runtime : {};
    data.runtime.variables = { ...(api.getState?.()?.playMode?.variables || {}) };
    data.runtime.inventory = [...(api.getState?.()?.playMode?.inventory || [])];
    data.runtime.checkpoint = null;
    renderAllContexts(false);
  }

  function render() {
    if (!api) return;
    inlineContext = buildInline();
    if (overlayOpen) overlayContext = buildOverlay();
    graph();
    renderAllContexts(false);
  }

  function mount(nextApi) {
    api = nextApi;
    if (!keyboardReady) {
      keyboardReady = true;
      document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;
        const wasConnecting = Boolean(connection || pendingConnection);
        if (connection) {
          clearConnectionVisuals(connection.ctx, connection.sourceElement);
          document.removeEventListener("pointermove", moveConnection, true);
          document.removeEventListener("pointerup", endConnection, true);
          const ctx = connection.ctx;
          connection = null;
          drawLinks(ctx);
          api.setStatus("Connection cancelled.");
        }
        cancelPendingConnection("Connection cancelled.");
        if (overlayOpen && !wasConnecting) closeOverlay();
      });
    }
    try { render(); }
    catch (err) { console.error(err); }
  }

  window.PixelBugNodeEditor = { mount, render, runEvent, syncPlayMode, resetRuntime, resetEntered: () => lastEntered.clear(), createTriggerForObject, createInteractionForCharacter, createTextEventNode, attachTextEventToSelectedNode, createAudioAssignment, getAudioAssignments, openOverlay, getSummary, getRuntimeState };
  if (window.PixelBugAppApi) mount(window.PixelBugAppApi);
})();
