// Play guide
(() => {
  let api = null;
  let testedSignature = "";
  let lastRunning = false;
  let ready = false;

  function hasPixels(state, frameIndex) {
    const frame = state?.frames?.[Math.max(0, Number(frameIndex) || 0)];
    return Boolean(frame?.layers?.some(layer => Array.isArray(layer?.pixels) && layer.pixels.some(row => Array.isArray(row) && row.some(Boolean))));
  }

  function buildSignature(state) {
    const playMode = state?.playMode || {};
    return JSON.stringify({
      activeSceneId: playMode.activeSceneId || "",
      idleFrame: playMode.idleFrame,
      walkFrame: playMode.walkFrame,
      jumpFrame: playMode.jumpFrame,
      props: playMode.props || [],
      inventory: playMode.inventory || [],
      nodes: playMode.nodeEditor?.nodes || []
    });
  }

  function ruleSummary(state) {
    const direct = window.PixelBugNodeEditor?.getSummary?.();
    if (direct) return direct;
    const nodes = Array.isArray(state?.playMode?.nodeEditor?.nodes) ? state.playMode.nodeEditor.nodes : [];
    const starts = nodes.filter(node => ["eventStart", "eventTrigger", "eventInteract"].includes(node?.type));
    return { nodeCount: nodes.length, startCount: starts.length, issueCount: starts.filter(node => !node.next).length };
  }

  function setStep(id, stateName, title, detail) {
    const button = document.getElementById(id);
    if (!button) return;
    button.dataset.guideState = stateName;
    button.setAttribute("aria-label", `${title}. ${detail}`);
    const status = button.querySelector("small");
    if (status) status.textContent = detail;
  }

  function render() {
    if (!api) return;
    const state = api.getState?.();
    if (!state?.playMode) return;
    const runtime = api.getPlayRuntime?.() || {};
    const signature = buildSignature(state);
    if (runtime.running && !lastRunning) testedSignature = signature;
    lastRunning = Boolean(runtime.running);
    const tested = Boolean(testedSignature) && testedSignature === signature;
    const worldReady = hasPixels(state, state.playMode.idleFrame);
    const objectCount = Array.isArray(state.playMode.props) ? state.playMode.props.length : 0;
    const rules = ruleSummary(state);
    const rulesReady = rules.startCount > 0 && rules.issueCount === 0;
    setStep("play-guide-world", worldReady ? "ready" : "todo", "World", worldReady ? "Player art ready" : "Choose player art");
    setStep("play-guide-objects", objectCount ? "ready" : "todo", "Objects", objectCount ? `${objectCount} object${objectCount === 1 ? "" : "s"} placed` : "Place an object");
    setStep("play-guide-rules", rulesReady ? "ready" : rules.nodeCount ? "check" : "todo", "Rules", rulesReady ? `${rules.startCount} start rule${rules.startCount === 1 ? "" : "s"} ready` : rules.issueCount ? `${rules.issueCount} rule check${rules.issueCount === 1 ? "" : "s"}` : "Add a start rule");
    setStep("play-guide-test", runtime.running ? "active" : tested ? "ready" : rulesReady ? "todo" : "blocked", "Test", runtime.running ? "Game running" : tested ? "Tested this session" : rulesReady ? "Press Run Game" : "Finish rules first");
    const complete = [worldReady, objectCount > 0, rulesReady, tested].filter(Boolean).length;
    const summary = document.getElementById("play-guide-summary");
    if (summary) summary.textContent = complete === 4 ? "Ready to export. Run once more after your final change." : `${complete} of 4 build steps complete.`;
  }

  function focusTarget(button) {
    const id = button?.dataset?.playGuideTarget;
    if (id === "node-editor-card" && window.PixelBugNodeEditor?.openOverlay) {
      window.PixelBugNodeEditor.openOverlay();
      return;
    }
    const target = id ? document.getElementById(id) : null;
    if (!target) return;
    const card = target.closest?.(".play-card, .play-stage-shell") || target;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    card.classList.add("play-guide-focus");
    window.setTimeout(() => card.classList.remove("play-guide-focus"), 1000);
    const focusable = card.querySelector?.("button, select, input, textarea, canvas") || (card.matches?.("button, select, input, textarea, canvas") ? card : null);
    window.setTimeout(() => focusable?.focus?.({ preventScroll: true }), 350);
  }

  function mount(nextApi) {
    api = nextApi;
    if (!ready) {
      ready = true;
      document.querySelectorAll("[data-play-guide-target]").forEach(button => button.addEventListener("click", () => focusTarget(button)));
    }
    render();
  }

  window.PixelBugPlayGuide = { mount, render };
  if (window.PixelBugAppApi) mount(window.PixelBugAppApi);
})();
