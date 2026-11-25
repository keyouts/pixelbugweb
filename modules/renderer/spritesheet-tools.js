(() => {
  "use strict";

  function integer(value, min, max, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}.`);
    return number;
  }

  function layout(imageWidth, imageHeight, settings = {}, maxFrames = 240) {
    const width = integer(imageWidth, 1, 16384, "Image width");
    const height = integer(imageHeight, 1, 16384, "Image height");
    const cellWidth = integer(settings.cellWidth, 1, 512, "Frame width");
    const cellHeight = integer(settings.cellHeight, 1, 512, "Frame height");
    const margin = integer(settings.margin ?? 0, 0, 4096, "Margin");
    const spacing = integer(settings.spacing ?? 0, 0, 4096, "Spacing");
    const order = settings.order === "column" ? "column" : "row";
    const usableWidth = width - margin * 2;
    const usableHeight = height - margin * 2;
    if (usableWidth < cellWidth || usableHeight < cellHeight) throw new Error("Frame size does not fit inside the spritesheet margins.");
    const columns = Math.floor((usableWidth + spacing) / (cellWidth + spacing));
    const rows = Math.floor((usableHeight + spacing) / (cellHeight + spacing));
    if (!columns || !rows) throw new Error("No complete frames fit in the spritesheet.");
    const total = columns * rows;
    if (total > maxFrames) throw new Error(`Spritesheet contains ${total} frames; the project limit is ${maxFrames}.`);
    const cells = [];
    if (order === "column") {
      for (let column = 0; column < columns; column++) for (let row = 0; row < rows; row++) cells.push({ x: margin + column * (cellWidth + spacing), y: margin + row * (cellHeight + spacing), w: cellWidth, h: cellHeight, row, column });
    } else {
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) cells.push({ x: margin + column * (cellWidth + spacing), y: margin + row * (cellHeight + spacing), w: cellWidth, h: cellHeight, row, column });
    }
    return Object.freeze({ cellWidth, cellHeight, columns, rows, total, order, cells });
  }

  const api = Object.freeze({ layout });
  if (typeof globalThis !== "undefined") globalThis.PixelBugSpritesheetTools = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
