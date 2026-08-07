(() => {
  function positive(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function whole(value, fallback = 1) {
    return Math.max(1, Math.floor(positive(value, fallback)));
  }

  function calculate(options = {}) {
    const projectWidth = whole(options.projectWidth);
    const projectHeight = whole(options.projectHeight);
    const availableWidth = whole(options.availableWidth);
    const availableHeight = whole(options.availableHeight);
    const maxDisplay = whole(options.maxDisplay, 1024);
    const fitScale = Math.min(
      maxDisplay / projectWidth,
      maxDisplay / projectHeight,
      availableWidth / projectWidth,
      availableHeight / projectHeight
    );
    const integerScale = Math.max(1, Math.floor(fitScale));
    const integerUse = fitScale >= 1 ? integerScale / fitScale : 1;
    const displayScale = fitScale < 1 ? 1 : integerUse < 0.85 ? fitScale : integerScale;
    const renderScale = Math.max(1, Math.min(
      Math.ceil(displayScale),
      Math.floor(maxDisplay / projectWidth) || 1,
      Math.floor(maxDisplay / projectHeight) || 1
    ));
    const displayWidth = Math.max(1, Math.floor(projectWidth * displayScale));
    const displayHeight = Math.max(1, Math.floor(projectHeight * displayScale));
    const renderWidth = projectWidth * renderScale;
    const renderHeight = projectHeight * renderScale;
    const overflowX = displayWidth > availableWidth;
    const overflowY = displayHeight > availableHeight;
    return Object.freeze({
      availableHeight,
      availableWidth,
      displayHeight,
      displayScale,
      displayWidth,
      overflow: overflowX || overflowY,
      overflowX,
      overflowY,
      pixelScale: renderScale,
      projectHeight,
      projectWidth,
      renderHeight,
      renderScale,
      renderWidth
    });
  }

  const api = Object.freeze({ calculate });
  if (typeof globalThis !== "undefined") globalThis.PixelBugCanvasFit = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
