const { contextBridge, ipcRenderer } = require("electron");

const active = new Map();
const MAX_BRUSH_DOTS = 4096;

function cleanColor(value) {
  if (value == null || value === false || value === "") return null;
  const text = String(value);
  if (text.length > 64) throw new Error("Invalid mod color");
  return text;
}

function cleanPixels(value, width, height) {
  if (!Array.isArray(value) || value.length !== height) throw new Error("Invalid mod pixels");
  return value.map(row => {
    if (!Array.isArray(row) || row.length !== width) throw new Error("Invalid mod pixels");
    return row.map(cleanColor);
  });
}

function cleanBrush(value) {
  if (value == null || value === false) return value;
  if (typeof value === "string") return cleanColor(value);
  const source = Array.isArray(value) ? value : [value];
  if (source.length > MAX_BRUSH_DOTS) throw new Error("Mod returned too many paint marks");
  return source.map(item => {
    if (item == null || item === false) return item;
    if (typeof item === "string") return cleanColor(item);
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid mod paint mark");
    const clean = { color: cleanColor(item.color) };
    if (Number.isFinite(Number(item.x))) clean.x = Number(item.x);
    if (Number.isFinite(Number(item.y))) clean.y = Number(item.y);
    return clean;
  });
}

function respond(id, result, error = "") {
  const request = active.get(String(id));
  if (!request) return false;
  active.delete(String(id));
  if (error) {
    ipcRenderer.send("mod-run-response", { id: String(id), error: String(error).slice(0, 500) });
    return true;
  }
  try {
    const clean = request.kind === "effect" ? cleanPixels(result, request.width, request.height) : cleanBrush(result);
    ipcRenderer.send("mod-run-response", { id: String(id), result: clean });
  } catch (responseError) {
    ipcRenderer.send("mod-run-response", { id: String(id), error: String(error || responseError?.message || responseError).slice(0, 500) });
  }
  return true;
}

let receiver = null;
ipcRenderer.on("mod-run-request", (_event, request) => {
  if (!request || typeof request !== "object" || !receiver) return;
  const id = String(request.id || "");
  const width = Number(request.payload?.app?.width);
  const height = Number(request.payload?.app?.height);
  if (!id || !Number.isInteger(width) || !Number.isInteger(height)) return;
  active.set(id, { kind: request.kind, width, height });
  receiver({ id, kind: request.kind, code: String(request.code || ""), payload: request.payload });
});

contextBridge.exposeInMainWorld("pixelBugMod", Object.freeze({
  receive(callback) {
    receiver = typeof callback === "function" ? callback : null;
  },
  respond
}));
