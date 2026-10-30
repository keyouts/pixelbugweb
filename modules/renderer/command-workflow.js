(() => {
  function create(options) {
    const { escapeHtml, getActions } = options;
    const button = document.querySelector("#command-palette-btn");
    const overlay = document.querySelector("#command-palette-overlay");
    const closeButton = document.querySelector("#close-command-palette-btn");
    const input = document.querySelector("#command-palette-input");
    const results = document.querySelector("#command-palette-results");
    const status = document.querySelector("#command-palette-status");
    let activeIndex = 0;
    let returnFocus = null;

    function filteredActions() {
      const query = String(input?.value || "").trim().toLowerCase();
      const actions = getActions().filter(action => !action.enabled || action.enabled());
      if (!query) return actions;
      const terms = query.split(/\s+/).filter(Boolean);
      return actions.filter(action => terms.every(term => `${action.label} ${action.group} ${action.keywords || ""}`.toLowerCase().includes(term)));
    }

    function runAction(action) {
      close();
      action?.run?.();
    }

    function render() {
      if (!results) return;
      const actions = filteredActions();
      activeIndex = Math.max(0, Math.min(activeIndex, Math.max(0, actions.length - 1)));
      results.innerHTML = "";
      actions.forEach((action, index) => {
        const result = document.createElement("button");
        result.className = "command-result";
        result.type = "button";
        result.setAttribute("role", "option");
        result.id = `command-result-${index}`;
        result.setAttribute("aria-selected", String(index === activeIndex));
        result.innerHTML = `<span><strong>${escapeHtml(action.label)}</strong><small>${escapeHtml(action.group)}</small></span><kbd>${escapeHtml(action.shortcut || "")}</kbd>`;
        result.onclick = () => runAction(action);
        result.onmouseenter = () => { activeIndex = index; render(); };
        results.appendChild(result);
      });
      input?.setAttribute("aria-activedescendant", actions.length ? `command-result-${activeIndex}` : "");
      if (status) status.textContent = actions.length ? `${actions.length} matching command${actions.length === 1 ? "" : "s"}.` : "No matching commands.";
    }

    function open() {
      if (!overlay || !input) return;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.hidden = false;
      button?.setAttribute("aria-expanded", "true");
      input.value = "";
      activeIndex = 0;
      render();
      input.focus();
    }

    function close() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      button?.setAttribute("aria-expanded", "false");
      if (button) button.focus();
      else if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
    }

    function setup() {
      button?.addEventListener("click", open);
      closeButton?.addEventListener("click", close);
      overlay?.addEventListener("click", event => { if (event.target === overlay) close(); });
      input?.addEventListener("input", () => { activeIndex = 0; render(); });
      input?.addEventListener("keydown", event => {
        const actions = filteredActions();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          activeIndex = Math.min(actions.length - 1, activeIndex + 1);
          render();
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          activeIndex = Math.max(0, activeIndex - 1);
          render();
        }
        if (event.key === "Enter" && actions[activeIndex]) {
          event.preventDefault();
          runAction(actions[activeIndex]);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          close();
        }
      });
    }

    return Object.freeze({ close, open, render, setup });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugCommandWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
