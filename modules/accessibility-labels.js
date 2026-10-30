// Access labels
(() => {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function wordsFromId(id) {
    return cleanText(String(id || "").replace(/[-_]+/g, " ").replace(/\bbtn\b/gi, "button"));
  }

  function labelFor(control) {
    if (control.id) {
      const label = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
      if (label) return cleanText(label.textContent);
    }
    const wrapping = control.closest?.("label");
    if (wrapping) return cleanText(wrapping.textContent);
    return "";
  }

  function textFor(control) {
    const explicit = cleanText(control.getAttribute("data-aria-text"));
    if (explicit) return explicit;
    const linked = labelFor(control);
    if (linked) return linked;
    const title = cleanText(control.getAttribute("title"));
    if (title) return title;
    const placeholder = cleanText(control.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    return wordsFromId(control.id) || cleanText(control.getAttribute("role")) || control.tagName.toLowerCase();
  }

  function hasName(control) {
    if (control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby") || labelFor(control)) return true;
    if (control.matches("button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [tabindex]")) {
      const text = cleanText(control.textContent);
      if (text && !["×", "+", "−", "-", "✕", "⋮", "▸", "‹", "›"].includes(text)) return true;
    }
    return false;
  }

  function labelControl(control) {
    if (!(control instanceof HTMLElement) || control.getAttribute("aria-hidden") === "true") return;
    if (control.matches("button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], input, select, textarea, canvas, [tabindex]") && !hasName(control)) {
      control.setAttribute("aria-label", textFor(control));
    }
  }

  function applyLabels(root = document) {
    root.querySelectorAll?.("button, [role='button'], input, select, textarea, canvas, [tabindex]").forEach(labelControl);
  }

  function observe() {
    applyLabels();
    new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return;
          labelControl(node);
          applyLabels(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", observe, { once: true });
  else observe();
})();
