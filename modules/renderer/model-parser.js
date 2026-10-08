(() => {
  function create(options = {}) {
    const rgbToHex = options.rgbToHex;
    const documentRef = options.documentRef || (typeof document !== "undefined" ? document : null);
    const imageBitmap = options.createImageBitmapFn || (typeof createImageBitmap === "function" ? createImageBitmap : null);
    const TextDecoderCtor = options.TextDecoderCtor || (typeof TextDecoder === "function" ? TextDecoder : null);
    const maxModelFileBytes = options.maxModelFileBytes;
    const maxModelExtraBytes = options.maxModelExtraBytes;
    const maxModelTexturePixels = options.maxModelTexturePixels;
    const maxModelTriangles = options.maxModelTriangles;

    function clampColorByte(value) {
      return Math.max(0, Math.min(255, Math.round(value)));
    }

    function modelRgbToHex(r, g, b) {
      return rgbToHex(clampColorByte(r), clampColorByte(g), clampColorByte(b));
    }

    function modelHexToRgb(hex) {
      const n = parseInt(String(hex || "#8c8c8c").slice(1), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }

    function parseObjVertex(parts) {
      const point = { x: Number(parts[1]), y: Number(parts[2]), z: Number(parts[3]) };
      if (parts.length >= 7) {
        const raw = parts.slice(4, 7).map(Number);
        if (raw.every(Number.isFinite)) {
          const scaled = raw.some(value => value > 1) ? raw : raw.map(value => value * 255);
          point.color = modelRgbToHex(scaled[0], scaled[1], scaled[2]);
        }
      }
      return point;
    }

    function parseMtlMaterials(text) {
      const materials = new Map();
      let current = null;
      text.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        const parts = trimmed.split(/\s+/);
        if (!parts[0] || parts[0].startsWith("#")) return;
        const tag = parts[0].toLowerCase();
        if (tag === "newmtl") {
          current = parts.slice(1).join(" ");
          if (current) materials.set(current, { color: null, textureName: null, textureCanvas: null });
          return;
        }
        if (!current) return;
        const material = materials.get(current) || { color: null, textureName: null, textureCanvas: null };
        if (["kd", "ka"].includes(tag) && !material.color) {
          const color = parts.slice(1, 4).map(Number);
          if (color.every(Number.isFinite)) material.color = modelRgbToHex(color[0] * 255, color[1] * 255, color[2] * 255);
        }
        if (tag === "map_kd") material.textureName = parts.slice(1).join(" ").split(/[\\/]/).pop();
        materials.set(current, material);
      });
      return materials;
    }

    function averageHexColors(colors) {
      const picked = colors.filter(Boolean);
      if (!picked.length) return null;
      const totals = picked.reduce((sum, hex) => {
        const rgb = modelHexToRgb(hex);
        sum.r += rgb.r;
        sum.g += rgb.g;
        sum.b += rgb.b;
        return sum;
      }, { r: 0, g: 0, b: 0 });
      return modelRgbToHex(totals.r / picked.length, totals.g / picked.length, totals.b / picked.length);
    }

    function averageVertexColor(face) {
      return averageHexColors(face.map(point => point.color));
    }

    async function imageFileToCanvas(file) {
      if (!file || typeof imageBitmap !== "function") return null;
      try {
        if (file.size > maxModelExtraBytes) return null;
        const bitmap = await imageBitmap(file);
        if (bitmap.width * bitmap.height > maxModelTexturePixels) { bitmap.close?.(); return null; }
        if (!documentRef?.createElement) { bitmap.close?.(); return null; }
      const canvas = documentRef.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(bitmap, 0, 0);
        return canvas;
      } catch (_error) {
        return null;
      }
    }

    async function attachModelTextures(materials, files) {
      const images = new Map();
      for (const file of files) {
        if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) continue;
        const canvas = await imageFileToCanvas(file);
        if (canvas) images.set(file.name.split(/[\\/]/).pop().toLowerCase(), { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) });
      }
      materials.forEach(material => {
        if (!material?.textureName) return;
        material.textureCanvas = images.get(material.textureName.toLowerCase()) || null;
      });
    }

    function sampleTextureColor(textureEntry, uvs) {
      if (!textureEntry || !uvs.length) return null;
      const textureCanvas = textureEntry.canvas || textureEntry;
      const context = textureEntry.ctx || textureCanvas.getContext("2d", { willReadFrequently: true });
      const colors = [];
      uvs.forEach(uv => {
        const u = ((Number(uv.u) % 1) + 1) % 1;
        const v = ((Number(uv.v) % 1) + 1) % 1;
        const x = Math.max(0, Math.min(textureCanvas.width - 1, Math.round(u * (textureCanvas.width - 1))));
        const y = Math.max(0, Math.min(textureCanvas.height - 1, Math.round((1 - v) * (textureCanvas.height - 1))));
        const data = context.getImageData(x, y, 1, 1).data;
        if (data[3] > 16) colors.push(modelRgbToHex(data[0], data[1], data[2]));
      });
      return averageHexColors(colors);
    }

    function parseObjModel(text, materials = new Map()) {
      const vertices = [];
      const uvs = [];
      const triangles = [];
      let activeMaterial = null;
      text.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const parts = trimmed.split(/\s+/);
        const tag = parts[0].toLowerCase();
        if (tag === "v") vertices.push(parseObjVertex(parts));
        if (tag === "vt") uvs.push({ u: Number(parts[1]), v: Number(parts[2]) });
        if (tag === "usemtl") activeMaterial = parts.slice(1).join(" ");
        if (tag === "f") {
          const refs = parts.slice(1).map(part => {
            const bits = part.split("/");
            return { vertex: Number(bits[0]), uv: Number(bits[1]) };
          }).filter(ref => Number.isFinite(ref.vertex));
          for (let index = 1; index < refs.length - 1; index++) {
            const faceRefs = [refs[0], refs[index], refs[index + 1]];
            const face = faceRefs.map(ref => vertices[ref.vertex - 1]).filter(Boolean);
            if (face.length !== 3) continue;
            const material = materials.get(activeMaterial) || null;
            const faceUvs = faceRefs.map(ref => uvs[ref.uv - 1]).filter(Boolean);
            const textureColor = sampleTextureColor(material?.textureCanvas, faceUvs);
            if (triangles.length < maxModelTriangles) triangles.push({ points: face, color: averageVertexColor(face) || textureColor || material?.color || null });
          }
        }
      });
      return triangles;
    }

    function parseStlModel(text) {
      const points = [...text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/gi)].map(match => ({ x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) }));
      const triangles = [];
      for (let index = 0; index + 2 < points.length && triangles.length < maxModelTriangles; index += 3) triangles.push({ points: [points[index], points[index + 1], points[index + 2]], color: null });
      return triangles;
    }

    function stlAttributeColor(attribute) {
      if (!(attribute & 0x8000)) return null;
      const r = (attribute & 0x1f) * 255 / 31;
      const g = ((attribute >> 5) & 0x1f) * 255 / 31;
      const b = ((attribute >> 10) & 0x1f) * 255 / 31;
      return modelRgbToHex(r, g, b);
    }

    function parseBinaryStlModel(buffer) {
      const view = new DataView(buffer);
      if (buffer.byteLength < 84) return [];
      const count = view.getUint32(80, true);
      if (84 + count * 50 > buffer.byteLength) return [];
      const triangles = [];
      for (let index = 0; index < count && triangles.length < maxModelTriangles; index++) {
        const offset = 84 + index * 50 + 12;
        const face = [];
        for (let vertex = 0; vertex < 3; vertex++) {
          const pointOffset = offset + vertex * 12;
          face.push({ x: view.getFloat32(pointOffset, true), y: view.getFloat32(pointOffset + 4, true), z: view.getFloat32(pointOffset + 8, true) });
        }
        triangles.push({ points: face, color: stlAttributeColor(view.getUint16(84 + index * 50 + 48, true)) });
      }
      return triangles;
    }

    function trianglePoints(triangle) {
      return Array.isArray(triangle) ? triangle : triangle.points;
    }

    function normalizeModelTriangles(triangles) {
      const points = triangles.flatMap(trianglePoints);
      const bounds = points.reduce((box, point) => ({ minX: Math.min(box.minX, point.x), maxX: Math.max(box.maxX, point.x), minY: Math.min(box.minY, point.y), maxY: Math.max(box.maxY, point.y), minZ: Math.min(box.minZ, point.z), maxZ: Math.max(box.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const cz = (bounds.minZ + bounds.maxZ) / 2;
      const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ, 1);
      return triangles.map(triangle => ({ color: triangle.color || null, points: trianglePoints(triangle).map(point => ({ x: (point.x - cx) / span, y: (point.y - cy) / span, z: (point.z - cz) / span, color: point.color || null })) }));
    }

    async function parseModelFile(fileOrFiles) {
      const files = Array.from(fileOrFiles?.length !== undefined ? fileOrFiles : [fileOrFiles]).filter(Boolean);
      const modelFile = files.find(file => /\.(obj|stl)$/i.test(file.name));
      if (!modelFile) throw new Error("Upload an OBJ or STL model file first.");
      if (modelFile.size > maxModelFileBytes) throw new Error("Model file is too large. Use a smaller OBJ/STL under 12 MB.");
      const mtlFiles = files.filter(file => /\.mtl$/i.test(file.name) && file.size <= maxModelExtraBytes).slice(0, 8);
      const materials = new Map();
      for (const mtlFile of mtlFiles) parseMtlMaterials(await mtlFile.text()).forEach((value, key) => materials.set(key, value));
      await attachModelTextures(materials, files);
      let triangles = [];
      if (modelFile.name.toLowerCase().endsWith(".obj")) {
        triangles = parseObjModel(await modelFile.text(), materials);
      } else {
        const buffer = await modelFile.arrayBuffer();
        triangles = parseBinaryStlModel(buffer);
        if (!triangles.length && TextDecoderCtor) triangles = parseStlModel(new TextDecoderCtor().decode(buffer));
      }
      if (!triangles.length) throw new Error("No triangles found. OBJ, ASCII STL, and binary STL files are supported.");
      return normalizeModelTriangles(triangles);
    }

    return Object.freeze({ normalizeModelTriangles, parseBinaryStlModel, parseModelFile, parseObjModel, parseStlModel });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugModelParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
