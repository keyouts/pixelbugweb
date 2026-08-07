const MAX_PSD_BYTES = 128 * 1024 * 1024;
const MAX_PSD_PIXELS = 25 * 1024 * 1024;
const MAX_PSD_DIMENSION = 30000;

// Binary helpers
function asBytes(value) {
  if (Buffer.isBuffer(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new Error("Invalid PSD data");
}

function readUint16(view, offset) {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error("PSD data is incomplete");
  return view.getUint16(offset, false);
}

function readUint32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error("PSD data is incomplete");
  return view.getUint32(offset, false);
}

function skipSection(view, offset) {
  const length = readUint32(view, offset);
  const next = offset + 4 + length;
  if (!Number.isSafeInteger(next) || next > view.byteLength) throw new Error("PSD section is incomplete");
  return next;
}

// RLE decoding
function decodePackBitsRow(source, start, length, target, targetOffset, width) {
  const end = start + length;
  const targetEnd = targetOffset + width;
  let sourceOffset = start;
  let outputOffset = targetOffset;
  if (start < 0 || length < 0 || end > source.length) throw new Error("PSD row is incomplete");
  while (sourceOffset < end) {
    const marker = source[sourceOffset++];
    const signedMarker = marker > 127 ? marker - 256 : marker;
    if (signedMarker >= 0) {
      const count = signedMarker + 1;
      if (sourceOffset + count > end || outputOffset + count > targetEnd) throw new Error("PSD row is invalid");
      target.set(source.subarray(sourceOffset, sourceOffset + count), outputOffset);
      sourceOffset += count;
      outputOffset += count;
    } else if (signedMarker >= -127) {
      const count = 1 - signedMarker;
      if (sourceOffset >= end || outputOffset + count > targetEnd) throw new Error("PSD row is invalid");
      target.fill(source[sourceOffset++], outputOffset, outputOffset + count);
      outputOffset += count;
    }
  }
  if (outputOffset !== targetEnd) throw new Error("PSD row size is invalid");
}

function decodePlanes(bytes, view, offset, compression, width, height, channels, requiredChannels) {
  const pixelCount = width * height;
  const planes = Array.from({ length: requiredChannels }, () => new Uint8Array(pixelCount));
  if (compression === 0) {
    const totalBytes = pixelCount * channels;
    if (!Number.isSafeInteger(totalBytes) || offset + totalBytes > bytes.length) throw new Error("PSD image data is incomplete");
    for (let channel = 0; channel < channels; channel++) {
      if (channel < requiredChannels) planes[channel].set(bytes.subarray(offset, offset + pixelCount));
      offset += pixelCount;
    }
    return planes;
  }
  if (compression !== 1) throw new Error("This PSD compression is not supported. Save the file with RLE compression and try again.");
  const rowCount = channels * height;
  const tableBytes = rowCount * 2;
  if (!Number.isSafeInteger(tableBytes) || offset + tableBytes > bytes.length) throw new Error("PSD row table is incomplete");
  const rowLengths = new Uint32Array(rowCount);
  for (let row = 0; row < rowCount; row++) rowLengths[row] = readUint16(view, offset + row * 2);
  offset += tableBytes;
  for (let channel = 0; channel < channels; channel++) {
    for (let row = 0; row < height; row++) {
      const rowLength = rowLengths[channel * height + row];
      if (channel < requiredChannels) decodePackBitsRow(bytes, offset, rowLength, planes[channel], row * width, width);
      else if (offset + rowLength > bytes.length) throw new Error("PSD row is incomplete");
      offset += rowLength;
    }
  }
  return planes;
}

// Color conversion
function convertPlanes(planes, width, height, colorMode, colorChannels) {
  const pixelCount = width * height;
  const rgba = new Uint8Array(pixelCount * 4);
  const alpha = planes[colorChannels];
  if (colorMode === 1) {
    const gray = planes[0];
    for (let index = 0, output = 0; index < pixelCount; index++, output += 4) {
      const value = gray[index];
      rgba[output] = value;
      rgba[output + 1] = value;
      rgba[output + 2] = value;
      rgba[output + 3] = alpha ? alpha[index] : 255;
    }
    return rgba;
  }
  if (colorMode === 3) {
    const red = planes[0];
    const green = planes[1];
    const blue = planes[2];
    for (let index = 0, output = 0; index < pixelCount; index++, output += 4) {
      rgba[output] = red[index];
      rgba[output + 1] = green[index];
      rgba[output + 2] = blue[index];
      rgba[output + 3] = alpha ? alpha[index] : 255;
    }
    return rgba;
  }
  const cyan = planes[0];
  const magenta = planes[1];
  const yellow = planes[2];
  const black = planes[3];
  for (let index = 0, output = 0; index < pixelCount; index++, output += 4) {
    rgba[output] = Math.round(cyan[index] * black[index] / 255);
    rgba[output + 1] = Math.round(magenta[index] * black[index] / 255);
    rgba[output + 2] = Math.round(yellow[index] * black[index] / 255);
    rgba[output + 3] = alpha ? alpha[index] : 255;
  }
  return rgba;
}

// PSD decoding
function decodePsdTemplate(value) {
  const bytes = asBytes(value);
  if (!bytes.length || bytes.length > MAX_PSD_BYTES) throw new Error("PSD file is too large");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== "8BPS") throw new Error("This file is not a valid PSD");
  const version = readUint16(view, 4);
  if (version !== 1) throw new Error("PSB files are not supported. Use a PSD file instead.");
  const channels = readUint16(view, 12);
  const height = readUint32(view, 14);
  const width = readUint32(view, 18);
  const depth = readUint16(view, 22);
  const colorMode = readUint16(view, 24);
  const colorChannels = colorMode === 1 ? 1 : colorMode === 3 ? 3 : colorMode === 4 ? 4 : 0;
  if (!colorChannels) throw new Error("Only grayscale, RGB, and CMYK PSD templates are supported");
  if (depth !== 8) throw new Error("Only 8-bit PSD templates are supported");
  if (channels < colorChannels || channels > 56) throw new Error("PSD channel data is invalid");
  if (!width || !height || width > MAX_PSD_DIMENSION || height > MAX_PSD_DIMENSION) throw new Error("PSD dimensions are not supported");
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_PSD_PIXELS) throw new Error("PSD canvas is too large");
  let offset = 26;
  offset = skipSection(view, offset);
  offset = skipSection(view, offset);
  offset = skipSection(view, offset);
  const compression = readUint16(view, offset);
  offset += 2;
  const requiredChannels = colorChannels + (channels > colorChannels ? 1 : 0);
  const planes = decodePlanes(bytes, view, offset, compression, width, height, channels, requiredChannels);
  return { width, height, rgba: convertPlanes(planes, width, height, colorMode, colorChannels) };
}

module.exports = { decodePsdTemplate };
