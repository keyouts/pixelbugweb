(() => {
  const $ = selector => document.querySelector(selector);
  const timeline = $("#voxel-mode-timeline");
  const dopesheet = $("#voxel-animation-dopesheet");
  if (!timeline || !dopesheet) return;

  let renderFrame = 0;
  let stateFrame = 0;

  function scheduleRender() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(() => {
      renderFrame = 0;
      renderDopeSheet();
    });
  }

  function scheduleStateSync() {
    if (stateFrame) cancelAnimationFrame(stateFrame);
    stateFrame = requestAnimationFrame(() => {
      stateFrame = 0;
      syncDopeSheetStates();
    });
  }

  function frameFacts(button) {
    const label = button.getAttribute("aria-label") || "";
    const cubeMatch = label.match(/,\s*(\d+) cubes?/i);
    const timeMatch = label.match(/Frame\s+(\d+),\s*(\d+) milliseconds/i);
    return {
      index: Math.max(0, Number(button.dataset.frameIndex) || 0),
      cubes: Math.max(0, Number(cubeMatch?.[1]) || 0),
      duration: Math.max(0, Number(timeMatch?.[2]) || 0),
      posed: /posed bone/i.test(label),
      selected: button.getAttribute("aria-selected") === "true",
      preview: button.classList.contains("is-preview")
    };
  }

  function renderDopeSheet() {
    const frames = [...timeline.querySelectorAll(".voxel-animation-frame")];
    dopesheet.replaceChildren();
    if (!frames.length) {
      const empty = document.createElement("div");
      empty.className = "voxel-dopesheet-empty";
      empty.textContent = "No keyframes yet.";
      dopesheet.appendChild(empty);
      return;
    }
    frames.forEach(source => {
      const facts = frameFacts(source);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `voxel-dopesheet-frame${facts.selected ? " is-selected" : ""}${facts.preview ? " is-preview" : ""}`;
      button.dataset.frameIndex = String(facts.index);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `Frame ${facts.index + 1}. ${facts.cubes ? "Voxel geometry key." : "No voxel geometry."} ${facts.posed ? "Pose key." : "Rest pose."} ${facts.duration} milliseconds.`);
      button.innerHTML = `<span class="voxel-dopesheet-number">${facts.index + 1}</span><span class="voxel-dopesheet-key ${facts.cubes ? "has-key" : ""}" aria-hidden="true"></span><span class="voxel-dopesheet-key pose ${facts.posed ? "has-key" : ""}" aria-hidden="true"></span><span class="voxel-dopesheet-time">${facts.duration}</span>`;
      button.addEventListener("click", () => source.click());
      dopesheet.appendChild(button);
    });
  }

  function syncDopeSheetStates() {
    const sources = [...timeline.querySelectorAll(".voxel-animation-frame")];
    sources.forEach(source => {
      const target = dopesheet.querySelector(`[data-frame-index="${source.dataset.frameIndex}"]`);
      if (!target) return;
      target.classList.toggle("is-selected", source.getAttribute("aria-selected") === "true");
      target.classList.toggle("is-preview", source.classList.contains("is-preview"));
    });
  }

  const timelineObserver = new MutationObserver(records => {
    if (records.some(record => record.type === "childList" || record.attributeName === "aria-label")) scheduleRender();
    else scheduleStateSync();
  });
  timelineObserver.observe(timeline, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected", "aria-label", "class"] });
  document.addEventListener("pixelbug:voxel-workspace-opened", event => { if (event.detail?.name === "animation") scheduleRender(); });
  renderDopeSheet();
})();
