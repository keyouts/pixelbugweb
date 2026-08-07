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
    return "";
  }

  function textFor(control) {
    const explicit = cleanText(control.getAttribute("data-aria-text"));
    if (explicit) return explicit;
    const linked = labelFor(control);
    if (linked) return linked;
    const placeholder = cleanText(control.getAttribute("placeholder"));
    if (placeholder) return placeholder;
    const text = cleanText(control.textContent);
    if (text && text !== "×" && text !== "+" && text !== "−") return text;
    const title = cleanText(control.getAttribute("title"));
    if (title) return title;
    return wordsFromId(control.id) || cleanText(control.getAttribute("role")) || control.tagName.toLowerCase();
  }

  function hasName(control) {
    return control.hasAttribute("aria-label") || control.hasAttribute("aria-labelledby") || Boolean(labelFor(control));
  }

  function labelControl(control) {
    if (!(control instanceof HTMLElement)) return;
    if (control.matches("button, [role='button'], canvas") && !control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) control.setAttribute("aria-label", textFor(control));
    if (control.matches("input, select, textarea") && !hasName(control)) control.setAttribute("aria-label", textFor(control));
    if (control.matches("[tabindex]") && !control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) control.setAttribute("aria-label", textFor(control));
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
