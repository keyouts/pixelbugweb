(() => {
  function create(options = {}) {
    const WorkerCtor = options.WorkerCtor || (typeof Worker !== "undefined" ? Worker : null);
    const workerUrl = options.workerUrl || "./workers/project-serializer-worker.js";
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 30000);
    let worker = null;
    let nextId = 0;
    const pending = new Map();

    function rejectPending(message) {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error(message));
      }
      pending.clear();
    }

    function resetWorker(message = "Project serialization failed.") {
      worker?.terminate?.();
      worker = null;
      rejectPending(message);
    }

    function ensureWorker() {
      if (worker) return worker;
      if (!WorkerCtor) throw new Error("Project serialization worker is unavailable.");
      worker = new WorkerCtor(workerUrl);
      worker.onmessage = event => {
        const id = Number(event.data?.id);
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        clearTimeout(entry.timer);
        if (event.data?.ok) entry.resolve(String(event.data.text || ""));
        else entry.reject(new Error(event.data?.error || "Project serialization failed."));
      };
      worker.onerror = () => resetWorker();
      return worker;
    }

    function request(kind, value, space = 0) {
      return new Promise((resolve, reject) => {
        const active = ensureWorker();
        const id = ++nextId;
        const timer = setTimeout(() => {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error("Project serialization timed out."));
          resetWorker("Project serialization worker was reset.");
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        try {
          active.postMessage({ id, kind, value, space: Math.max(0, Math.min(2, Number(space) || 0)) });
        } catch (error) {
          pending.delete(id);
          clearTimeout(timer);
          reject(error);
        }
      });
    }

    function serializeProject(project, space = 0) {
      return request("project", project, space);
    }

    function serializeSession(documents, activeDocumentId, space = 0) {
      return request("session", { documents, activeDocumentId }, space);
    }

    function terminate() {
      resetWorker("Project serialization worker was closed.");
    }

    return Object.freeze({ serializeProject, serializeSession, terminate });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugProjectSerialization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
