const test = require("node:test");
const assert = require("node:assert/strict");

const DocumentWorkflow = require("../src/modules/renderer/document-workflow.js");

test("edits made during asynchronous save remain dirty", async () => {
  const previousDocument = global.document;
  const previousWindow = global.window;
  global.document = { querySelector: () => null };
  let resolveSerialization;
  const serialization = new Promise(resolve => { resolveSerialization = resolve; });
  const state = { name: "Before Save", width: 16, height: 16, format: "pixel-bug-project", schemaVersion: 1 };
  global.window = {
    pixelBug: {
      bindProjectPath: async () => true,
      forgetProjectPath: async () => true,
      saveProjectFile: async () => ({ ok: true, filePath: "/tmp/test.pxbuild" })
    }
  };
  try {
    const controller = DocumentWorkflow.create({
      WorkflowFeatures: { uid: () => "document-one", safeFilename: value => String(value) },
      ProjectPackage: { stringify: value => JSON.stringify(value) },
      SessionRecovery: { serialize: () => "{}", parse: () => null },
      ProjectGuard: { prepare: value => value, stamp: value => value },
      escapeHtml: value => String(value),
      freshProject: () => ({ ...state }),
      projectWidth: () => 16,
      projectHeight: () => 16,
      getState: () => state,
      getStartupRecoverySession: () => null,
      applyRecoveredProject: () => {},
      resetEditorHistory: () => {},
      resetFrameSelection: () => {},
      syncControls: () => {},
      renderAll: () => {},
      saveLocal: () => {},
      saveLocalNow: () => {},
      setStatus: () => {},
      parseProjectAsync: async () => state,
      takeProjectParseInfo: () => ({ readOnly: false, warnings: [] }),
      makeProjectThumbnail: () => "",
      removeImportedPrintLayers: () => {},
      serializeProject: () => JSON.stringify(state),
      serializeProjectAsync: () => serialization,
      serializationSnapshot: project => structuredClone(project || state),
      serializeSessionAsync: async () => "{}"
    });
    controller.setup();
    global.window.PixelBugDocuments.markDirty();
    const savePromise = controller.saveProject();
    state.name = "Changed During Save";
    global.window.PixelBugDocuments.syncActive();
    resolveSerialization(JSON.stringify({ name: "Before Save" }));
    assert.equal(await savePromise, true);
    assert.deepEqual(global.window.PixelBugDocuments.dirtyNames(), ["test"]);
  } finally {
    global.document = previousDocument;
    global.window = previousWindow;
  }
});
