(() => {
  const selectors = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const returnTargets = new WeakMap();

  function modalForOverlay(overlay) {
    return overlay?.querySelector?.('[aria-modal="true"]') || null;
  }

  function focusable(modal) {
    if (!modal?.querySelectorAll) return [];
    return [...modal.querySelectorAll(selectors)].filter(element => !element.hidden && element.getAttribute?.("aria-hidden") !== "true" && (!element.getClientRects || element.getClientRects().length > 0));
  }

  function focusModal(overlay, documentRef = document) {
    const modal = modalForOverlay(overlay);
    if (!modal) return;
    if (!modal.contains?.(documentRef.activeElement)) {
      const target = modal.querySelector?.("[autofocus]") || focusable(modal)[0] || modal;
      if (target === modal && !modal.hasAttribute?.("tabindex")) modal.setAttribute?.("tabindex", "-1");
      target.focus?.();
    }
  }

  function trapTab(event, overlay, documentRef = document) {
    if (event?.key !== "Tab") return false;
    const modal = modalForOverlay(overlay);
    if (!modal) return false;
    const items = focusable(modal);
    if (!items.length) {
      event.preventDefault?.();
      focusModal(overlay, documentRef);
      return true;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (documentRef.activeElement === first || !modal.contains?.(documentRef.activeElement))) {
      event.preventDefault?.();
      last.focus?.();
      return true;
    }
    if (!event.shiftKey && (documentRef.activeElement === last || !modal.contains?.(documentRef.activeElement))) {
      event.preventDefault?.();
      first.focus?.();
      return true;
    }
    return false;
  }

  function createController(options = {}) {
    const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
    const overlay = options.overlay;
    const trigger = options.trigger || null;
    if (!documentRef || !overlay) throw new Error("Modal controller requires a document and overlay");
    let returnTarget = null;

    function open() {
      returnTarget = documentRef.activeElement || trigger;
      returnTargets.set(overlay, returnTarget);
      overlay.hidden = false;
      trigger?.setAttribute?.("aria-expanded", "true");
      const focus = () => focusModal(overlay, documentRef);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
      else focus();
    }

    function close() {
      overlay.hidden = true;
      trigger?.setAttribute?.("aria-expanded", "false");
      const target = returnTarget?.isConnected === false ? trigger : returnTarget || trigger;
      const focus = () => target?.focus?.();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
      else focus();
    }

    function onKeydown(event) {
      if (overlay.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault?.();
        event.stopPropagation?.();
        close();
        return;
      }
      trapTab(event, overlay, documentRef);
    }

    documentRef.addEventListener?.("keydown", onKeydown);
    return Object.freeze({ close, open });
  }

  function install(documentRef = document) {
    function visibleOverlay() {
      return [...documentRef.querySelectorAll(".modal-overlay")].reverse().find(overlay => !overlay.hidden && modalForOverlay(overlay));
    }

    function handleChange(records) {
      records.forEach(record => {
        const overlay = record.target;
        if (!overlay.classList?.contains("modal-overlay")) return;
        if (!overlay.hidden) {
          if (!returnTargets.has(overlay)) returnTargets.set(overlay, documentRef.activeElement);
          const focus = () => focusModal(overlay, documentRef);
          if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
          else focus();
        } else {
          const target = returnTargets.get(overlay);
          if (target?.isConnected) {
            const focus = () => target.focus?.();
            if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
            else focus();
          }
        }
      });
    }

    documentRef.addEventListener("keydown", event => {
      if (event.key !== "Tab") return;
      const overlay = visibleOverlay();
      if (overlay) trapTab(event, overlay, documentRef);
    });

    const observer = new MutationObserver(records => {
      handleChange(records.filter(record => record.type === "attributes"));
      records.filter(record => record.type === "childList").flatMap(record => [...record.addedNodes]).forEach(node => {
        if (!node?.querySelectorAll) return;
        const overlays = [node, ...node.querySelectorAll(".modal-overlay")].filter(item => item.classList?.contains("modal-overlay"));
        overlays.forEach(overlay => observer.observe(overlay, { attributes: true, attributeFilter: ["hidden"] }));
      });
    });
    documentRef.querySelectorAll(".modal-overlay").forEach(overlay => observer.observe(overlay, { attributes: true, attributeFilter: ["hidden"] }));
    observer.observe(documentRef.body, { childList: true, subtree: true });
    return observer;
  }

  const api = Object.freeze({ createController, focusable, focusModal, trapTab });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModalAccess = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined") install(document);
})();
