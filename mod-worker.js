"use strict";

function effectMode(source) {
  const match = source.match(/function\s+effect\s*\(([^)]*)\)/);
  if (!match) return { named: false, mode: "direct" };
  const params = match[1].split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  const first = params[0] || "";
  if (["pixels", "image", "layer"].includes(first)) return { named: true, mode: "pixels" };
  if (["r", "red"].includes(first)) return { named: true, mode: "rgba" };
  return { named: true, mode: "cell" };
}

function compileBrush(source) {
  const named = /function\s+brush\s*\(([^)]*)\)/.test(source);
  if (named) return new Function("input", `"use strict"; ${source}; return brush(input.x, input.y, input.color, input.pixels, input.app);`);
  return new Function("input", `"use strict"; const { x, y, color, pixels, app } = input; ${source}`);
}

function compileEffect(source) {
  const metadata = effectMode(source);
  if (!metadata.named) return new Function("input", `"use strict"; const { pixels, app, color } = input; ${source}`);
  const prefix = `"use strict"; ${source}; const pixels = input.pixels; const app = input.app; const color = input.color; const getPixel = (x, y) => pixels[y] && pixels[y][x] ? pixels[y][x] : null; const clamp = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0))); const toHex = value => clamp(value).toString(16).padStart(2, "0"); const parsePixel = px => { if (!px || typeof px !== "string") return { r: 0, g: 0, b: 0, a: 0 }; const value = px.startsWith("#") ? px.slice(1) : px; if (value.length !== 6) return { r: 0, g: 0, b: 0, a: 255 }; const n = parseInt(value, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 }; }; const normalizePixel = (next, fallback) => { if (next === undefined) return fallback; if (next === null || next === false || next === "") return null; if (typeof next === "string") return next; if (typeof next === "object") { const alpha = next.a ?? next.alpha ?? 255; if (alpha <= 0) return null; return \`#\${toHex(next.r ?? next.red)}\${toHex(next.g ?? next.green)}\${toHex(next.b ?? next.blue)}\`; } return fallback; };`;
  if (metadata.mode === "pixels") return new Function("input", `${prefix} const next = effect(pixels, app, color); return Array.isArray(next) ? next : pixels;`);
  if (metadata.mode === "rgba") return new Function("input", `${prefix} return pixels.map((row, y) => row.map((px, x) => { const rgba = parsePixel(px); if (!px && rgba.a === 0) return null; const next = effect(rgba.r, rgba.g, rgba.b, rgba.a, x, y, app, color); return normalizePixel(next, px); }));`);
  return new Function("input", `${prefix} return pixels.map((row, y) => row.map((px, x) => normalizePixel(effect(x, y, px, getPixel, app, color), px)));`);
}

let cachedKind = "";
let cachedCode = "";
let cachedRunner = null;

self.onmessage = async event => {
  const request = event.data || {};
  try {
    if (!cachedRunner || cachedKind !== request.kind || cachedCode !== request.code) {
      cachedKind = request.kind;
      cachedCode = request.code;
      cachedRunner = request.kind === "brush" ? compileBrush(String(request.code || "")) : compileEffect(String(request.code || ""));
    }
    const result = await cachedRunner(request.payload);
    self.postMessage({ id: request.id, result });
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error?.message || error).slice(0, 500) });
  }
};
