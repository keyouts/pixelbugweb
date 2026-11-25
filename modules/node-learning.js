"use strict";

// Learning examples
(function attachNodeLearning(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugNodeLearning = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function describe(node = {}) {
    const d = node.data || {};
    const variable = JSON.stringify(String(d.variable || "score"));
    const value = JSON.stringify(String(d.value || "true"));
    const equals = JSON.stringify(String(d.equals || "true"));
    const item = JSON.stringify(String(d.item || "key"));
    const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const snippet = (code, label, explanation) => ({ code, label, explanation });
    if (node.type === "eventStart") return snippet('onSceneStart(() => {\n  runNextRule();\n});', "Events", "An event starts a chain of instructions. The following connected rule runs next.");
    if (node.type === "eventTrigger") return snippet('onPlayerTouch(() => {\n  runNextRule();\n});', "Event listeners", "An event listener waits for something to happen. This one responds to an object touch.");
    if (node.type === "eventInteract") return snippet('onInteract(() => {\n  runNextRule();\n});', "Player input", "An interaction event responds when the player uses the Interact control near a target.");
    if (node.type === "actionSetVariable") return snippet(`variables[${variable}] = ${value};`, "Assignment", "A variable is a named box of information. This instruction replaces its contents.");
    if (node.type === "actionChangeNumber") return snippet(`variables[${variable}] = Number(variables[${variable}] || 0) + ${n(d.amount)};`, "Addition", "Updating a number adds to its previous value. Negative values count downward.");
    if (node.type === "actionRollNumber") {
      const minimum = Math.max(1, Math.round(n(d.rollMin, 1)));
      const maximum = Math.max(1, Math.round(n(d.rollMax, 6)));
      const low = Math.min(minimum, maximum), high = Math.max(minimum, maximum);
      return snippet(`variables[${variable}] = Math.floor(Math.random() * ${high - low + 1}) + ${low};`, "Random numbers + probability", `This chooses one whole number between ${low} and ${high}, including both ends. Each of the ${high - low + 1} outcomes is equally likely. The real game also clamps its allowed range.`);
    }
    if (node.type === "actionMathNumber") {
      const op = ["set", "add", "subtract", "multiply", "divide", "modulo"].includes(d.mathOperation) ? d.mathOperation : "multiply";
      const symbol = { set: "", add: "+", subtract: "-", multiply: "*", divide: "/", modulo: "%" }[op];
      const valueText = n(d.operand, 2);
      const expression = op === "set" ? `${valueText}` : `Number(variables[${variable}] || 0) ${symbol} ${valueText}`;
      const division = ["divide", "modulo"].includes(op);
      const code = division ? `if (${valueText} !== 0) {\n  variables[${variable}] = ${expression};\n}` : `variables[${variable}] = ${expression};`;
      return snippet(code, "Arithmetic operators", "Choose an operation to change a saved number. The game keeps the result finite, rounds to four decimal places, and limits extreme values.");
    }
    if (node.type === "logicVariable") return snippet(`if (variables[${variable}] === ${equals}) {\n  runThen();\n} else {\n  runElse();\n}`, "Conditionals", "An if/else statement chooses between two routes. Only one branch runs.");
    if (node.type === "logicCompareNumber") {
      const op = ({ "=": "===", "!=": "!==", "<": "<", "<=": "<=", ">": ">", ">=": ">=" })[d.operator] || ">=";
      return snippet(`if (Number(variables[${variable}] || 0) ${op} ${n(d.compare)}) {\n  runThen();\n} else {\n  runElse();\n}`, "Comparisons", "A comparison produces true or false. The Then path runs for true; Else runs for false.");
    }
    if (node.type === "logicHasItem") return snippet(`if (inventory.includes(${item})) {\n  runThen();\n} else {\n  runElse();\n}`, "Membership", "Checking whether an item is in a list is a common way to model inventory.");
    if (node.type === "actionAddItem") return snippet(`inventory.add(${item});`, "Sets", "An inventory behaves like a set: giving the same item twice doesn't create duplicates.");
    if (node.type === "actionRemoveItem") return snippet(`inventory.delete(${item});`, "Sets", "Removing an item changes the player's saved inventory.");
    if (node.type === "actionMoveActor") return snippet(`player.x += ${n(d.dx)};\nplayer.y += ${n(d.dy)};`, "Coordinates", "Two numbers describe a point on the screen: x is horizontal, y is vertical.");
    if (node.type === "actionMessage") return snippet(`showText(${JSON.stringify(String(d.message || "Message"))});`, "Output", "Game actions can display information without changing variables.");
    if (node.type === "actionDialogue") return snippet(`startDialogue(${n(d.line)});`, "Sequences", "A dialogue follows saved lines in an order.");
    if (node.type === "actionPlaySound") return snippet(`playSound(${JSON.stringify(String(d.audioAssetId || "clip"))});`, "Functions", "A function performs an action. Play Sound calls an audio action at this point in the rule chain.");
    if (node.type === "actionStopSound") return snippet(`stopSound(${JSON.stringify(String(d.audioStopScope || "all"))});`, "Functions", "The game can stop ongoing music or effects using a command.");
    if (node.type === "actionCheckpoint") return snippet(`checkpoint = { x: player.x, y: player.y };`, "Saved state", "Saving coordinates lets the game restore the player's position later.");
    if (node.type === "actionScene") return snippet(`goToScene(${JSON.stringify(String(d.sceneId || "scene"))});`, "State transitions", "Changing scenes moves the game into another state.");
    if (node.type === "actionFinish") return snippet(`finishGame(${JSON.stringify(String(d.message || "Finished."))});`, "End conditions", "An end condition stops the current chain and marks the game as finished.");
    return snippet("selectRule();", "Game rules", "Connect an event to an action to make something happen.");
  }
  function explainResult(node, before, result) {
    if (!result) return "Choose a rule to experiment with.";
    const key = String(node?.data?.variable || "score");
    if (node.type === "actionRollNumber") return `${key} = ${result.state?.variables?.[key]}. Roll Again to sample another outcome; this does not change your game.`;
    if (node.type === "logicCompareNumber") return `${key} = ${before}. Comparison is ${result.predicate?.matched ? "true → THEN" : "false → ELSE"}. No game data changed.`;
    const after = result.state?.variables?.[key];
    return `${key}: ${before} → ${after}. Practice only: your game values have not changed.`;
  }
  return { describe, explainResult };
});
