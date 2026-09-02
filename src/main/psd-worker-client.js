"use strict";

const path = require("node:path");
const { Worker } = require("node:worker_threads");

const MAX_PSD_INPUT_BYTES = 128 * 1024 * 1024;
const PSD_DECODE_TIMEOUT_MS = 30000;

function transferableBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  throw new Error("Invalid PSD data");
}

function decodePsdTemplateAsync(value, options = {}) {
  const buffer = transferableBuffer(value);
  if (!buffer.byteLength || buffer.byteLength > MAX_PSD_INPUT_BYTES) return Promise.reject(new Error("PSD file is too large"));
  const workerPath = options.workerPath || path.join(__dirname, "psd-worker.js");
  const timeoutMs = Math.max(100, Number(options.timeoutMs) || PSD_DECODE_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error("PSD decoding timed out")), timeoutMs);
    worker.once("error", error => finish(error));
    worker.once("exit", code => { if (code !== 0) finish(new Error("PSD decoding stopped unexpectedly")); });
    worker.once("message", message => {
      if (!message?.ok) return finish(new Error(message?.error || "PSD decoding failed"));
      const rgba = message.rgba instanceof ArrayBuffer ? message.rgba : transferableBuffer(message.rgba);
      finish(null, { width: Number(message.width), height: Number(message.height), rgba });
    });
    worker.postMessage(buffer, [buffer]);
  });
}

module.exports = { MAX_PSD_INPUT_BYTES, PSD_DECODE_TIMEOUT_MS, decodePsdTemplateAsync };
