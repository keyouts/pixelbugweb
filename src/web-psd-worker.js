"use strict";

importScripts("./modules/psd-template.js");

// Decode requests
self.onmessage = event => {
  try {
    const result = self.PixelBugPsdTemplate.decodePsdTemplate(event.data);
    const rgba = result.rgba.buffer.slice(result.rgba.byteOffset, result.rgba.byteOffset + result.rgba.byteLength);
    self.postMessage({ ok: true, width: result.width, height: result.height, rgba }, [rgba]);
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || String(error) });
  }
};
