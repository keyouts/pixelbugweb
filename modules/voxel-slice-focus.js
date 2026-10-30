"use strict";

(() => {
  const button = document.querySelector("#voxel-slice-focus-btn");
  const canvas = document.querySelector("#voxel-paint-canvas");
  const previewCard = document.querySelector(".voxel-preview-card");
  const previewToolsButton = document.querySelector("#voxel-preview-tools-toggle");

  function active() {
    return document.body.classList.contains("voxel-slice-focus");
  }

  function setFocus(enabled, moveFocus = true) {
    if (!button || !canvas) return;
    const next = Boolean(enabled) && document.body.classList.contains("voxel-mode");
    document.body.classList.toggle("voxel-slice-focus", next);
    button.setAttribute("aria-pressed", String(next));
    button.textContent = next ? "Exit Focus" : "Focus Slice";
    button.setAttribute("aria-label", next ? "Exit focused slice editor" : "Focus the voxel slice editor");
    if (!moveFocus) return;
    window.requestAnimationFrame(() => (next ? canvas : button).focus({ preventScroll: true }));
  }

  function setPreviewToolsCollapsed(collapsed) {
    if (!previewCard || !previewToolsButton) return;
    const next = Boolean(collapsed);
    previewCard.classList.toggle("voxel-preview-tools-collapsed", next);
    previewToolsButton.setAttribute("aria-expanded", String(!next));
    previewToolsButton.textContent = next ? "Show Tools" : "Minimize Tools";
    previewToolsButton.setAttribute("aria-label", next ? "Show live 3D preview tools" : "Minimize live 3D preview tools");
  }

  if (button && canvas) {
    button.addEventListener("click", () => setFocus(!active()));
    window.addEventListener("keydown", event => {
      if (!active() || event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setFocus(false);
    }, true);

    new MutationObserver(() => {
      if (active() && !document.body.classList.contains("voxel-mode")) setFocus(false, false);
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  if (previewCard && previewToolsButton) {
    previewToolsButton.addEventListener("click", () => setPreviewToolsCollapsed(!previewCard.classList.contains("voxel-preview-tools-collapsed")));
  }
})();
