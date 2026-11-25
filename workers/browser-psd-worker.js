importScripts("../modules/psd-template.js");
self.onmessage = event => {
  try {
    const result = decodePsdTemplate(event.data);
    self.postMessage(result, [result.rgba.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message || "PSD decoding failed." });
  }
};
