importScripts("../modules/project-package.js", "../modules/session-recovery.js");

self.onmessage = event => {
  const id = Number(event.data?.id);
  try {
    const kind = String(event.data?.kind || "");
    const space = Math.max(0, Math.min(2, Number(event.data?.space) || 0));
    let text = "";
    if (kind === "project") text = self.PixelBugProjectPackage.stringify(event.data?.value, space);
    else if (kind === "session") text = self.PixelBugSessionRecovery.serialize(event.data?.value?.documents, event.data?.value?.activeDocumentId, self.PixelBugProjectPackage, space);
    else throw new Error("Project serialization request is not valid.");
    self.postMessage({ id, ok: true, text });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message || "Project serialization failed.").slice(0, 500) });
  }
};
