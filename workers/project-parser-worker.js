"use strict";

importScripts("../modules/project-package.js", "../modules/project-guard.js");

self.onmessage = event => {
  try {
    const text = String(event.data?.text || "");
    try {
      const project = self.PixelBugProjectGuard.parse(text);
      self.postMessage({ ok: true, project, info: { readOnly: false, warnings: [] } });
    } catch (strictError) {
      const recovered = self.PixelBugProjectPackage.recover(text);
      const warnings = Array.isArray(recovered.warnings) ? recovered.warnings.slice() : [];
      let candidate = recovered.project;
      if (recovered.readOnly === true && Number(candidate?.schemaVersion) > self.PixelBugProjectGuard.SCHEMA_VERSION) {
        candidate = { ...candidate, schemaVersion: self.PixelBugProjectGuard.SCHEMA_VERSION };
        warnings.push("Newer project fields were preserved where safe, but unsupported behavior may be unavailable.");
      }
      const project = self.PixelBugProjectGuard.prepare(candidate);
      self.postMessage({ ok: true, project, info: { readOnly: recovered.readOnly === true, warnings: [...new Set(warnings)], strictError: String(strictError?.message || strictError).slice(0, 500) } });
    }
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || error).slice(0, 500) });
  }
};
