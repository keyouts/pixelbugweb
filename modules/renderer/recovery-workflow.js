(() => {
  function create(options) {
    const {
      storage,
      storageKey,
      maxAutosaveChars,
      maxLocalAutosaveChars,
      safeMode,
      runWhenIdle,
      serialize,
      serializeAsync,
      recoverySummary,
      saveRecovery,
      clearRecovery,
      isInputPending,
      isRuntimeActive,
      refreshGallery,
      syncActiveDocument,
      stopRuntime,
      setStatus,
      dirtyNames,
      requestWindowClose,
      cancelWindowClose,
      saveAllDirty,
      completeWindowClose,
      onPaused
    } = options;
    let saveTimer = null;
    let saveRevision = 0;
    let mirrorTimer = null;
    let pendingPayload = "";
    let paused = false;
    let closeFlushCompleted = false;
    let closeRequestActive = false;

    function setPaused(nextPaused, announce = true) {
      const next = Boolean(nextPaused);
      if (paused === next) return;
      paused = next;
      if (announce) onPaused?.(paused);
    }

    function clearMirror() {
      clearTimeout(mirrorTimer);
      mirrorTimer = null;
      pendingPayload = "";
    }

    function storeLocal(payload) {
      if (payload.length <= maxLocalAutosaveChars) {
        try { storage.setItem(storageKey, payload); } catch (_error) { storage.removeItem(storageKey); }
      } else {
        storage.removeItem(storageKey);
      }
    }

    function queueMirror(payload) {
      pendingPayload = payload;
      clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => {
        const next = pendingPayload;
        mirrorTimer = null;
        pendingPayload = "";
        if (next) saveRecovery({ payload: next, summary: recoverySummary?.() }).catch(() => {});
      }, 3000);
    }

    function applyPayload(payload, revision) {
      if (revision !== saveRevision || safeMode) return;
      if (payload.length > maxAutosaveChars) {
        storage.removeItem(storageKey);
        clearMirror();
        clearRecovery().catch(() => {});
        setPaused(true);
        return;
      }
      storeLocal(payload);
      queueMirror(payload);
      setPaused(false);
    }

    function saveNow(revision = saveRevision) {
      if (revision !== saveRevision || safeMode) return;
      try {
        if (isInputPending?.()) {
          saveTimer = setTimeout(() => runWhenIdle(() => saveNow(revision), 2000), 300);
          return;
        }
        if (typeof serializeAsync === "function") return Promise.resolve(serializeAsync()).then(payload => applyPayload(payload, revision)).catch(() => {});
        applyPayload(serialize(), revision);
      } catch (_error) {}
    }

    async function flush() {
      if (safeMode) return true;
      clearTimeout(saveTimer);
      saveTimer = null;
      saveRevision++;
      clearMirror();
      for (let attempt = 0; attempt < 3; attempt++) {
        const revision = saveRevision;
        const payload = typeof serializeAsync === "function" ? await serializeAsync() : serialize();
        if (revision !== saveRevision) continue;
        if (payload.length > maxAutosaveChars) {
          storage.removeItem(storageKey);
          setPaused(true);
          throw new Error("This session is too large for automatic recovery.");
        }
        storeLocal(payload);
        await saveRecovery({ payload, summary: recoverySummary?.() });
        setPaused(false);
        return true;
      }
      return false;
    }

    async function discard() {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveRevision++;
      clearMirror();
      storage.removeItem(storageKey);
      await clearRecovery();
    }

    function schedule() {
      if (isRuntimeActive?.()) return;
      clearTimeout(saveTimer);
      const revision = ++saveRevision;
      saveTimer = setTimeout(() => runWhenIdle(() => saveNow(revision), 2000), 800);
      refreshGallery?.();
      syncActiveDocument?.();
    }

    async function handleCloseRequest() {
      if (closeRequestActive) return;
      closeRequestActive = true;
      stopRuntime?.();
      setStatus("Preparing projects for close.");
      let recoveryFailed = false;
      try { recoveryFailed = !(await flush()); } catch (_error) { recoveryFailed = true; }
      try {
        const response = await requestWindowClose({ dirtyNames: dirtyNames?.() || [], recoveryFailed });
        if (response?.action === "cancel") {
          await cancelWindowClose();
          closeRequestActive = false;
          setStatus("Close cancelled.");
          return;
        }
        if (response?.action === "save") {
          const saved = await saveAllDirty?.();
          if (!saved) {
            await cancelWindowClose();
            closeRequestActive = false;
            return;
          }
          try { await flush(); } catch (_error) {}
        }
        if (response?.action === "discard") await discard();
        closeFlushCompleted = true;
        await completeWindowClose();
      } catch (error) {
        closeFlushCompleted = false;
        await cancelWindowClose().catch(() => {});
        closeRequestActive = false;
        setStatus(error?.message || "Pixel Bug could not close safely.");
      }
    }

    function beforeUnload(prepare) {
      if (closeFlushCompleted) return;
      prepare?.();
      try { storeLocal(serialize()); } catch (_error) {}
    }

    function revision() {
      return saveRevision;
    }

    return Object.freeze({ beforeUnload, discard, flush, handleCloseRequest, revision, saveNow, schedule, setPaused });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugRecoveryWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
