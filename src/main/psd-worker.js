"use strict";

const { parentPort } = require("node:worker_threads");
const { decodePsdTemplate } = require("../modules/psd-template");

parentPort.on("message", data => {
  try {
    const result = decodePsdTemplate(data);
    parentPort.postMessage({ ok: true, width: result.width, height: result.height, rgba: result.rgba.buffer }, [result.rgba.buffer]);
  } catch (error) {
    parentPort.postMessage({ ok: false, error: String(error?.message || "PSD decoding failed").slice(0, 300) });
  }
});
