(() => {
  function formatDate(value) {
    const date = new Date(Number(value) || 0);
    return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
  }

  function create(options) {
    const {
      documentRef,
      listElement,
      statusElement,
      formatBytes,
      listSnapshots,
      loadSnapshot,
      deleteSnapshot,
      saveRecovery,
      confirmAction,
      restoreRecovery,
      saveLocalNow,
      canSerialize,
      serializeRecovery,
      recoverySummary,
      setStatus
    } = options;

    async function render() {
      if (!listElement || !statusElement) return;
      listElement.innerHTML = "";
      listElement.setAttribute("aria-busy", "true");
      statusElement.textContent = "Loading recovery snapshots.";
      try {
        const snapshots = await listSnapshots();
        if (!snapshots.length) {
          const empty = documentRef.createElement("p");
          empty.className = "modal-note";
          empty.textContent = "No rotating recovery snapshots are available yet.";
          listElement.appendChild(empty);
          statusElement.textContent = "No recovery snapshots.";
          return;
        }
        snapshots.forEach(snapshot => {
          const row = documentRef.createElement("article");
          row.className = "recovery-snapshot-row";
          const image = documentRef.createElement("img");
          image.alt = "";
          image.src = snapshot.summary?.thumbnail || "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
          const copy = documentRef.createElement("div");
          copy.className = "recovery-snapshot-copy";
          const strong = documentRef.createElement("strong");
          strong.textContent = snapshot.summary?.name || "Recovery Snapshot";
          const date = documentRef.createElement("small");
          date.textContent = formatDate(snapshot.savedAt);
          const details = documentRef.createElement("small");
          const tabs = Math.max(1, Number(snapshot.summary?.tabCount) || 1);
          const dirty = Math.max(0, Number(snapshot.summary?.dirtyCount) || 0);
          details.textContent = `${tabs} tab${tabs === 1 ? "" : "s"} · ${dirty} unsaved · ${formatBytes(snapshot.bytes)}`;
          copy.append(strong, date, details);
          const actions = documentRef.createElement("div");
          actions.className = "recovery-snapshot-actions";
          const restore = documentRef.createElement("button");
          restore.type = "button";
          restore.textContent = "Restore";
          restore.setAttribute("aria-label", `Restore ${strong.textContent} from ${date.textContent}`);
          restore.onclick = async () => {
            if (!confirmAction("Replace the open project tabs with this recovery snapshot?")) return;
            statusElement.textContent = "Loading recovery snapshot.";
            try {
              const result = await loadSnapshot(snapshot.id);
              const restored = await restoreRecovery(result.payload);
              statusElement.textContent = restored ? "Recovery snapshot restored." : "Recovery snapshot could not be restored.";
              if (restored) saveLocalNow();
            } catch (error) {
              statusElement.textContent = error?.message || "Recovery snapshot could not be restored.";
            }
          };
          const remove = documentRef.createElement("button");
          remove.type = "button";
          remove.textContent = "Delete";
          remove.setAttribute("aria-label", `Delete ${strong.textContent} recovery snapshot`);
          remove.onclick = async () => {
            if (!confirmAction("Delete this recovery snapshot?")) return;
            await deleteSnapshot(snapshot.id);
            await render();
          };
          actions.append(restore, remove);
          row.append(image, copy, actions);
          listElement.appendChild(row);
        });
        statusElement.textContent = `${snapshots.length} recovery snapshot${snapshots.length === 1 ? "" : "s"}.`;
      } catch (error) {
        statusElement.textContent = error?.message || "Recovery snapshots could not be loaded.";
      } finally {
        listElement.setAttribute("aria-busy", "false");
      }
    }

    async function createSnapshot() {
      if (!canSerialize()) return;
      if (statusElement) statusElement.textContent = "Creating recovery snapshot.";
      try {
        const payload = serializeRecovery();
        await saveRecovery({ payload, summary: recoverySummary?.(), forceSnapshot: true });
        await render();
        setStatus("Recovery snapshot created.");
      } catch (error) {
        if (statusElement) statusElement.textContent = error?.message || "Recovery snapshot could not be created.";
      }
    }

    return Object.freeze({ createSnapshot, render });
  }

  const api = Object.freeze({ create, formatDate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugRecoveryPanel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
