(() => {
  "use strict";
  const Heightmap = globalThis.PixelBugTerrainHeightmap || require("../terrain-heightmap.js");
  const PaintLayers = globalThis.PixelBugTerrainPaintLayers || (typeof require === "function" ? require("../terrain-paint-layers.js") : null);
  const PreviewRenderer = globalThis.PixelBugTerrainPreviewRenderer || (typeof require === "function" ? require("./terrain-preview-renderer.js") : null);
  const Repeat = globalThis.PixelBugTileRepeatWorkflow || (typeof require === "function" ? require("./tile-repeat-workflow.js") : null);
  const Placement = globalThis.PixelBugTerrainPlacementResolver || (typeof require === "function" ? require("../terrain-placement-resolver.js") : null);
  const EditHistory = globalThis.PixelBugTerrainEditHistory || (typeof require === "function" ? require("../terrain-edit-history.js") : null);
  const DirtyRegions = globalThis.PixelBugTerrainDirtyRegions || (typeof require === "function" ? require("../terrain-dirty-regions.js") : null);
  const CanvasView = globalThis.PixelBugTerrainCanvasView || (typeof require === "function" ? require("../terrain-canvas-view.js") : null);

  function create({ getState, getTile, getProjectDimensions, getVoxelDimensions, getVoxelCount, applyTerrain, saveLocal, setStatus }) {
    const byId = id => document.getElementById(id);
    const details = byId("tile-terrain-details");
    const painter = byId("tile-terrain-paint");
    const preview = byId("tile-terrain-preview");
    const preview3d = byId("tile-terrain-3d");
    const mainOverlay = byId("tile-terrain-editor-overlay");
    const tileArt = byId("tile-terrain-editor-art");
    const focusBackdrop = byId("tile-terrain-focus-backdrop");
    const mainCanvas = byId("pixel-canvas");
    const brushCursor=byId("tile-terrain-brush-cursor");
    const layerSelect=byId("tile-terrain-active-layer"), layerValue=byId("tile-terrain-layer-value");
    const layerVisible = {height:byId("tile-terrain-visible-height"),biome:byId("tile-terrain-visible-biome"),material:byId("tile-terrain-visible-material")};
    const activeLayer=()=>layerSelect?.value || "height";
    const layerShown=(kind=activeLayer())=>layerVisible[kind]?.checked !== false;
    const mainToggle = byId("tile-terrain-main-layer");
    const focusToggle = byId("tile-terrain-focus-tile");
    const canvasHint = byId("tile-terrain-canvas-hint");
    const showArt = byId("tile-terrain-show-art");
    const opacity = byId("tile-terrain-opacity");
    const contours = byId("tile-terrain-contours"), labels = byId("tile-terrain-labels"), placementMode = byId("tile-terrain-placement");
    const LayerRenderer = globalThis.PixelBugTerrainLayerRenderer || (typeof require === "function" ? require("./terrain-layer-renderer.js") : null);
    let mainDragging = false, mainLast = null, mainChanged = false;
    let cameraAngle = -0.7, cameraZoom = 1, cameraTilt = 0.64, cameraDrag = null;
    const accessibilityStatus = byId("tile-terrain-accessibility-status");
    const announce = message => { if (accessibilityStatus) accessibilityStatus.textContent = message; };
    const keyboardPositions = new WeakMap();
    const summary = byId("tile-terrain-summary");
    const generate = byId("tile-terrain-generate");
    const inputs = {
      source: "tile-terrain-source", brush: "tile-terrain-brush", level: "tile-terrain-level", strength: "tile-terrain-strength",
      radius: "tile-terrain-radius", base: "tile-terrain-base", peak: "tile-terrain-peak", colorMode: "tile-terrain-colors",
      solid: "tile-terrain-solid", transparent: "tile-terrain-transparent",
      style: "tile-terrain-style", exactHeight: "tile-terrain-exact-height", detail: "tile-terrain-detail", terraces: "tile-terrain-terraces", seed: "tile-terrain-seed", strata: "tile-terrain-strata", biomePalette: "tile-terrain-biome-palette"
    };
    const history = EditHistory.create(40);
    const undoButton=byId("tile-terrain-undo"), redoButton=byId("tile-terrain-redo");
    let previewCache = null, previewSignature = null;
    let overlayIndex = null, overlaySignature = null, overlayLayoutSignature = null, overlayDataSignature = null;
    let tileArtSignature = null;
    const dirtyStamps = [];
    function queueDirty(hit,radius,individual){
      dirtyStamps.push({ tileId:hit.tile.id,placementKey:hit.placementKey,
        individual, w:hit.tile.w,h:hit.tile.h,x:hit.px,y:hit.py,radius });
      if(dirtyStamps.length>2048){dirtyStamps.length=0;overlaySignature=null;}
    }
    function invalidateOverlay(){overlaySignature=null;overlayDataSignature=null;dirtyStamps.length=0;}
    function buttons() { if(undoButton)undoButton.disabled=!history.canUndo();if(redoButton)redoButton.disabled=!history.canRedo(); }
    function valuesForKey(key) {
      const cut=key.indexOf("|"), kind=key.slice(0,cut), id=key.slice(cut+1), settings=terrain();
      if(kind==="height") return settings.heights?.[id]?.values || null;
      if(kind==="exact") return settings.exactHeights?.[id] || null;
      if(kind==="placement") return settings.placementHeights?.[id] || null;
      if(kind==="placementExact") return settings.placementExactHeights?.[id] || null;
      if(kind==="placementBiome")return settings.placementPaintLayers?.biome?.[id] || null;
      if(kind==="placementMaterial")return settings.placementPaintLayers?.material?.[id] || null;
      return settings.paintLayers?.[kind]?.[id] || null;
    }
    function historyAction(redo=false) {
      const changed=redo?history.redo(valuesForKey):history.undo(valuesForKey);
      if(changed){invalidateOverlay();markTerrainDirty();saveLocal();setStatus(redo?"Reapplied terrain brush stroke.":"Undid terrain brush stroke.");}
      buttons();return changed;
    }
    function terrainShortcut(event,redo=false){
      if (!visible() || ![mainOverlay,painter].includes(document.activeElement)) return false;
      historyAction(redo);return true;
    }
    function resolverFor(width,height){
      const state=getState(); return Placement.create({width,height,tiles:state.tilemap?.tiles || [],activeTileId:state.tilemap?.activeTileId,terrain:terrain(),repeat:state.tilemap?.repeat,planRepeat:Repeat.planRepeat,map:state.tilemap?.map});
    }
    function focusedTile(){ return focusToggle?.checked !== false && terrain().source !== "map" && !!tile(); }
    function canvasView(){
      const focused=focusedTile(),source=tile();
      const project=getProjectDimensions?.() || {width:Number(getState().width)||Number(getState().size)||32,
        height:Number(getState().height)||Number(getState().size)||32};
      return CanvasView.create({tile:source,focus:focused,projectWidth:project.width,projectHeight:project.height,
        layoutResolver:focused ? null : resolverFor(project.width,project.height)});
    }
    function positionCanvas(element,x,y,w,h){
      if(!element)return;
      element.style.left=`${x}px`;element.style.top=`${y}px`;
      element.style.width=`${w}px`;element.style.height=`${h}px`;
    }
    function drawTileArt(view){
      if(!tileArt)return;
      tileArt.hidden=!view.focused;
      if(!view.focused){tileArtSignature=null;return;}
      const source=tile();
      if(tileArt.width!==source.w)tileArt.width=source.w;
      if(tileArt.height!==source.h)tileArt.height=source.h;
      const signature=JSON.stringify([source.id,source.w,source.h,source.pixels,showArt?.checked,document.documentElement?.dataset?.theme]);
      if(signature===tileArtSignature)return;
      tileArtSignature=signature;
      const ctx=tileArt.getContext("2d");
      ctx.clearRect(0,0,source.w,source.h);
      ctx.fillStyle=document.documentElement?.dataset?.theme==="dark"?"#27303b":"#ebeeed";
      ctx.fillRect(0,0,source.w,source.h);
      if(showArt?.checked){for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
        const color=source.pixels?.[y]?.[x];if(color){ctx.fillStyle=color;ctx.fillRect(x,y,1,1);}
      }}
    }
    function targetFor(hit,kind,individual=false){
      const settings=terrain(),source=hit.tile;
      let values, key, exact=null, exactKey=null;
      if (kind === "height") {
        values=Heightmap.ensureHeights(settings,source); key=`height|${source.id}`;
        settings.exactHeights ||= {};
        exact=settings.exactHeights[source.id] ||= Array(source.w*source.h).fill(0); exactKey=`exact|${source.id}`;
        if(individual && hit.placementKey){
          settings.placementHeights ||= {}; settings.placementExactHeights ||= {};
          values=settings.placementHeights[hit.placementKey] ||= values.slice(); key=`placement|${hit.placementKey}`;
          exact=settings.placementExactHeights[hit.placementKey] ||= exact.slice(); exactKey=`placementExact|${hit.placementKey}`;
        }
      } else {
        if(individual && hit.placementKey){
          values=PaintLayers.placement(settings,kind,source,hit.placementKey);
          key=`${kind==="biome"?"placementBiome":"placementMaterial"}|${hit.placementKey}`;
        } else {values=PaintLayers.ensure(settings,kind,source);key=`${kind}|${source.id}`;}
      }
      return {values,key,exact,exactKey};
    }
    function stamp(hit,kind,erase){
      const source=hit.tile,settings=terrain(),target=targetFor(hit,kind,placementMode?.checked && settings.source==="repeat");
      history.touch(target.key,target.values);
      const brush=erase?"lower":settings.brush;
      const changed=kind==="height"?Heightmap.paint(target.values,source.w,source.h,hit.px,hit.py,{...settings,brush}):PaintLayers.paint(target.values,source.w,source.h,hit.px,hit.py,Number(settings.radius)||2,erase?0:Number(layerValue?.value)||0);
      let modified=changed;
      if(kind==="height" && (changed || settings.brush==="exact")){
        history.touch(target.exactKey,target.exact);
        const explicit=!erase && brush==="exact" ? Math.max(1,Math.min(64,Number(settings.exactHeight)||9)) : 0;
        modified=PaintLayers.paint(target.exact,source.w,source.h,hit.px,hit.py,Number(settings.radius)||2,explicit) || changed;
      }
      if(modified)queueDirty(hit,Math.max(1,Math.min(16,Number(settings.radius)||2)),placementMode?.checked && settings.source==="repeat");
      return modified;
    }
    // Frame batching
    let refreshPending = false;
    let terrainRevision = 0;
    let renderedRevision = -1;
    function markTerrainDirty() { terrainRevision++; scheduleRefresh(); }
    function scheduleRefresh() {
      if (refreshPending) return;
      refreshPending = true;
      const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : callback => setTimeout(callback, 16);
      schedule(() => { refreshPending = false; refresh(); });
    }
    let currentState = null;
    let dragging = false;
    let last = null;
    let savedStroke = false;

    function terrain() {
      const state = getState();
      if (!state.tilemap || typeof state.tilemap !== "object") state.tilemap = {};
      if (!state.tilemap.terrain) state.tilemap.terrain = Heightmap.normalize({}, state.tilemap.tiles || []);
      return state.tilemap.terrain;
    }
    function tile() { return getTile(); }
    function visible() { return !byId("tile-repeat-panel")?.hidden && !details.hidden && !!tile(); }

    function synchronizeInputs() {
      const settings = terrain();
      for (const [key, id] of Object.entries(inputs)) {
        const input = byId(id);
        if (!input || document.activeElement === input) continue;
        if (input.type === "checkbox") input.checked = settings[key] === true;
        else input.value = String(key === "peak" && settings.peak == null ? Math.min(64, settings.base + settings.relief) : settings[key]);
      }
      byId("tile-terrain-level-output").textContent = `${settings.level}%`;
      byId("tile-terrain-strength-output").textContent = `${settings.strength}%`;
      const dims = getVoxelDimensions();
      byId("tile-terrain-dimensions").textContent = `${dims.width} × ${dims.height} × ${dims.depth} voxel space · X/Y ground, Z elevation`;
    }

    function paintCanvas() {
      const source = tile();
      if (!source) return;
      const prior = keyboardPositions.get(painter);
      if(prior && (prior.x>=source.w || prior.y>=source.h))keyboardPositions.set(painter,{x:Math.min(prior.x,source.w-1),y:Math.min(prior.y,source.h-1)});
      const values = Heightmap.ensureHeights(terrain(), source);
      if (painter.width !== source.w) painter.width = source.w;
      if (painter.height !== source.h) painter.height = source.h;
      painter.style.aspectRatio = `${source.w} / ${source.h}`;
      const ctx = painter.getContext("2d");
      ctx.clearRect(0, 0, source.w, source.h);
      if (showArt?.checked) {
        for (let y=0;y<source.h;y++) for(let x=0;x<source.w;x++) {
          const color=source.pixels?.[y]?.[x];
          if(color) { ctx.fillStyle=color; ctx.fillRect(x,y,1,1); }
        }
      }
      const settings=terrain();
      for(const kind of ["height","biome","material"]){
        if(!layerShown(kind))continue;
        const mask=kind==="height"?null:PaintLayers.ensure(settings,kind,source);
        ctx.globalAlpha=showArt?.checked ? Number(opacity?.value||55)/100 : 1;
        for(let y=0;y<source.h;y++)for(let x=0;x<source.w;x++){
          const index=y*source.w+x;
          if(mask && !mask[index])continue;
          ctx.fillStyle=mask ? PaintLayers.palettes[kind][mask[index]] : Heightmap.biomeColor(values[index]);
          ctx.fillRect(x,y,1,1);
        }
      }
      ctx.globalAlpha = 1;
    }

    function mainEnabled() {
      return !!mainToggle?.checked && visible() && !["print-mode","play-mode","voxel-mode","mod-mode"].some(c=>document.body.classList.contains(c));
    }
    function updateMainOverlay() {
      if(!mainOverlay || !mainCanvas)return;
      mainOverlay.hidden=!mainEnabled();
      if(mainOverlay.hidden){if(brushCursor)brushCursor.hidden=true;if(tileArt)tileArt.hidden=true;if(focusBackdrop)focusBackdrop.hidden=true;return;}
      const view=canvasView(),width=view.width,height=view.height;
      const baseX=mainCanvas.offsetLeft+mainCanvas.clientLeft,baseY=mainCanvas.offsetTop+mainCanvas.clientTop;
      const bounds=view.focused ? CanvasView.fittedBox(mainCanvas.clientWidth,mainCanvas.clientHeight,width,height)
        : {x:0,y:0,width:mainCanvas.clientWidth,height:mainCanvas.clientHeight};
      if(focusBackdrop){
        focusBackdrop.hidden=!view.focused;
        if(view.focused)positionCanvas(focusBackdrop,baseX,baseY,mainCanvas.clientWidth,mainCanvas.clientHeight);
      }
      positionCanvas(mainOverlay,baseX+bounds.x,baseY+bounds.y,bounds.width,bounds.height);
      positionCanvas(tileArt,baseX+bounds.x,baseY+bounds.y,bounds.width,bounds.height);
      drawTileArt(view);
      if(mainOverlay.width!==width){mainOverlay.width=width;invalidateOverlay();overlayIndex=null;overlayLayoutSignature=null;}
      if(mainOverlay.height!==height){mainOverlay.height=height;invalidateOverlay();overlayIndex=null;overlayLayoutSignature=null;}
      if(canvasHint){canvasHint.textContent=terrain().source==="map"
        ? "Editing the Tilemap layout on the large canvas. Tile focus is available for repeated tiles."
        : view.focused ? "Large canvas: selected tile at full editing size. Uncheck Focus to paint the repeated layout."
          : "Large canvas: repeated placement layout. Check Focus to paint just the selected tile.";}
      if(focusToggle)focusToggle.disabled=terrain().source==="map";
      if(placementMode)placementMode.disabled=view.focused || terrain().source==="map";
      const ctx=mainOverlay.getContext("2d"),settings=terrain();
      const layout=JSON.stringify({width,height,focused:view.focused,tiles:getState().tilemap?.tiles,activeTileId:getState().tilemap?.activeTileId,
        repeat:getState().tilemap?.repeat,map:getState().tilemap?.map,source:settings.source,transparent:settings.transparent});
      const visualSignature=JSON.stringify({layout,opacity:opacity?.value,contours:contours?.checked,labels:labels?.checked,
        height:layerShown("height"),biome:layerShown("biome"),material:layerShown("material")});
      const dataSignature=JSON.stringify({heights:settings.heights,exactHeights:settings.exactHeights,
        placementHeights:settings.placementHeights,placementExactHeights:settings.placementExactHeights,
        paintLayers:settings.paintLayers,placementPaintLayers:settings.placementPaintLayers});
      const full=visualSignature!==overlaySignature || !overlayIndex || (!dirtyStamps.length && dataSignature!==overlayDataSignature)
        || !!contours?.checked || !!labels?.checked;
      if(full){
        if(layout!==overlayLayoutSignature || !overlayIndex){
          overlayIndex=DirtyRegions.create(view,width,height);
          overlayLayoutSignature=layout;
        }
        ctx.clearRect(0,0,width,height);
      }
      const resolver=overlayIndex ? null : view;
      const at=i=>overlayIndex ? overlayIndex.hits[i] : resolver.hit(i%width,Math.floor(i/width));
      const weightAt=(hit)=>{if(!hit)return null;const base=Heightmap.ensureHeights(settings,hit.tile);const arr=settings.placementHeights?.[hit.placementKey];return arr?.length===hit.tile.w*hit.tile.h?arr[hit.py*hit.tile.w+hit.px]:base[hit.py*hit.tile.w+hit.px];};
      let partial=null;
      if(!full && dirtyStamps.length && overlayIndex)partial=overlayIndex.affected(dirtyStamps);
      const redraw=full || (!partial && dirtyStamps.length>0);
      if(redraw || partial){
        const indices=partial || Array.from({length:width*height},(_,i)=>i);
        const alpha=Number(opacity?.value||55)/100;
        for(const i of indices){
          const x=i%width,y=Math.floor(i/width),hit=at(i);
          if(partial)ctx.clearRect(x,y,1,1);
          if(!hit)continue;
          const cell=hit.py*hit.tile.w+hit.px;
          for(const kind of ["height","biome","material"]){
            if(!layerShown(kind))continue;
            let color;
            if(kind==="height")color=Heightmap.biomeColor(weightAt(hit));
            else {const v=PaintLayers.valueAt(settings,kind,hit.tile,hit.placementKey,cell);if(!v)continue;color=PaintLayers.palettes[kind][v];}
            ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillRect(x,y,1,1);
          }
        }
        ctx.globalAlpha=1;
      }
      if(layerShown("height") && contours?.checked){
        ctx.fillStyle="rgba(14,24,32,.8)";
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
          const hit=at(y*width+x);if(!hit)continue;
          const a=Math.floor(weightAt(hit)/32);
          const left=x>0?weightAt(at(y*width+x-1)):null,above=y>0?weightAt(at((y-1)*width+x)):null;
          if(left!==null && a!==Math.floor(left/32) || above!==null && a!==Math.floor(above/32))ctx.fillRect(x,y,1,1);
        }
      }
      if(layerShown("height") && labels?.checked){
        ctx.font="4px monospace";ctx.textBaseline="top";
        const dims=getVoxelDimensions();
        for(let y=2;y<height;y+=12)for(let x=2;x<width;x+=12){
          const hit=at(y*width+x);if(!hit)continue;
          const weight=weightAt(hit),index=hit.py*hit.tile.w+hit.px;
          const exact=(settings.placementExactHeights?.[hit.placementKey]?.[index]||settings.exactHeights?.[hit.tile.id]?.[index])||0;
          const n=exact||Heightmap.heightFor(weight,settings,dims.depth);
          ctx.fillStyle="rgba(0,0,0,.85)";ctx.fillRect(x-1,y-1,9,6);ctx.fillStyle="#ffffff";ctx.fillText(String(n),x,y);
        }
      }
      overlaySignature=visualSignature;
      overlayDataSignature=dataSignature;
      dirtyStamps.length=0;
    }
    function mainPoint(event){
      const rect=mainOverlay.getBoundingClientRect();
      return {x:Math.floor((event.clientX-rect.left)*mainOverlay.width/Math.max(1,rect.width)),y:Math.floor((event.clientY-rect.top)*mainOverlay.height/Math.max(1,rect.height))};
    }
    function updateCursor(event){
      if(!brushCursor || !mainEnabled())return;
      const point=mainPoint(event);
      if(point.x<0 || point.y<0 || point.x>=mainOverlay.width || point.y>=mainOverlay.height){brushCursor.hidden=true;return;}
      const scale=mainOverlay.getBoundingClientRect().width/Math.max(1,mainOverlay.width);
      const r=Number(terrain().radius)||2;
      brushCursor.style.left=`${mainOverlay.offsetLeft+(point.x-r)*scale}px`;
      brushCursor.style.top=`${mainOverlay.offsetTop+(point.y-r)*scale}px`;
      brushCursor.style.width=`${(2*r+1)*scale}px`;
      brushCursor.style.height=`${(2*r+1)*scale}px`;
      brushCursor.hidden=false;
    }
    function showKeyboardCursor(point) {
      if (!brushCursor || !mainOverlay || !mainEnabled()) return;
      const width = Math.max(1, mainOverlay.width), height = Math.max(1, mainOverlay.height);
      const radius = Math.max(1, Math.min(16, Number(terrain().radius) || 2));
      const scaleX = mainOverlay.clientWidth / width, scaleY = mainOverlay.clientHeight / height;
      brushCursor.style.left = `${mainOverlay.offsetLeft + (point.x - radius) * scaleX}px`;
      brushCursor.style.top = `${mainOverlay.offsetTop + (point.y - radius) * scaleY}px`;
      brushCursor.style.width = `${(2 * radius + 1) * scaleX}px`;
      brushCursor.style.height = `${(2 * radius + 1) * scaleY}px`;
      brushCursor.hidden = false;
    }
    function keyboardPaint(canvas, point, erase = false) {
      if (canvas === mainOverlay && !mainEnabled()) return false;
      if (canvas === painter && !visible()) return false;
      const kind = activeLayer();
      const hit = canvas === mainOverlay ? canvasView().hit(point.x, point.y) : (
        tile() ? {tile:tile(),px:point.x,py:point.y,placementKey:null,x:point.x,y:point.y} : null
      );
      if (!hit) { announce(`Nothing to paint at column ${point.x + 1}, row ${point.y + 1}.`); return false; }
      history.begin();
      const changed = stamp(hit,kind,erase);
      history.commit(valuesForKey);
      buttons();
      if (changed) { markTerrainDirty(); saveLocal(); }
      const name = kind === "height" ? "elevation" : kind;
      announce(`${erase ? "Erased" : "Painted"} ${name} at column ${point.x + 1}, row ${point.y + 1}${changed ? ". Undo available." : ". No change."}`);
      return changed;
    }
    function terrainKeyboard(event,canvas) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      if (canvas === mainOverlay && !mainEnabled()) return;
      if (canvas === painter && !visible()) return;
      const width = canvas.width, height = canvas.height;
      if (!width || !height) return;
      const key = event.key, arrows = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if (!arrows[key] && !["Enter"," ","Spacebar"].includes(key)) return;
      event.preventDefault(); event.stopPropagation();
      const point = keyboardPositions.get(canvas) || {x:Math.floor(width/2),y:Math.floor(height/2)};
      point.x=Math.max(0,Math.min(width-1,point.x));
      point.y=Math.max(0,Math.min(height-1,point.y));
      if (arrows[key]) {
        const [dx,dy] = arrows[key];
        point.x = Math.max(0,Math.min(width-1,point.x+dx));
        point.y = Math.max(0,Math.min(height-1,point.y+dy));
        keyboardPositions.set(canvas,point);
        if (canvas === mainOverlay) showKeyboardCursor(point);
        announce(`Brush at column ${point.x + 1}, row ${point.y + 1}, ${activeLayer()} layer.`);
      } else keyboardPaint(canvas,point,event.shiftKey && activeLayer() !== "height");
    }
    function mainStroke(event){
      const point=mainPoint(event),from=mainLast||point,kind=activeLayer();
      const resolver=overlayIndex ? {hit:(x,y)=>x>=0&&y>=0&&x<overlayIndex.width&&y<overlayIndex.height?overlayIndex.hits[y*overlayIndex.width+x]:null}
        : canvasView();
      const steps=Math.max(1,Math.abs(point.x-from.x),Math.abs(point.y-from.y));
      let changed=false;
      for(let i=0;i<=steps;i++){
        const x=Math.round(from.x+(point.x-from.x)*i/steps),y=Math.round(from.y+(point.y-from.y)*i/steps);
        const hit=resolver.hit(x,y);if(!hit)continue;
        changed=stamp(hit,kind,event.buttons===2)||changed;
      }
      mainLast=point;
      if(changed){mainChanged=true;markTerrainDirty();}
    }
    function previewCanvas(columns, width, height) {
      const ctx = preview.getContext("2d");
      ctx.clearRect(0, 0, preview.width, preview.height);
      if (!columns || !columns.length) return;
      const buffer = document.createElement("canvas");
      buffer.width = width; buffer.height = height;
      const bctx = buffer.getContext("2d");
      const heights = columns.map((c,i)=>c?Heightmap.columnHeight(c,i%width,Math.floor(i/width),width,height,terrain(),previewCache?.depth || getVoxelDimensions().depth):0);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const item = columns[y * width + x];
        if (!item) continue;
        const weight = Heightmap.shapedWeight(item.weight, x, y, width, height, terrain());
        bctx.fillStyle = Heightmap.surfaceColor(item, weight, Heightmap.columnSlope(heights,x,y,width,height), terrain());
        bctx.fillRect(x, y, 1, 1);
        // Contour bands
        if ((x > 0 && columns[y * width + x - 1] && Math.floor(columns[y * width + x - 1].weight / 42) !== Math.floor(weight / 42)) ||
            (y > 0 && columns[(y - 1) * width + x] && Math.floor(columns[(y - 1) * width + x].weight / 42) !== Math.floor(weight / 42))) {
          bctx.fillStyle = "rgba(18,30,28,.60)";
          bctx.fillRect(x, y, 1, 1);
        }
      }
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(preview.width / width, preview.height / height);
      ctx.drawImage(buffer, (preview.width - width * scale) / 2, (preview.height - height * scale) / 2, width * scale, height * scale);
    }

    function build(withCubes = false) {
      const state = getState();
      const dims = getVoxelDimensions();
      const options = terrain();
      const size = dims.width * dims.height;
      if (size > 65536) return { error: "Voxel ground exceeds 65,536 columns. Resize Voxel Mode before creating terrain." };
      const columns = Heightmap.columns({ width: dims.width, height: dims.height, tiles: state.tilemap?.tiles || [],
        activeTileId: state.tilemap?.activeTileId, terrain: options, repeat: state.tilemap?.repeat,
        planRepeat: Repeat.planRepeat, map: state.tilemap?.map });
      const plan = Heightmap.voxelPlan(columns, dims.width, dims.height, dims.depth, options, Heightmap.MAX_VOXELS, withCubes);
      return { columns, plan, dims };
    }

    function renderCamera() {
      if (!previewCache || !preview3d) return;
      PreviewRenderer.render3d({ canvas: preview3d, ...previewCache, settings: terrain(), cameraAngle, cameraZoom, cameraTilt });
    }
    function refresh() {
      const state = getState();
      if (currentState !== state) { currentState = state; dragging = false; history.clear(); buttons(); terrainRevision++;invalidateOverlay();overlayIndex=null;overlayLayoutSignature=null; }
      if (!details || !tile()) {
        if (generate) generate.disabled = true;
        if (mainOverlay) mainOverlay.hidden = true;
        if (tileArt) tileArt.hidden = true;
        if (focusBackdrop) focusBackdrop.hidden = true;
        if (brushCursor) brushCursor.hidden = true;
        tileArtSignature = null;
        return;
      }
      if (!visible()) { if(mainOverlay)mainOverlay.hidden=true;if(tileArt)tileArt.hidden=true;if(focusBackdrop)focusBackdrop.hidden=true;if(brushCursor)brushCursor.hidden=true; return; }
      synchronizeInputs();
      paintCanvas();
      updateMainOverlay();
      // Cache invalidation
      
      const signature=JSON.stringify({tilemap:state.tilemap,dims:getVoxelDimensions()});
      if(signature!==previewSignature){previewSignature=signature;renderedRevision=-1;}
      const result = renderedRevision === terrainRevision && previewCache?.result ? previewCache.result : build();
      if (result.error) { summary.textContent = result.error; generate.disabled = true; return; }
      previewCanvas(result.columns, result.dims.width, result.dims.height);
      previewCache = { columns: result.columns, width: result.dims.width, height: result.dims.height, depth: result.dims.depth, result };
      renderedRevision = terrainRevision;
      renderCamera();
      const { plan } = result;
      const existing = getVoxelCount();
      generate.disabled = plan.overflow || !plan.voxelCount;
      summary.textContent = plan.overflow
        ? `Too many voxels (limit ${Heightmap.MAX_VOXELS.toLocaleString()}). Lower the highest point or use Surface only.`
        : `${plan.columnsCount.toLocaleString()} terrain columns · ${plan.voxelCount.toLocaleString()} voxels · ${existing ? `${existing.toLocaleString()} existing voxels will be preserved` : "empty Voxel Mode model"}`;
    }

    function location(event) {
      const rect = painter.getBoundingClientRect();
      return { x: Math.min(painter.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * painter.width / Math.max(1, rect.width)))),
        y: Math.min(painter.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * painter.height / Math.max(1, rect.height)))) };
    }
    function stroke(event) {
      const source=tile();if(!source)return;
      const point=location(event),from=last||point;
      const steps=Math.max(1,Math.abs(point.x-from.x),Math.abs(point.y-from.y));
      let changed=false;
      for(let i=0;i<=steps;i++){
        const px=Math.round(from.x+(point.x-from.x)*i/steps),py=Math.round(from.y+(point.y-from.y)*i/steps);
        changed=stamp({tile:source,px,py,placementKey:null},activeLayer(),event.buttons===2)||changed;
      }
      last=point;
      if(changed){savedStroke=true;markTerrainDirty();}
    }
    function finish(event){
      if(!dragging)return;
      dragging=false;last=null;
      if(event?.pointerId!=null && painter.hasPointerCapture?.(event.pointerId))painter.releasePointerCapture(event.pointerId);
      const committed=history.commit(valuesForKey);buttons();
      if(committed){saveLocal();setStatus("Terrain brush stroke saved. Undo is available.");}
      savedStroke=false;
    }
    function makeTerrain() {
      // Fresh generation
      const result = build(true);
      if (result.error) return setStatus(result.error);
      if (!result.plan?.voxelCount || result.plan.overflow) return setStatus("No valid terrain to generate. Adjust height settings or tile placement.");
      const existing = getVoxelCount();
      if (existing && !window.confirm(`Generate terrain into Voxel Mode? Existing ${existing.toLocaleString()} voxels will not be replaced. New voxels fill only empty positions, and the operation is undoable.`)) return;
      const changed = applyTerrain(result.plan.cubes);
      if (changed) { saveLocal(); setStatus(`Generated ${changed.toLocaleString()} terrain voxels from painted tile elevations. Undo available in Voxel Mode.`); }
      else setStatus("Terrain positions already contain voxels. No existing voxels were changed.");
    }
    function setup() {
      if (!details || !painter) return;
      const updateLayerControls=()=>{
        const kind=activeLayer();
        if(layerValue){layerValue.hidden=kind==="height";layerValue.setAttribute("aria-label",kind+" paint value");
          layerValue.replaceChildren();
          if(kind!=="height")for(const [i,name] of (kind==="biome"?["Automatic","Lush","Arid","Alpine","Coastal"]:["Automatic","Rock","Sand","Clay","Snow"]).entries()){
            const option=document.createElement("option");option.value=String(i);option.textContent=name;layerValue.appendChild(option);
          }
        }
        refresh();
      };
      layerSelect?.addEventListener("change",updateLayerControls);
      Object.values(layerVisible).forEach(control=>control?.addEventListener("change",refresh));
      updateLayerControls();
      for (const control of [mainToggle,focusToggle,showArt,opacity,contours,labels,placementMode]) {
        control?.addEventListener("input",()=>{if(opacity)byId("tile-terrain-opacity-value").textContent=`${opacity.value}%`;refresh();});
      }
      for (const surface of [mainOverlay,painter]) {
        surface?.addEventListener("keydown",event=>terrainKeyboard(event,surface));
        surface?.addEventListener("focus",()=>{
          const point=keyboardPositions.get(surface) || {x:Math.floor(surface.width/2),y:Math.floor(surface.height/2)};
          keyboardPositions.set(surface,point);
          if(surface===mainOverlay)showKeyboardCursor(point);
          announce(`Terrain keyboard editing, ${activeLayer()} layer. Arrow keys move the brush; Space or Enter paints.`);
        });
        surface?.addEventListener("blur",()=>{if(surface===mainOverlay && brushCursor)brushCursor.hidden=true;});
      }
      mainOverlay?.addEventListener("pointerdown",e=>{if(!mainEnabled()||(e.button!==0&&e.button!==2))return;e.preventDefault();mainDragging=true;mainLast=null;mainChanged=false;history.begin();mainOverlay.focus({preventScroll:true});mainOverlay.setPointerCapture(e.pointerId);mainStroke(e);});
      mainOverlay?.addEventListener("pointermove",e=>{updateCursor(e);if(mainDragging){e.preventDefault();mainStroke(e);}});
      mainOverlay?.addEventListener("pointerleave",()=>{if(brushCursor && !mainDragging)brushCursor.hidden=true;});
      const finishMain=e=>{if(!mainDragging)return;mainDragging=false;mainLast=null;if(mainOverlay.hasPointerCapture(e.pointerId))mainOverlay.releasePointerCapture(e.pointerId);if(history.commit(valuesForKey)){saveLocal();setStatus("Terrain layer updated; original pixel artwork unchanged. Undo available.");}buttons();mainChanged=false;};
      mainOverlay?.addEventListener("pointerup",finishMain);
      mainOverlay?.addEventListener("pointercancel",finishMain);
      mainOverlay?.addEventListener("lostpointercapture",finishMain);
      mainOverlay?.addEventListener("contextmenu",e=>e.preventDefault());
      if(typeof ResizeObserver!=="undefined"&&mainCanvas) new ResizeObserver(()=>{if(mainEnabled())updateMainOverlay();}).observe(mainCanvas);
      for (const [key, id] of Object.entries(inputs)) {
        const input = byId(id);
        input.addEventListener("input", event => {
          const current = terrain();
          current[key] = input.type === "checkbox" ? event.target.checked : event.target.value;
          const preserved = current.heights;
          const normalized = Heightmap.normalize(current, getState().tilemap?.tiles || []);
          normalized.heights = preserved;
          normalized.placementHeights = current.placementHeights || {};
          normalized.paintLayers = current.paintLayers || {};
          normalized.placementPaintLayers = current.placementPaintLayers || {};
          normalized.exactHeights = current.exactHeights || {};
          normalized.placementExactHeights = current.placementExactHeights || {};
          if((key==="exactHeight" || key==="brush") && normalized.brush==="exact"){
            normalized.base=Math.min(normalized.base,normalized.exactHeight);
            normalized.peak=Math.max(normalized.peak??normalized.base+normalized.relief,normalized.exactHeight);
          }
          getState().tilemap.terrain = normalized;
          invalidateOverlay();markTerrainDirty();
        });
        input.addEventListener("change", saveLocal);
      }
      painter.addEventListener("pointerdown", event => {
        if (event.button !== 0 && event.button !== 2) return;
        if (!tile()) return;
        event.preventDefault(); dragging = true; last = null; savedStroke = false;
        history.begin();painter.focus({preventScroll:true});painter.setPointerCapture?.(event.pointerId);
        stroke(event);
      });
      painter.addEventListener("pointermove", event => { if (dragging) { event.preventDefault(); stroke(event); } });
      painter.addEventListener("pointerup", finish);
      painter.addEventListener("pointercancel", finish);
      painter.addEventListener("lostpointercapture", finish);
      painter.addEventListener("contextmenu", event => event.preventDefault());
      byId("tile-terrain-reset").addEventListener("click", () => {
        const source = tile(); if (!source) return;
        if (!window.confirm(`Reset painted elevations for ${source.name}? This only clears its terrain weights, not its pixel artwork.`)) return;
        const settings=terrain(), values=Heightmap.ensureHeights(settings,source);
        history.begin();history.touch(`height|${source.id}`,values);values.fill(Heightmap.DEFAULT_VALUE);
        settings.exactHeights ||= {};const exact=settings.exactHeights[source.id] ||= Array(values.length).fill(0);
        history.touch(`exact|${source.id}`,exact);exact.fill(0);
        history.commit(valuesForKey);buttons();invalidateOverlay();markTerrainDirty();saveLocal();setStatus("Reset selected tile's elevation weights (undo available).");
      });
      if (preview3d) {
        preview3d.addEventListener("keydown",event=>{
          if(event.ctrlKey || event.altKey || event.metaKey) return;
          const key=event.key;
          if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-","_","0"].includes(key))return;
          event.preventDefault();event.stopPropagation();
          if(key==="ArrowLeft")cameraAngle-=.12;
          else if(key==="ArrowRight")cameraAngle+=.12;
          else if(key==="ArrowUp")cameraTilt=Math.max(.2,cameraTilt-.08);
          else if(key==="ArrowDown")cameraTilt=Math.min(1.2,cameraTilt+.08);
          else if(key==="+" || key==="=")cameraZoom=Math.min(3,cameraZoom*1.1);
          else if(key==="-" || key==="_")cameraZoom=Math.max(.4,cameraZoom/1.1);
          else {cameraAngle=-.7;cameraTilt=.64;cameraZoom=1;}
          renderCamera();
          announce(key==="0"?"Terrain camera reset.":"Terrain camera adjusted.");
        });
        preview3d.addEventListener("pointerdown", e => { cameraDrag={x:e.clientX,y:e.clientY}; preview3d.setPointerCapture(e.pointerId); });
        preview3d.addEventListener("pointermove", e => { if(!cameraDrag)return; cameraAngle+=(e.clientX-cameraDrag.x)*.012; cameraTilt=Math.max(.2,Math.min(1.2,cameraTilt+(e.clientY-cameraDrag.y)*.006));cameraDrag={x:e.clientX,y:e.clientY};renderCamera(); });
        preview3d.addEventListener("pointerup",()=>{cameraDrag=null;});
        preview3d.addEventListener("pointercancel",()=>{cameraDrag=null;});
        preview3d.addEventListener("wheel",e=>{e.preventDefault();cameraZoom=Math.max(.4,Math.min(3,cameraZoom*(e.deltaY>0?.9:1.1)));renderCamera();},{passive:false});
        byId("tile-terrain-camera-reset")?.addEventListener("click",()=>{cameraAngle=-.7;cameraTilt=.64;cameraZoom=1;renderCamera();});
      }
      undoButton?.addEventListener("click",()=>historyAction(false));
      redoButton?.addEventListener("click",()=>historyAction(true));
      generate.addEventListener("click", makeTerrain);
    }
    return Object.freeze({ setup, refresh, terrainShortcut });
  }
  const api = Object.freeze({ create });
  if (typeof globalThis !== "undefined") globalThis.PixelBugTerrainPaintWorkflow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
