(() => {
  function bytesToBase64(bytes) { let bin = ""; bytes.forEach(byte => bin += String.fromCharCode(byte)); return btoa(bin); }
  function base64ToBytes(text) { return Uint8Array.from(atob(text), char => char.charCodeAt(0)); }

  const pngCrcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function pngCrc32(bytes, start, length) {
    let c = 0xffffffff;
    for (let i = start; i < start + length; i++) c = pngCrcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function writeUint32(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
  }

  function makePngChunk(type, data) {
    const typeBytes = Uint8Array.from(type, char => char.charCodeAt(0));
    const chunk = new Uint8Array(12 + data.length);
    writeUint32(chunk, 0, data.length);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    writeUint32(chunk, 8 + data.length, pngCrc32(chunk, 4, 4 + data.length));
    return chunk;
  }

  function addPngDpiMetadata(base64, dpi) {
    const bytes = base64ToBytes(base64);
    if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) return base64;
    const pixelsPerMeter = Math.max(1, Math.round(dpi / 0.0254));
    const physData = new Uint8Array(9);
    writeUint32(physData, 0, pixelsPerMeter);
    writeUint32(physData, 4, pixelsPerMeter);
    physData[8] = 1;
    const physChunk = makePngChunk("pHYs", physData);
    const chunks = [bytes.slice(0, 8)];
    let offset = 8;
    let inserted = false;
    while (offset + 12 <= bytes.length) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const end = offset + 12 + length;
      if (end > bytes.length) return base64;
      if (type === "pHYs") {
        if (!inserted) { chunks.push(physChunk); inserted = true; }
      } else {
        chunks.push(bytes.slice(offset, end));
        if (type === "IHDR" && !inserted) { chunks.push(physChunk); inserted = true; }
      }
      offset = end;
    }
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(size);
    let writeAt = 0;
    for (const chunk of chunks) { output.set(chunk, writeAt); writeAt += chunk.length; }
    return bytesToBase64(output);
  }

  function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function gif332Palette() {
    const colors = [];
    for (let r = 0; r < 8; r++) {
      for (let g = 0; g < 8; g++) {
        for (let b = 0; b < 4; b++) {
          const rr = r << 5;
          const gg = g << 5;
          const bb = b << 6;
          colors.push(`#${[rr, gg, bb].map(value => value.toString(16).padStart(2, "0")).join("")}`);
        }
      }
    }
    return colors;
  }

  function gif332Index(hex) {
    const [r, g, b] = hexToRgb(hex || "#000000");
    return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
  }

  function collectPalette(frames) {
    const colors = ["#000000"];
    const seen = new Set(colors);
    frames.forEach(frame => frame.pixels.flat().forEach(color => {
      if (color && !seen.has(color) && colors.length < 256) {
        seen.add(color);
        colors.push(color);
      }
    }));
    while (colors.length < 256) colors.push("#000000");
    return colors;
  }

  function lzwEncode(indices, minCodeSize) {
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    const codeSize = minCodeSize + 1;
    const bits = [];
    const write = code => {
      for (let i = 0; i < codeSize; i++) bits.push((code >> i) & 1);
    };
    let sinceClear = 0;
    write(clear);
    indices.forEach(index => {
      if (sinceClear >= 240) {
        write(clear);
        sinceClear = 0;
      }
      write(index & (clear - 1));
      sinceClear++;
    });
    write(end);
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) if (bits[i + j]) byte |= 1 << j;
      bytes.push(byte);
    }
    return bytes;
  }

  function encodeGif(frames, width, height, options = {}) {
    const useFixed = options.palette === "rgb332";
    const palette = useFixed ? gif332Palette() : collectPalette(frames);
    const colorIndex = new Map();
    palette.forEach((color, index) => colorIndex.set(color, index));
    const out = [];
    const text = value => [...value].forEach(char => out.push(char.charCodeAt(0)));
    const word = value => { out.push(value & 255, (value >> 8) & 255); };
    text("GIF89a"); word(width); word(height); out.push(0xF7, 0, 0);
    palette.forEach(color => { const [r, g, b] = hexToRgb(color); out.push(r, g, b); });
    out.push(0x21, 0xFF, 11); text("NETSCAPE2.0"); out.push(3, 1, 0, 0, 0);
    frames.forEach(frame => {
      const transparent = options.transparent === true;
      out.push(0x21, 0xF9, 4, transparent ? 0x01 : 0x00);
      word(frame.delay); out.push(0, 0); out.push(0x2C); word(0); word(0); word(width); word(height); out.push(0); out.push(8);
      const indexes = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const color = frame.pixels[y]?.[x] || "#000000";
        indexes.push(useFixed ? gif332Index(color) : (colorIndex.get(color) ?? 0));
      }
      const data = lzwEncode(indexes, 8);
      for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); out.push(chunk.length, ...chunk); }
      out.push(0);
    });
    out.push(0x3B);
    return new Uint8Array(out);
  }

  const api = Object.freeze({ addPngDpiMetadata, base64ToBytes, bytesToBase64, encodeGif, hexToRgb, makePngChunk, writeUint32 });
  if (typeof globalThis !== "undefined") globalThis.PixelBugExportCodecs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
