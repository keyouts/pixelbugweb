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
      serializeProject,
      serializeProjectAsync,
      serializationSnapshot,
      serializeSessionAsync
    } = options;

    const documentTabs = document.querySelector("#document-tabs");
    const documentNewTabBtn = document.querySelector("#document-new-tab-btn");
    const documentSaveStatus = document.querySelector("#document-save-status");
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
      if (documentSaveStatus) {
        const dirtyCount = projectDocuments.filter(documentRecord => documentRecord.dirty).length;
        documentSaveStatus.textContent = dirtyCount ? `${dirtyCount} open project${dirtyCount === 1 ? " has" : "s have"} unsaved changes.` : "All open projects are saved.";
      }
      if (focusDocumentId) focusDocumentTab(focusDocumentId);
    }

    function syncActiveProjectDocument(markDirty = true) {
      if (documentSyncPaused) return;
      const documentRecord = currentProjectDocument();
      if (!documentRecord) return;
      documentSyncPaused = true;
      try {
        documentRecord.project = projectSnapshot(getState());
        if (markDirty) {
          documentRecord.revision = Number(documentRecord.revision || 0) + 1;
          documentRecord.dirty = true;
        }
        renderDocumentTabs();
      } finally {
        documentSyncPaused = false;
      }
    }

    function markActiveProjectDocumentDirty() {
      if (documentSyncPaused) return;
      const documentRecord = currentProjectDocument();
      if (!documentRecord) return;
      documentRecord.revision = Number(documentRecord.revision || 0) + 1;
      if (documentRecord.dirty) return;
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
        revision: 0,
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
          revision: 0,
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
        projectDocuments.push({ id: WorkflowFeatures.uid("document"), name: state.name || "Untitled Project", filePath: "", project: projectSnapshot(state), dirty: false, revision: 0 });
        activeDocumentId = projectDocuments[0].id;
      }
      window.PixelBugDocuments = {
        markDirty: markActiveProjectDocumentDirty,
        syncActive: () => syncActiveProjectDocument(true),
        serializeRecovery: serializeRecoverySession,
        serializeRecoveryAsync: serializeRecoverySessionAsync,
        restoreRecovery: restoreRecoveryText,
        recoverySummary,
        dirtyNames: () => projectDocuments.filter(documentRecord => documentRecord.dirty).map(documentRecord => documentRecord.name),
        saveAllDirty: saveAllDirtyProjects
      };
      renderDocumentTabs();
    }

    function serializeRecoverySession() {
      syncActiveProjectDocument(false);
      return SessionRecovery.serialize(projectDocuments, activeDocumentId, ProjectPackage);
    }

    function serializeRecoverySessionAsync() {
      syncActiveProjectDocument(false);
      if (typeof serializeSessionAsync !== "function") return Promise.resolve(serializeRecoverySession());
      return serializeSessionAsync(projectDocuments, activeDocumentId);
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

    async function saveProjectDocument(documentRecord, forceDialog = false) {
      if (!documentRecord) return false;
      const active = documentRecord.id === activeDocumentId;
      if (active) syncActiveProjectDocument(false);
      const project = active ? getState() : documentRecord.project;
      const saveRevision = Number(documentRecord.revision || 0);
      const savedProject = typeof serializationSnapshot === "function" ? serializationSnapshot(active ? null : project) : projectSnapshot(project);
      const defaultName = documentRecord.filePath ? documentRecord.filePath.split(/[\\/]/).pop() : `${WorkflowFeatures.safeFilename(documentRecord.name || project.name || "project")}.pxbuild`;
      const saveAsRequired = forceDialog || documentRecord.readOnly === true;
      const data = typeof serializeProjectAsync === "function" ? await serializeProjectAsync(2, savedProject) : active ? serializeProject(2) : ProjectPackage.stringify(ProjectGuard.stamp(projectSnapshot(project)), 2);
      const result = await window.pixelBug.saveProjectFile({
        documentId: documentRecord.id,
        forceDialog: saveAsRequired,
        title: saveAsRequired ? "Save Pixel Bug Project As" : "Save Pixel Bug Project",
        defaultPath: defaultName,
        filters: [{ name: "Pixel Bug Project", extensions: ["pxbuild"] }],
        data
      });
      if (result.ok) {
        documentRecord.filePath = result.filePath || documentRecord.filePath;
        documentRecord.name = projectDocumentName(documentRecord.filePath, documentRecord.name);
        const changedDuringSave = Number(documentRecord.revision || 0) !== saveRevision;
        documentRecord.project = changedDuringSave && active && typeof serializationSnapshot === "function" ? serializationSnapshot() : projectSnapshot(savedProject);
        documentRecord.dirty = changedDuringSave;
        documentRecord.readOnly = false;
        documentRecord.warning = "";
        bindDocumentPath(documentRecord);
        renderDocumentTabs();
        saveLocalNow();
      }
      return result.ok === true;
    }

    async function saveProject(forceDialog = false) {
      const documentRecord = currentProjectDocument();
      const saveAsRequired = forceDialog || documentRecord?.readOnly === true;
      const saved = await saveProjectDocument(documentRecord, forceDialog);
      setStatus(saved ? (saveAsRequired ? "Project saved as a new file." : "Project saved.") : "Save cancelled.");
      return saved;
    }

    async function saveAllDirtyProjects() {
      syncActiveProjectDocument(false);
      const dirty = projectDocuments.filter(documentRecord => documentRecord.dirty);
      for (const documentRecord of dirty) {
        setStatus(`Saving ${documentRecord.name}.`);
        if (!await saveProjectDocument(documentRecord, documentRecord.readOnly === true)) {
          renderDocumentTabs();
          setStatus(`Save cancelled for ${documentRecord.name}.`);
          return false;
        }
      }
      renderDocumentTabs();
      setStatus(dirty.length ? "All projects saved." : "Projects are already saved.");
      return true;
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
      saveAllDirtyProjects,
      saveProject,
      saveProjectAs,
      serializeRecoverySession,
      serializeRecoverySessionAsync,
      setup,
      switchProjectDocument
    });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugDocumentWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
