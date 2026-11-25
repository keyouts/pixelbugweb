(() => {
  const FORMAT = "pixel-bug-session";
  const VERSION = 2;
  const MAX_DOCUMENTS = 12;
  const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

  function cleanText(value, limit) {
    return String(value || "").slice(0, limit);
  }

  function serialize(documents, activeDocumentId, packageApi, space = 0) {
    const source = Array.isArray(documents) ? documents.slice(0, MAX_DOCUMENTS) : [];
    const payload = {
      format: FORMAT,
      version: VERSION,
      savedAt: Date.now(),
      activeDocumentId: cleanText(activeDocumentId, 120),
      documents: source.map(documentRecord => ({
        id: cleanText(documentRecord?.id, 120),
        name: cleanText(documentRecord?.name || "Untitled Project", 80),
        filePath: cleanText(documentRecord?.filePath, 4096),
        dirty: documentRecord?.dirty === true,
        readOnly: documentRecord?.readOnly === true,
        warning: cleanText(documentRecord?.warning, 500),
        project: packageApi.pack(documentRecord?.project)
      }))
    };
    return JSON.stringify(payload, null, space);
  }

  function parse(text, packageApi) {
    const source = String(text || "");
    const payload = JSON.parse(source, (key, value) => {
      if (DANGEROUS_KEYS.has(key)) throw new Error("Recovery data contains an unsafe property");
      return value;
    });
    if (!payload || payload.format !== FORMAT) return null;
    const version = Number(payload.version);
    if (![1, VERSION].includes(version) || !Array.isArray(payload.documents) || !payload.documents.length || payload.documents.length > MAX_DOCUMENTS) throw new Error("Recovery session is not supported");
    const documents = payload.documents.map((documentRecord, index) => {
      let project;
      let recovered = { readOnly: false, warnings: [] };
      try {
        project = packageApi.unpack(documentRecord?.project);
      } catch (_error) {
        recovered = packageApi.recover(JSON.stringify(documentRecord?.project));
        project = recovered.project;
      }
      const storedWarning = version >= 2 ? cleanText(documentRecord?.warning, 500) : "";
      const recoveryWarning = Array.isArray(recovered.warnings) ? recovered.warnings.join(" ") : "";
      return {
        id: cleanText(documentRecord?.id || `document-${index + 1}`, 120),
        name: cleanText(documentRecord?.name || "Untitled Project", 80),
        filePath: cleanText(documentRecord?.filePath, 4096),
        dirty: documentRecord?.dirty === true,
        readOnly: (version >= 2 && documentRecord?.readOnly === true) || recovered.readOnly === true,
        warning: cleanText([storedWarning, recoveryWarning].filter(Boolean).join(" "), 500),
        project
      };
    });
    const activeDocumentId = documents.some(documentRecord => documentRecord.id === payload.activeDocumentId) ? payload.activeDocumentId : documents[0].id;
    return { format: FORMAT, version, activeDocumentId, documents };
  }

  const api = Object.freeze({ FORMAT, VERSION, parse, serialize });
  if (typeof globalThis !== "undefined") globalThis.PixelBugSessionRecovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
