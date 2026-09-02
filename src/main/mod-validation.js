const ModPermissions = require("../modules/mod-permissions");
const ModCodePolicy = require("../modules/mod-code-policy");
const MAX_DIMENSION = 512;
const MAX_BRUSH_DOTS = 4096;

function finiteInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error("Invalid mod value");
  return number;
}

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

function cleanInput(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid mod request");
  const kind = request.kind === "brush" ? "brush" : request.kind === "effect" ? "effect" : "";
  if (!kind) throw new Error("Invalid mod kind");
  const code = ModCodePolicy.validate(request.code);
  if (!code.trim()) throw new Error("Invalid mod code");
  const permissions = ModPermissions.sanitize(request.permissions);
  const authorization = ModPermissions.authorize(permissions, ["canvas.read", "pixels.write"]);
  if (!authorization.ok) throw new Error(`Mod permission denied: ${authorization.missing.join(", ")}`);
  const input = request.payload;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid mod payload");
  const width = finiteInteger(input.app?.width, 1, MAX_DIMENSION);
  const height = finiteInteger(input.app?.height, 1, MAX_DIMENSION);
  const pixels = cleanPixels(input.pixels, width, height);
  const payload = { pixels, app: { width, height }, color: cleanColor(input.color) };
  if (kind === "brush") {
    payload.x = finiteInteger(input.x, -MAX_DIMENSION, MAX_DIMENSION * 2);
    payload.y = finiteInteger(input.y, -MAX_DIMENSION, MAX_DIMENSION * 2);
  }
  return { kind, code, permissions, payload };
}

function cleanBrushResult(value) {
  if (value == null || value === false) return value;
  if (typeof value === "string") return cleanColor(value);
  const source = Array.isArray(value) ? value : [value];
  if (source.length > MAX_BRUSH_DOTS) throw new Error("Mod returned too many paint marks");
  return source.map(item => {
    if (item == null || item === false || typeof item === "string") return typeof item === "string" ? cleanColor(item) : item;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid mod paint mark");
    const clean = { color: cleanColor(item.color) };
    if (Number.isFinite(Number(item.x))) clean.x = Number(item.x);
    if (Number.isFinite(Number(item.y))) clean.y = Number(item.y);
    return clean;
  });
}

function cleanResult(kind, value, payload) {
  return kind === "effect" ? cleanPixels(value, payload.app.width, payload.app.height) : cleanBrushResult(value);
}

module.exports = { cleanInput, cleanResult };
