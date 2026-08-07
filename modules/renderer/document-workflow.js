(() => {
  function create(options) {
    const {
      WorkflowFeatures,
      ProjectPackage,
      SessionRecovery,
      ProjectGuard,
      escapeHtml,
      freshProject,
      projectWidth,
      projectHeight,
      getState,
      getStartupRecoverySession,
      applyRecoveredProject,
      resetEditorHistory,
      resetFrameSelection,
      syncControls,
      renderAll,
      saveLocal,
      saveLocalNow,
      setStatus,
      parseProjectAsync,
      takeProjectParseInfo,
      makeProjectThumbnail,
      removeImportedPrintLayers,
      serializeProject
    } = options;

    const documentTabs = document.querySelector("#document-tabs");
    const documentNewTabBtn = document.querySelector("#document-new-tab-btn");
    const recentProjectsBtn = document.querySelector("#recent-projects-btn");
    const recentProjectsOverlay = document.querySelector("#recent-projects-overlay");
    const closeRecentProjectsBtn = document.querySelector("#close-recent-projects-btn");
    const recentProjectList = document.querySelector("#recent-project-list");
    const recentProjectsStatus = document.querySelector("#recent-projects-status");
    let projectDocuments = [];
    let activeDocumentId = "";
    let documentSyncPaused = false;

    function projectDocumentName(filePath, fallback = "Untitled Project") {
      const name = String(filePath || "").split(/[\\/]/).pop()?.replace(/\.(pxbuild|json)$/i, "");
      return String(name || fallback || "Untitled Project").slice(0, 80);
    }

    function projectSnapshot(project) {
      return typeof structuredClone === "function" ? structuredClone(project) : JSON.parse(JSON.stringify(project));
    }

    function currentProjectDocument() {
      return projectDocuments.find(documentRecord => documentRecord.id === activeDocumentId) || null;
    }

    function focusDocumentTab(documentId) {
      if (!documentId) return;
      const focus = () => document.getElementById(`document-tab-${documentId}`)?.focus();
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(focus);
      else focus();
    }

    function bindDocumentPath(documentRecord) {
      if (!documentRecord?.filePath) return Promise.resolve(false);
      return window.pixelBug.bindProjectPath(documentRecord.id, documentRecord.filePath).then(() => true).catch(() => false);
    }

    function renderDocumentTabs(focusDocumentId = "") {
      if (!documentTabs) return;
      documentTabs.innerHTML = "";
      projectDocuments.forEach(documentRecord => {
        const active = documentRecord.id === activeDocumentId;
        const item = document.createElement("div");
        item.className = `document-tab${active ? " active" : ""}`;
        item.setAttribute("role", "presentation");
        const main = document.createElement("button");
        main.className = "document-tab-main";
        main.type = "button";
        main.id = `document-tab-${documentRecord.id}`;
        main.setAttribute("role", "tab");
        main.setAttribute("aria-selected", String(active));
        main.tabIndex = active ? 0 : -1;
        main.setAttribute("aria-label", `${documentRecord.name}${documentRecord.dirty ? ", unsaved changes" : ""}${documentRecord.readOnly ? ", read only" : ""}`);
        main.innerHTML = `${documentRecord.dirty ? '<span class="document-tab-dirty" aria-hidden="true"></span>' : ""}<span>${escapeHtml(documentRecord.name)}${documentRecord.readOnly ? ' <span aria-hidden="true">[Read Only]</span>' : ""}</span>`;
        main.onclick = () => switchProjectDocument(documentRecord.id);
        const close = document.createElement("button");
        close.className = "document-tab-close";
        close.type = "button";
        close.setAttribute("aria-label", `Close ${documentRecord.name}`);
        close.innerHTML = `×<span class="sr-only"> ${escapeHtml(documentRecord.name)}</span>`;
        close.onclick = event => { event.stopPropagation(); closeProjectDocument(documentRecord.id); };
        item.append(main, close);
        documentTabs.appendChild(item);
      });
      if (focusDocumentId) focusDocumentTab(focusDocumentId);
    }

    function syncActiveProjectDocument(markDirty = true) {
      if (documentSyncPaused) return;
      const documentRecord = currentProjectDocument();
      if (!documentRecord) return;
      documentSyncPaused = true;
      try {
        documentRecord.project = projectSnapshot(getState());
        if (markDirty) documentRecord.dirty = true;
        renderDocumentTabs();
      } finally {
        documentSyncPaused = false;
      }
    }

    function markActiveProjectDocumentDirty() {
      if (documentSyncPaused) return;
      const documentRecord = currentProjectDocument();
      if (!documentRecord || documentRecord.dirty) return;
      documentRecord.dirty = true;
      renderDocumentTabs();
    }

    function applyDocument(documentRecord, persist = false) {
      documentSyncPaused = true;
      try {
        applyRecoveredProject(projectSnapshot(documentRecord.project));
        resetEditorHistory();
        resetFrameSelection();
        syncControls();
        renderAll({ persist: false });
        if (persist) saveLocalNow();
      } finally {
        documentSyncPaused = false;
      }
    }

    function createProjectDocument(project, name = "Untitled Project", filePath = "", settings = {}) {
      if (projectDocuments.length >= 12) return setStatus("Close a project tab before opening another.");
      if (currentProjectDocument()) syncActiveProjectDocument(false);
      const documentRecord = {
        id: WorkflowFeatures.uid("document"),
        name: projectDocumentName(filePath, name),
        filePath: String(filePath || ""),
        project: projectSnapshot(project),
        dirty: settings.clean !== true,
        readOnly: settings.readOnly === true,
        warning: String(settings.warning || "").slice(0, 500)
      };
      projectDocuments.push(documentRecord);
      activeDocumentId = documentRecord.id;
      bindDocumentPath(documentRecord);
      applyDocument(documentRecord, false);
      renderDocumentTabs();
      saveLocalNow();
      return documentRecord;
    }

    function switchProjectDocument(documentId) {
      if (documentId === activeDocumentId) return;
      const next = projectDocuments.find(documentRecord => documentRecord.id === documentId);
      if (!next) return;
      syncActiveProjectDocument(false);
      activeDocumentId = next.id;
      applyDocument(next, true);
      renderDocumentTabs();
      setStatus(`${next.name} selected.`);
    }

    function closeProjectDocument(documentId) {
      const documentRecord = projectDocuments.find(item => item.id === documentId);
      if (!documentRecord) return;
      if (documentRecord.dirty && !window.confirm(`Close ${documentRecord.name} with unsaved changes?`)) return;
      const index = projectDocuments.indexOf(documentRecord);
      const wasActive = documentId === activeDocumentId;
      const closedName = documentRecord.name;
      window.pixelBug.forgetProjectPath(documentRecord.id).catch(() => {});
      projectDocuments.splice(index, 1);
      if (!projectDocuments.length) {
        createProjectDocument(freshProject(projectWidth(), projectHeight()), "Untitled Project", "", { clean: true });
        setStatus(`${closedName} closed. Untitled Project selected.`);
        return;
      }
      if (wasActive) {
        const next = projectDocuments[Math.min(index, projectDocuments.length - 1)];
        activeDocumentId = "";
        switchProjectDocument(next.id);
        focusDocumentTab(next.id);
        setStatus(`${closedName} closed. ${next.name} selected.`);
      } else {
        renderDocumentTabs(activeDocumentId);
        saveLocalNow();
        setStatus(`${closedName} closed.`);
      }
    }

    function normalizedSession(session) {
      if (!session?.documents?.length) return null;
      const used = new Set();
      const documents = session.documents.slice(0, 12).map((documentRecord, index) => {
        let id = String(documentRecord.id || WorkflowFeatures.uid("document")).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120);
        while (!id || used.has(id)) id = WorkflowFeatures.uid("document");
        used.add(id);
        return {
          id,
          name: projectDocumentName(documentRecord.filePath, documentRecord.name),
          filePath: String(documentRecord.filePath || ""),
          dirty: documentRecord.dirty === true,
          readOnly: documentRecord.readOnly === true,
          warning: String(documentRecord.warning || "").slice(0, 500),
          project: projectSnapshot(ProjectGuard.prepare(documentRecord.project))
        };
      });
      const activeId = documents.some(item => item.id === session.activeDocumentId) ? session.activeDocumentId : documents[0].id;
      return { documents, activeDocumentId: activeId };
    }

    function installSession(session, statusMessage = "Restored project session.") {
      const next = normalizedSession(session);
      if (!next) return false;
      projectDocuments.forEach(documentRecord => window.pixelBug.forgetProjectPath(documentRecord.id).catch(() => {}));
      projectDocuments = next.documents;
      activeDocumentId = next.activeDocumentId;
      projectDocuments.forEach(bindDocumentPath);
      const active = currentProjectDocument();
      if (!active) return false;
      applyDocument(active, false);
      renderDocumentTabs();
      setStatus(statusMessage);
      return true;
    }

    function recoverySummary() {
      syncActiveProjectDocument(false);
      const active = currentProjectDocument();
      const project = active?.project || getState();
      const width = Math.max(1, Number(project?.width || project?.size) || 1);
      const height = Math.max(1, Number(project?.height || project?.size) || width);
      let thumbnail = "";
      try { thumbnail = typeof makeProjectThumbnail === "function" ? makeProjectThumbnail(project, 64) : ""; } catch (_error) {}
      return {
        name: active?.name || project?.name || "Recovery Snapshot",
        tabCount: projectDocuments.length,
        dirtyCount: projectDocuments.filter(documentRecord => documentRecord.dirty).length,
        dimensions: `${width} × ${height}`,
        thumbnail
      };
    }

    function setupProjectDocuments() {
      const startupSession = normalizedSession(getStartupRecoverySession?.());
      if (startupSession) {
        projectDocuments = startupSession.documents;
        activeDocumentId = startupSession.activeDocumentId;
        projectDocuments.forEach(bindDocumentPath);
      } else if (!projectDocuments.length) {
        const state = getState();
        projectDocuments.push({ id: WorkflowFeatures.uid("document"), name: state.name || "Untitled Project", filePath: "", project: projectSnapshot(state), dirty: false });
        activeDocumentId = projectDocuments[0].id;
      }
      window.PixelBugDocuments = {
        markDirty: markActiveProjectDocumentDirty,
        syncActive: () => syncActiveProjectDocument(true),
        serializeRecovery: serializeRecoverySession,
        restoreRecovery: restoreRecoveryText,
        recoverySummary
      };
      renderDocumentTabs();
    }

    function serializeRecoverySession() {
      syncActiveProjectDocument(false);
      return SessionRecovery.serialize(projectDocuments, activeDocumentId, ProjectPackage);
    }

    async function restoreRecoveryText(text) {
      try {
        const session = SessionRecovery.parse(text, ProjectPackage);
        if (session) return installSession(session, `Restored ${session.documents.length} project tab${session.documents.length === 1 ? "" : "s"} from recovery.`);
        const parsed = await parseProjectAsync(text);
        return installSession({ activeDocumentId: "recovered-project", documents: [{ id: "recovered-project", name: parsed.name || "Recovered Project", filePath: "", dirty: true, project: parsed }] }, "Restored recovery file.");
      } catch (_error) {
        return false;
      }
    }

    async function saveProject(forceDialog = false) {
      const state = getState();
      const documentRecord = currentProjectDocument();
      if (!documentRecord) return;
      syncActiveProjectDocument(false);
      const defaultName = documentRecord.filePath ? documentRecord.filePath.split(/[\\/]/).pop() : `${WorkflowFeatures.safeFilename(documentRecord.name || state.name || "project")}.pxbuild`;
      const saveAsRequired = forceDialog || documentRecord.readOnly === true;
      const result = await window.pixelBug.saveProjectFile({
        documentId: documentRecord.id,
        forceDialog: saveAsRequired,
        title: saveAsRequired ? "Save Pixel Bug Project As" : "Save Pixel Bug Project",
        defaultPath: defaultName,
        filters: [{ name: "Pixel Bug Project", extensions: ["pxbuild"] }],
        data: serializeProject(2)
      });
      if (result.ok) {
        documentRecord.filePath = result.filePath || documentRecord.filePath;
        documentRecord.name = projectDocumentName(documentRecord.filePath, documentRecord.name);
        documentRecord.project = projectSnapshot(state);
        saveLocal();
        documentRecord.dirty = false;
        documentRecord.readOnly = false;
        documentRecord.warning = "";
        bindDocumentPath(documentRecord);
        renderDocumentTabs();
      }
      setStatus(result.ok ? (saveAsRequired ? "Project saved as a new file." : "Project saved.") : "Save cancelled.");
    }

    function saveProjectAs() {
      return saveProject(true);
    }

    async function openProject() {
      const result = await window.pixelBug.openProject();
      if (!result.ok) return setStatus("Open cancelled.");
      try {
        const parsed = await parseProjectAsync(result.text);
        const openInfo = takeProjectParseInfo?.() || { readOnly: false, warnings: [] };
        removeImportedPrintLayers(true);
        const warning = Array.isArray(openInfo.warnings) ? openInfo.warnings.join(" ").slice(0, 500) : "";
        const documentRecord = createProjectDocument(parsed, projectDocumentName(result.filePath), result.filePath, { clean: true, readOnly: openInfo.readOnly === true, warning });
        await bindDocumentPath(documentRecord);
        saveLocal();
        const activeRecord = currentProjectDocument();
        if (activeRecord) activeRecord.dirty = false;
        renderDocumentTabs();
        setStatus(openInfo.readOnly ? `Project opened read-only. ${warning}`.trim() : "Project opened in a new tab.");
      } catch (error) {
        setStatus(`Could not open project: ${error?.message || "invalid project"}.`);
      }
    }

    async function openRecentProjectsModal() {
      if (!recentProjectsOverlay || !recentProjectList || !recentProjectsStatus) return;
      recentProjectsOverlay.hidden = false;
      recentProjectsBtn?.setAttribute("aria-expanded", "true");
      recentProjectList.innerHTML = "";
      recentProjectsStatus.textContent = "Loading recent projects.";
      try {
        const recent = await window.pixelBug.listRecentProjects();
        if (!recent.length) {
          recentProjectList.innerHTML = '<p class="modal-note">No saved projects have been opened recently.</p>';
          recentProjectsStatus.textContent = "No recent projects.";
        } else {
          recent.forEach(item => {
            const row = document.createElement("div");
            row.className = "recent-project-row";
            const copy = document.createElement("div");
            copy.className = "recent-project-copy";
            const strong = document.createElement("strong");
            strong.textContent = item.name;
            const small = document.createElement("small");
            small.textContent = item.filePath;
            copy.append(strong, small);
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Open";
            button.setAttribute("aria-label", `Open recent project ${item.name}`);
            button.onclick = () => openRecentProjectItem(item);
            row.append(copy, button);
            recentProjectList.appendChild(row);
          });
          recentProjectsStatus.textContent = `${recent.length} recent project${recent.length === 1 ? "" : "s"}.`;
        }
      } catch (_error) {
        recentProjectsStatus.textContent = "Recent projects could not be loaded.";
      }
      closeRecentProjectsBtn?.focus();
    }

    function closeRecentProjectsModal() {
      if (!recentProjectsOverlay) return;
      recentProjectsOverlay.hidden = true;
      recentProjectsBtn?.setAttribute("aria-expanded", "false");
      recentProjectsBtn?.focus();
    }

    async function openRecentProjectItem(item) {
      try {
        const result = await window.pixelBug.openRecentProject(item.filePath);
        const parsed = await parseProjectAsync(result.text);
        const openInfo = takeProjectParseInfo?.() || { readOnly: false, warnings: [] };
        const warning = Array.isArray(openInfo.warnings) ? openInfo.warnings.join(" ").slice(0, 500) : "";
        const documentRecord = createProjectDocument(parsed, item.name, result.filePath, { clean: true, readOnly: openInfo.readOnly === true, warning });
        await bindDocumentPath(documentRecord);
        saveLocalNow();
        closeRecentProjectsModal();
        setStatus(openInfo.readOnly ? `${item.name} opened read-only. ${warning}`.trim() : `${item.name} opened in a new tab.`);
      } catch (error) {
        if (recentProjectsStatus) recentProjectsStatus.textContent = error?.message || "Recent project could not be opened.";
      }
    }

    function setup() {
      setupProjectDocuments();
      recentProjectsBtn?.addEventListener("click", openRecentProjectsModal);
      closeRecentProjectsBtn?.addEventListener("click", closeRecentProjectsModal);
      recentProjectsOverlay?.addEventListener("click", event => { if (event.target === recentProjectsOverlay) closeRecentProjectsModal(); });
      documentNewTabBtn?.addEventListener("click", () => createProjectDocument(freshProject(projectWidth(), projectHeight()), "Untitled Project"));
      documentTabs?.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...documentTabs.querySelectorAll('[role="tab"]')];
        const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
        let nextIndex = currentIndex;
        if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = Math.max(0, tabs.length - 1);
        if (!tabs[nextIndex]) return;
        event.preventDefault();
        tabs[nextIndex].focus();
        tabs[nextIndex].click();
      });
    }

    return Object.freeze({
      closeProjectDocument,
      closeRecentProjectsModal,
      createProjectDocument,
      currentProjectDocument,
      installSession,
      openProject,
      openRecentProjectsModal,
      restoreRecoveryText,
      saveProject,
      saveProjectAs,
      serializeRecoverySession,
      setup,
      switchProjectDocument
    });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugDocumentWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
