(() => {
  const defaults = Object.freeze({ color: "#000000", showGrid: true, showOnion: true });

  function create(options = {}) {
    const storage = options.storage || globalThis.localStorage;
    const storageKey = options.storageKey || "pixel-bug-editor-preferences";

    function normalize(value = {}) {
      return {
        color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : defaults.color,
        showGrid: value.showGrid !== false,
        showOnion: value.showOnion !== false
      };
    }

    function load() {
      try {
        return normalize(JSON.parse(storage.getItem(storageKey) || "{}"));
      } catch (_error) {
        return { ...defaults };
      }
    }

    function save(value = {}) {
      const next = { color: value.color, showGrid: value.showGrid, showOnion: value.showOnion };
      try { storage.setItem(storageKey, JSON.stringify(next)); } catch (_error) {}
      return next;
    }

    return Object.freeze({ load, save });
  }

  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugEditorPreferences = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
