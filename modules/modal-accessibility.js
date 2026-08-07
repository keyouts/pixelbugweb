(() => {
  const selectors = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const returnTargets = new WeakMap();

  function modalForOverlay(overlay) {
    return overlay?.querySelector?.('[aria-modal="true"]') || null;
  }

  function focusable(modal) {
    return [...modal.querySelectorAll(selectors)].filter(element => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
  }

  function visibleOverlay() {
    return [...document.querySelectorAll(".modal-overlay")].reverse().find(overlay => !overlay.hidden && modalForOverlay(overlay));
  }

  function focusModal(overlay) {
    const modal = modalForOverlay(overlay);
    if (!modal) return;
    if (!modal.contains(document.activeElement)) {
      const target = modal.querySelector("[autofocus]") || focusable(modal)[0] || modal;
      if (target === modal && !modal.hasAttribute("tabindex")) modal.setAttribute("tabindex", "-1");
      target.focus?.();
    }
  }

  function handleChange(records) {
    records.forEach(record => {
      const overlay = record.target;
      if (!overlay.classList?.contains("modal-overlay")) return;
      if (!overlay.hidden) {
        returnTargets.set(overlay, document.activeElement);
        requestAnimationFrame(() => focusModal(overlay));
      } else {
        const target = returnTargets.get(overlay);
        if (target?.isConnected) requestAnimationFrame(() => target.focus?.());
      }
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const overlay = visibleOverlay();
    const modal = modalForOverlay(overlay);
    if (!modal) return;
    const items = focusable(modal);
    if (!items.length) {
      event.preventDefault();
      focusModal(overlay);
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  const observer = new MutationObserver(handleChange);
  document.querySelectorAll(".modal-overlay").forEach(overlay => observer.observe(overlay, { attributes: true, attributeFilter: ["hidden"] }));
})();
