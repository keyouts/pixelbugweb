# Pixel Bug Beta

# If you're seeing this README on GitHub Pages, Pixel Bug is down for maintenance.

Pixel Bug Beta is a desktop pixel-art and sprite editor built with Electron.
---
[![Pixel Bug Beta Demo](https://img.youtube.com/vi/qi2VMMoDybs/maxresdefault.jpg)](https://youtu.be/qi2VMMoDybs)

## Features
[![Pixel Bug - Play Mode](https://img.youtube.com/vi/5ITtf6u3Zmo/maxresdefault.jpg)](https://youtu.be/5ITtf6u3Zmo)
- Pencil, eraser, fill, pick color, line, rectangle, and ellipse tools
- Layers with:
  - visibility
  - opacity
  - copy/delete
  - ordering controls
  - reference image import
- Animation frames with:
  - copy/delete
  - per-frame duration
- Onion skin preview
- Undo and redo
- Palette presets
- Image pixelizer with import to the active layer
- Voxel Preview with the ability to create .obj files compatible with blender
- Print Studio with various mockup options for stationery like washi tape, sticky notes, and art prints
- Local autosave
- Project save/open using `.pxbuild`
- PNG, spritesheet, and GIF export
- Play mode to mock up / export short interactive sidescrollers and dialogue
- Adjustable sidebar layout
- App icon support through:
  - `assets/icon.png`
  - `assets/icon.ico`

---

## Run

- Download Node.js if needed
- In project folder run cmd


```bash
npm install
npm start
```

---

## Build

```bash
npm run build
```

The application can take a few minutes to be ready - when built, there will be an ".exe" file in the dist folder. Click this to install the application.

---

## Shortcuts

| Shortcut | Action |
|---|---|
| `B` | Pencil |
| `E` | Eraser |
| `G` | Fill |
| `I` | Pick Color |
| `L` | Line |
| `R` | Rectangle |
| `O` | Ellipse |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + S` | Save Project |
| `Ctrl/Cmd + O` | Open Project |

## Remember to save and back up your projects!
---

## Privacy

Pixel Bug Beta stores autosave data and preferences locally on the device.

Imported images are processed locally.

Exports are only created when you choose a save or export option.

---

## License

GPL-3.0 

Remakes, forks, experiments, and modifications are encouraged under the GPL-3.0 license. If you distribute modified versions, please keep them open-source under the same license.
