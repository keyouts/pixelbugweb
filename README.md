# Pixel Bug Beta

Pixel Bug Beta is a desktop pixel-art, animation, voxel, print, and small-game editor built with Electron.

---
[![Pixel Bug Beta Demo](https://img.youtube.com/vi/qi2VMMoDybs/maxresdefault.jpg)](https://youtu.be/qi2VMMoDybs)

## Features
[![Pixel Bug - Play Mode](https://img.youtube.com/vi/5ITtf6u3Zmo/maxresdefault.jpg)](https://youtu.be/5ITtf6u3Zmo)

### Base Mode

- Pencil, eraser, magic eraser, fill, pick color, clone stamp, line, rectangle, ellipse, move, selection, and pixel text tools
- Adjustable brush size, symmetry, grid, onion skin, reference image, and story/reference views
- Rectangle, ellipse, lasso, polygon lasso, magic wand, and color-based selections
- Replace, add, subtract, and intersect selection modes
- Selection grow, shrink, fill, stroke, border, flip, rotate, move, resize, copy, cut, paste, and delete
- Nearest-neighbor Selection Transform with position, size, rotation, flip, frame scope, and layer scope controls
- Layer folders, visibility, opacity, ordering, alpha lock, clipping, merge, flatten, copy, and delete
- Layer color controls for hue, saturation, lightness, brightness, contrast, and gamma
- Layer blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, and Exclusion
- Animation frames with multi-select, copy, delete, reverse, frame duration, frame tags, and linked cels
- Animation clips with named ranges, loop, play once, ping-pong, and range timing
- Adjustable onion skin colors, opacity, and range
- Palette presets, color wheel, ramps, color extraction, sorting, remapping, import, GPL export, and text export
- Brush Lab for saved brushes and procedural dither, noise, cluster, hatch, selective eraser, and replace patterns
- Effects Stack with outline, shadow, dither, and palette limiting
- Pixel cleanup tools for replace color, color-to-transparent, threshold, posterize, gradient map, palette map, and seamless offsets
- Crop selection, trim content, resize canvas space, nearest-neighbor scaling, flip, and rotate
- Reusable selection tiles
- Tile Map Editor with layers, collision painting, tile flip/rotation, and Tiled JSON import/export
- Rearrangeable Base Mode panels

### Touch Toggle

- Compact touch layout for Base Mode
- One-finger drawing and two-finger canvas panning
- Left-handed layout option
- Touch-safe undo and redo handling
- Rearrange remains available in Touch Mode

### Image Tools

- Pixelize imported images and bring the result into the active layer
- 3D Model to Pixel Art converter
- OBJ, MTL, STL, and texture import for the 3D converter
- Six-view model conversion for front, back, left, right, top, and isometric layers
- Turntable model conversion for a chosen camera angle
- Model-color or single-ink output
- Quick Voxel Preview from Base Mode artwork

### Voxel Mode

- Slice-based voxel editor with a live 3D preview
- Front, right, back, left, top, bottom, and isometric views
- Orbit, pan, zoom, focus, reset, and turntable camera controls
- Paint, erase, fill, pick, surface paint, extrude, replace, select, box, line, sphere, and cylinder tools
- Adjustable voxel color, material, brush size, brush depth, shape style, and model origin
- Nearby-slice guides and filled-slice navigation
- Transfer between Base Mode frames and voxel slices
- Voxel selection copy, paste, duplicate, delete, recolor, select all, connected select, and same-color select
- Selection move, flip, rotate, scale, mirror copy, pivot, snap, and saved stamps
- Array, radial, noise, and hollow modifiers
- Parts system with add, duplicate, delete, assign selection, select voxels, solo, and part pivots
- Blender-style armature building with joint placement and endpoint extrusion
- Bone naming, roll, joint editing, insertion, dissolve, selection, and chain editing
- Auto Bind, Bind Paint, Weight Paint, rig checks, and pose controls
- Smooth pose deformation for connected voxel cells
- Quick pose reset and pose editing
- Voxel animation workspace with frames, playback, pose data, and animation export
- Import Voxel Preview or Voxel JSON
- Export Preview PNG, Transparent PNG, Spin GIF, Animation GIF, Animation Sheet, GLB, Blender Script, VOX, OBJ, STL, Voxel JSON, and Animation JSON
- Blender Script export supports the rigged voxel armature workflow

### Print Mode

- DPI and inch-based print sizing
- Bleed, safe area, page size, page margin, and resampling controls
- Presets for Single Art, Seamless Tile, Washi Strip, Stamp Washi, Sticker Sheet, and Memo Pad
- Repeat previews for patterns and stationery layouts
- Sticker rows, columns, gaps, and cutline preview
- Stamp-washi perforation, spacing, curl, edge, and roundness controls
- Custom print templates from PNG, JPG, SVG, and supported 8-bit PSD files
- Template placement behind artwork, above artwork, or as a preview-only guide
- Large Print Preview with a movable layer stack
- Import Base Mode layers as separate print layers
- Print layer move, resize, center, fit, rotate, flip, opacity, and ordering controls
- Print Undo and Redo
- Shift-drag axis locking and keyboard nudging
- Print blend modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, and Exclusion
- Nondestructive brightness, contrast, saturation, hue, grayscale, sepia, and invert controls
- Separate locked guides and cutline preview layers
- Export Print PNG, Cutline SVG, and Calibration PNG

### Play Mode

- Modular Builder, Scene, Player & World, Layers, Objects, Characters, Dialogue, and Rules workspaces
- Shared live game preview across Play workspaces
- Multiple scenes with add, duplicate, delete, names, starting items, and checkpoints
- Idle, walk, and jump player animation frames
- Scene size, world width, ground position, player scale, move speed, jump strength, and gravity controls
- Background image fitting, tiling, grid overlay, camera follow, and auto-scroll
- Multiple visual layers with scale, parallax, position, opacity, repeat, and visibility controls
- Place scene objects with scale, collision, ordering, reusable object presets, and scene transitions
- Object collision can respond to saved values
- Scene objects can start character interactions
- Character/NPC setup with sprite frame, position, scale, facing, and dialogue assignment
- Reusable dialogue and message text events with portraits, names, links, and optional typewriter reveal
- Visual Rule Editor for game logic
- Scene-scoped touch and character interaction rules, with older unscoped rules kept as Any Scene rules
- Rules can work with scene changes, dialogue, messages, variables, conditions, inventory, checkpoints, audio, and finish states
- Play Undo and Redo for authoring and Rule Editor changes
- Live tester with run, reset, pause, resume, step frame, interact, and center actor controls
- Keyboard and gamepad play testing
- Runtime Inspector for scene, player position, checkpoints, rules, values, and inventory
- Validate Game before export
- Export Scene PNG, Preview GIF, and standalone Tiny Game HTML

### Audio Studio

- Create simple game audio inside Pixel Bug
- Tone and noise waveforms including sine, square, triangle, sawtooth, and noise
- Create reusable audio cues
- Export generated audio as WAV
- Use saved audio assets in Play Mode rules

### Mod Mode

- Create Pixel Bug brush, effect, and Play UI mods
- Choose exactly which components are included in a mod package
- Permission controls for canvas reading, pixel changes, and Play UI changes
- Validate mods before install or export
- Safe test canvas with Undo, Redo, Clear, Reset Test, Stamp Center, and Use Current Canvas
- Test custom code or installed brushes and effects
- Nondestructive Live Effect preview
- Apply Effect Once to commit an effect to the test canvas
- Built-in brush and effect examples
- Load and test current Play UI settings
- Automatic Mod Mode draft saving
- Install a draft without exporting it
- Import and export `.pbmod` files

### Projects and Recovery

- Multiple open project tabs
- Local autosave
- Project save/open using `.pxbuild`
- Save As and Recent Projects
- Local project gallery
- Local project snapshots and restore points
- Rotating recovery backups
- Project Overview for large files, embedded assets, and memory-heavy features
- Command Palette for editor actions

### Export and Import

- PNG export
- Spritesheet export with columns, padding, margin, scale, trimming, and frame names
- Pixel Bug or Aseprite-style atlas JSON
- GIF export
- APNG export
- WebP export
- Project export
- Reusable export profiles and batch export
- Export Preflight before saving
- Import Atlas from PNG and JSON
- Import Sheet by frame width, frame height, margin, spacing, and row/column order

### Settings and Accessibility

- Interface scale from 80% to 200%
- System, light, dark, and custom interface palettes
- Save and reuse custom interface palettes
- Keyboard cursor crosshair and high-contrast cursor options
- Pointer stabilization for Base and Voxel painting
- Reduced motion
- Stronger focus outlines
- Larger control targets
- Interface font choices using local fonts
- Text size, weight, line spacing, and letter spacing controls
- Extra-bold text, increased contrast, reduced transparency, reduced shadows, and stronger active-tool highlighting
- Optional screen-reader action announcements
- Editable keyboard shortcuts with reserved shortcut checks

### Privacy and Safety

- Artwork and project data stay on the device
- Imported images are processed locally
- Exports are only created when you choose to save or export
- Mod code runs in a restricted process
- Recovery data is stored locally

### App Icons

- `assets/icon.png`
- `assets/icon.ico`

---

## Run

- Download Node.js if needed
- Open a command prompt in the project folder

```bash
npm install
npm start
```

---

## Build

```bash
npm run build
```

The build can take a few minutes. When it finishes, the installer `.exe` will be in the `dist` folder.

---

## Shortcuts

Shortcuts can be changed in Settings.

| Shortcut | Action |
|---|---|
| `B` | Pencil |
| `E` | Eraser |
| `K` | Magic Eraser |
| `G` | Fill |
| `I` | Pick Color |
| `C` | Clone Stamp |
| `L` | Line |
| `R` | Rectangle |
| `O` | Ellipse |
| `M` | Select |
| `V` | Move |
| `T` | Text |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + Y` | Redo |
| `Ctrl/Cmd + C` | Copy Selection |
| `Ctrl/Cmd + X` | Cut Selection |
| `Ctrl/Cmd + V` | Paste Selection |
| `Delete` | Delete Selection |
| `Escape` | Unselect |
| `Ctrl/Cmd + S` | Save Project |
| `Ctrl/Cmd + Shift + S` | Save As |
| `Ctrl/Cmd + O` | Open Project |
| `Ctrl/Cmd + K` | Commands |
| `Ctrl/Cmd + ,` | Settings |

## Remember to save and back up your projects!
---

## Privacy

Pixel Bug Beta stores autosave data, recovery files, and preferences locally on the device.

Imported images and project data are processed locally.

Exports are only created when you choose a save or export option.

---

## License

GPL-3.0

Remakes, forks, experiments, and modifications are encouraged under the GPL-3.0 license. If you distribute a modified version, keep it open-source under the same license.
