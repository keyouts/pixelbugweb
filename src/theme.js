(() => {
  const root = document.documentElement;
  const query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const modeKey = "pixel-bug-interface-theme";

  function mode() {
    const stored = localStorage.getItem(modeKey);
    return ["system", "light", "dark", "custom"].includes(stored) ? stored : "system";
  }

  function applyTheme(theme) {
    if (mode() === "system") root.dataset.theme = theme === "dark" ? "dark" : "light";
  }

  function applyFallback() {
    applyTheme(query && query.matches ? "dark" : "light");
  }

  applyFallback();

  if (query) {
    const onChange = event => applyTheme(event.matches ? "dark" : "light");
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  if (window.pixelBug && window.pixelBug.getSystemTheme) {
    window.pixelBug.getSystemTheme().then(applyTheme).catch(applyFallback);
  }

  if (window.pixelBug && window.pixelBug.onSystemThemeChanged) {
    window.pixelBug.onSystemThemeChanged(applyTheme);
  }
})();
