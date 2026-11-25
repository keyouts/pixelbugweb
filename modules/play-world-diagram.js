"use strict";
// Diagram presentation
(function attachPlayWorldDiagram(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorldDiagram = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayWorldDiagram() {
  const ns = "http://www.w3.org/2000/svg";
  let selectedSceneId = "", selectedLinkKey = "", selectedTarget = "", connectionFrom = "", connectionMode = "rule", previewRotation = 0;
  const create = (tag, klass = "", text = "") => {
    const element = document.createElement(tag);
    if (klass) element.className = klass;
    if (text) element.textContent = String(text);
    return element;
  };
  const button = (label, fn, cls = "") => {
    const element = create("button", cls, label); element.type = "button";
    element.addEventListener("click", fn);
    return element;
  };
  const option = (value, label) => { const element = create("option", "", label); element.value = value; return element; };
  function render(host, report, project, callbacks = {}) {
    if (!host || !report || !project) return;
    const model = typeof globalThis !== "undefined" ? globalThis.PixelBugPlayWorldDiagramModel : null;
    if (!model) return;
    const pm = project.playMode || {};
    const previews = globalThis.PixelBugPlayWorldPreview;
    const layouts = pm.nodeEditor?.worldPositions || {};
    const positions = model.positions(report.scenes, layouts);
    if (!report.scenes.some(scene => scene.id === selectedSceneId)) selectedSceneId = pm.activeSceneId || report.scenes[0]?.id || "";
    const keyed = report.links.map((link, index) => ({ ...link, key: model.linkKey(link) + ':' + (link.rootId || "") + ':' + index }));
    if (selectedLinkKey && !keyed.some(link => link.key === selectedLinkKey)) selectedLinkKey = "";
    const oldViewport = host.querySelector('.play-world-diagram-scroll');
    const scrollX = oldViewport?.scrollLeft || 0, scrollY = oldViewport?.scrollTop || 0;
    host.replaceChildren();
    const intro = create('p', 'control-hint', `${report.scenes.length} worlds · ${report.links.length} transitions · ${report.issues.length} binding checks. Drag Move handles to arrange worlds. Select arrows to edit their destinations. Layout is saved with the project.`);
    host.append(intro);
    const connectInfo = create('p','control-hint','Connect worlds: drag the + Connect handle onto another scene card, or select + Connect and then select the destination world. Escape cancels. Choose Rule-driven to add a trigger + Go to Scene rule, or 2D Portal for a native portal object.');
    host.append(connectInfo);
    const toolbar = create('div','play-world-diagram-toolbar');
    toolbar.append(button('Reset card layout', () => callbacks.resetLayout?.(), 'play-world-diagram-reset'));
    const modeField=create('label','play-world-diagram-mode');modeField.append(create('span','','New connection'));
    const modeSelect=create('select','play-world-diagram-connection-mode');
    modeSelect.append(option('rule','Touch → Go to Scene rule'),option('portal','Native 2D portal object'));
    modeSelect.value=connectionMode;
    modeSelect.addEventListener('change',()=>{connectionMode=modeSelect.value;});
    modeField.append(modeSelect);toolbar.append(modeField);
    if(connectionFrom)toolbar.append(button('Cancel connection',()=>{connectionFrom='';render(host,report,project,callbacks);},'play-world-diagram-cancel'));
    toolbar.append(create('span','control-hint','Blue: 2D sprites · Green: voxel worlds · Gold: selected route'));
    host.append(toolbar);
    const scroller = create('div', 'play-world-diagram-scroll');
    const help = create('p','sr-only','Use the Move button and arrow keys to position a world. Use Connect to choose a destination. Press Escape to cancel a connection. Select an arrow to edit its destination.');
    help.id = 'play-world-diagram-keyboard-help'; host.append(help);
    scroller.tabIndex = 0; scroller.setAttribute('aria-label','Interactive world diagram. Scroll horizontally to see additional worlds.');
    scroller.setAttribute('aria-describedby',help.id);
    const stage = create('div', 'play-world-diagram-stage');
    const size = model.dimensions(positions);
    stage.style.width = `${size.width}px`; stage.style.height = `${size.height}px`;
    const svg = document.createElementNS(ns,'svg');
    svg.setAttribute('class','play-world-diagram-arrows');
    svg.setAttribute('width',String(size.width)); svg.setAttribute('height',String(size.height));
    svg.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);
    svg.setAttribute('role','group'); svg.setAttribute('aria-label','Editable world transition arrows');
    const defs = document.createElementNS(ns,'defs');
    for (const [name,color] of [['rule','#527fa5'],['portal','#ae8150'],['selected','#e0a326']]) {
      const marker = document.createElementNS(ns,'marker');
      marker.setAttribute('id','play-world-arrow-'+name);
      marker.setAttribute('viewBox','0 0 10 10'); marker.setAttribute('refX','9'); marker.setAttribute('refY','5');
      marker.setAttribute('markerWidth','7'); marker.setAttribute('markerHeight','7'); marker.setAttribute('orient','auto-start-reverse');
      const triangle = document.createElementNS(ns,'path'); triangle.setAttribute('d','M 0 0 L 10 5 L 0 10 Z'); triangle.setAttribute('fill',color);
      marker.append(triangle); defs.append(marker);
    }
    svg.append(defs);
    const ghost=document.createElementNS(ns,'path');ghost.setAttribute('class','play-world-diagram-ghost');ghost.setAttribute('aria-hidden','true');
    const paths = [];
    const routeLane = new Map();
    const drawPaths = () => {
      const size = model.dimensions(positions);
      stage.style.width = `${size.width}px`; stage.style.height = `${size.height}px`;
      svg.setAttribute('width', String(size.width)); svg.setAttribute('height', String(size.height)); svg.setAttribute('viewBox',`0 0 ${size.width} ${size.height}`);
      for (const { link, path, lane } of paths) path.setAttribute('d',model.curve(link,positions,lane));
    };
    for (const link of keyed) {
      if (!positions[link.from] || !positions[link.to]) continue;
      const laneKey = link.from + ':' + link.to;
      const lane = routeLane.get(laneKey) || 0; routeLane.set(laneKey,lane+1);
      const path = document.createElementNS(ns,'path');
      path.setAttribute('data-link-key',link.key);
      path.setAttribute('class', `play-world-diagram-path${link.event === 'objectPortal' ? ' is-portal' : ''}${selectedLinkKey === link.key ? ' is-selected' : ''}`);
      path.setAttribute('d',model.curve(link,positions,Math.min(lane,6)));
      path.setAttribute('marker-end',`url(#play-world-arrow-${selectedLinkKey === link.key ? 'selected' : link.event === 'objectPortal' ? 'portal':'rule'})`);
      path.setAttribute('role','button'); path.setAttribute('tabindex','0');
      const source = report.scenes.find(scene=>scene.id===link.from);
      const destination = report.scenes.find(scene=>scene.id===link.to);
      const text = `${source?.name || link.from} to ${destination?.name || link.to}, ${link.event === 'objectPortal' ? 'object portal' : 'rule transition'}. Edit destination.`;
      path.setAttribute('aria-label',text);
      const choose = () => { selectedLinkKey=link.key; selectedSceneId=link.from; selectedTarget=''; render(host,report,project,callbacks); };
      path.addEventListener('click',choose);
      path.addEventListener('keydown',event=>{ if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();} });
      const title = document.createElementNS(ns,'title'); title.textContent=text; path.append(title);
      svg.append(path); paths.push({link,path,lane:Math.min(lane,6)});
    }
    svg.append(ghost);stage.append(svg);
    const finishConnection = (targetId) => {
      const from=connectionFrom;
      if(!from||!targetId||targetId===from)return false;
      const result=callbacks.createConnection?.(from,targetId,connectionMode);
      if(!result?.ok)return false;
      connectionFrom='';selectedSceneId=from;selectedLinkKey='';selectedTarget='';
      render(host,callbacks.analyze?.()||report,callbacks.getState?.()||project,callbacks);
      return true;
    };
    const pointerPosition=event=>{
      const rect=scroller.getBoundingClientRect();
      return {x:event.clientX-rect.left+scroller.scrollLeft,y:event.clientY-rect.top+scroller.scrollTop};
    };
    const dropScene=event=>{
      const element=document.elementFromPoint(event.clientX,event.clientY);
      const card=element?.closest?.('.play-world-diagram-card');
      return card && stage.contains(card)?card.dataset.sceneId:'';
    };
    function updateGhost(point) {
      const origin=positions[connectionFrom];if(!origin){ghost.setAttribute('d','');return;}
      const x=origin.x+model.CARD_W,y=origin.y+72;
      ghost.setAttribute('d',`M ${x} ${y} L ${Math.round(point.x)} ${Math.round(point.y)}`);
    }
    scroller.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&connectionFrom){event.preventDefault();connectionFrom='';ghost.setAttribute('d','');render(host,report,project,callbacks);}
    });
    for (const scene of report.scenes) {
      const card=create('section',`play-world-diagram-card ${scene.mode==='voxel3d'?'is-voxel':'is-2d'}${scene.id===pm.activeSceneId?' is-active':''}`);
      card.dataset.sceneId=scene.id;
      card.style.left=`${positions[scene.id].x}px`; card.style.top=`${positions[scene.id].y}px`;
      const heading=create('div','play-world-diagram-card-heading');
      const label=button(`${scene.mode==='voxel3d'?'3D Voxel':'2D Sprite'} · ${scene.name}`,()=>{
        if(connectionFrom){finishConnection(scene.id);return;}
        selectedSceneId=scene.id;selectedLinkKey='';selectedTarget='';
        callbacks.selectScene?.(scene.id);
        render(host,callbacks.analyze?.() || report,callbacks.getState?.() || project,callbacks);
      },'play-world-rule-scene');
      label.setAttribute('aria-pressed',String(scene.id===pm.activeSceneId));
      const handle=button('Move',()=>{},'play-world-diagram-handle');
      handle.setAttribute('aria-label',`Drag or use arrow keys to move ${scene.name} diagram card`);
      handle.title='Drag to arrange; arrow keys move by 20 pixels';
      let dragging=null;
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        event.preventDefault();event.stopPropagation();
        dragging={x:event.clientX,y:event.clientY,start:{...positions[scene.id]}};
        handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove',event=>{
        if(!dragging)return;
        positions[scene.id]={x:Math.max(12,Math.min(2400,dragging.start.x+event.clientX-dragging.x)),y:Math.max(12,Math.min(2400,dragging.start.y+event.clientY-dragging.y))};
        card.style.left=`${positions[scene.id].x}px`;card.style.top=`${positions[scene.id].y}px`;drawPaths();
      });
      const finish=()=>{
        if (!dragging)return;
        dragging=null;
        callbacks.moveScene?.(scene.id,positions[scene.id].x,positions[scene.id].y);
      };
      handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
      handle.addEventListener('keydown',event=>{
        const shifts={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};
        if(!shifts[event.key])return;
        event.preventDefault();
        positions[scene.id]={x:Math.max(12,Math.min(2400,positions[scene.id].x+shifts[event.key][0])),y:Math.max(12,Math.min(2400,positions[scene.id].y+shifts[event.key][1]))};
        card.style.left=`${positions[scene.id].x}px`;card.style.top=`${positions[scene.id].y}px`;drawPaths();
        callbacks.moveScene?.(scene.id,positions[scene.id].x,positions[scene.id].y);
      });
      heading.append(label,handle);card.append(heading);
      const connect=button('+ Connect',()=>{
        if(connectIgnoreClick){connectIgnoreClick=false;return;}
        if(connectionFrom && connectionFrom!==scene.id){finishConnection(scene.id);return;}
        connectionFrom=connectionFrom===scene.id?'':scene.id;
        ghost.setAttribute('d','');render(host,report,project,callbacks);
      },'play-world-diagram-connect');
      connect.setAttribute('aria-label',`Connect ${scene.name} to another world`);
      connect.title='Drag onto another world, or click and select a destination';
      let connecting=null,connectIgnoreClick=false;
      connect.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        event.stopPropagation();event.preventDefault();
        connecting={startX:event.clientX,startY:event.clientY,dragged:false};
        connect.setPointerCapture(event.pointerId);
      });
      connect.addEventListener('pointermove',event=>{
        if(!connecting)return;
        if(Math.hypot(event.clientX-connecting.startX,event.clientY-connecting.startY)>6){connecting.dragged=true;connectionFrom=scene.id;}
        if(connecting.dragged)updateGhost(pointerPosition(event));
        const hovered=dropScene(event);
        for(const cardElement of stage.querySelectorAll('.play-world-diagram-card'))
          cardElement.classList.toggle('is-drop-target',!!hovered&&hovered===cardElement.dataset.sceneId&&hovered!==scene.id);
      });
      connect.addEventListener('pointerup',event=>{
        if(!connecting)return;
        const dragged=connecting.dragged,target=dropScene(event);
        connecting=null;ghost.setAttribute('d','');
        if(dragged){connectIgnoreClick=true;if(finishConnection(target))return;render(host,report,project,callbacks);}
      });
      connect.addEventListener('pointercancel',()=>{connecting=null;ghost.setAttribute('d','');});
      connect.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&connectionFrom){connectionFrom='';render(host,report,project,callbacks);event.preventDefault();}
      });
      const counts=create('p','play-world-diagram-stats',`${scene.triggers.length} touch targets · ${scene.mode==='voxel3d'?`${scene.blocks} blocks`:`${scene.spriteFrames.length} player sprite references`}`);
      card.append(counts);
      const sceneIssues=report.issues.filter(issue=>issue.sceneId===scene.id);
      const liveScene=previews?.actualScene(pm,scene.id);
      if(liveScene){
        const mini=create('div','play-world-diagram-card-preview');
        const canvas=create('canvas','play-world-diagram-mini-canvas');canvas.width=200;canvas.height=106;
        const hotspots=previews.render(canvas,liveScene,callbacks,previewRotation);
        mini.append(canvas);
        const usedHotspots=[];
        function spreadHotspot(hotspot){
          const sx=hotspot.x*200,sy=hotspot.y*106;
          for(let ring=0;ring<5;ring++)for(let point=0;point<(ring?8:1);point++){
            const angle=point*Math.PI/4;
            const x=Math.max(13,Math.min(187,sx+Math.cos(angle)*ring*24));
            const y=Math.max(13,Math.min(93,sy+Math.sin(angle)*ring*24));
            if(usedHotspots.every(p=>Math.hypot(p.x-x,p.y-y)>23)){
              usedHotspots.push({x,y});return {x:x/200,y:y/106};
            }
          }
          return {x:hotspot.x,y:hotspot.y};
        }
        for(const hotspot of hotspots.slice(0,25)){
          const target=scene.triggers.find(item=>item.id===hotspot.id||item.aliases?.includes(hotspot.id));
          if(!target)continue;
          const chip=button('',()=>{selectedSceneId=scene.id;selectedLinkKey='';selectedTarget=target.id;render(host,report,project,callbacks);},'play-world-diagram-hotspot');
          const location=spreadHotspot(hotspot);
          chip.style.left=`${Math.round(location.x*100)}%`;chip.style.top=`${Math.round(location.y*100)}%`;
          chip.title=`Select ${hotspot.kind==='voxel'?'voxel marker':'sprite'}: ${hotspot.label}`;
          chip.setAttribute('aria-label',chip.title);chip.setAttribute('aria-pressed',String(selectedSceneId===scene.id&&selectedTarget===target.id));
          mini.append(chip);
        }
        card.append(mini);
      }
      const status=create('p',`play-world-diagram-health${sceneIssues.length?' has-issues':''}`,sceneIssues.length?`${sceneIssues.length} checks need attention`:'Bindings ready to inspect');
      card.append(status);
      const footer=create('div','play-world-diagram-card-actions');
      footer.append(button('Inspect targets',()=>{selectedSceneId=scene.id;selectedTarget='';selectedLinkKey='';render(host,report,project,callbacks);},'play-world-diagram-inspect'),connect);
      card.append(footer);
      stage.append(card);
    }
    scroller.append(stage);host.append(scroller);scroller.scrollLeft=scrollX;scroller.scrollTop=scrollY;
    const inspector=create('section','play-world-diagram-inspector');inspector.setAttribute('aria-label','World connection and binding inspector');
    const header=create('h4','', 'World & Transition Inspector'); inspector.append(header);
    const scene=report.scenes.find(item=>item.id===selectedSceneId) || report.scenes[0];
    const link=keyed.find(item=>item.key===selectedLinkKey);
    if (link) {
      const source=report.scenes.find(item=>item.id===link.from),dest=report.scenes.find(item=>item.id===link.to);
      inspector.append(create('p','control-hint',`${source?.name || link.from} → ${dest?.name || link.to} · ${link.event==='objectPortal'?'2D object portal':'Rule: '+(pm.nodeEditor?.nodes?.find(item=>item.id===link.rootId)?.name || link.rootId)}${link.crossDimension?' · 2D ↔ 3D':''}`));
      const field=create('label','play-world-diagram-field');field.append(create('span','','Destination world'));
      const select=create('select','play-world-route-destination');
      for(const item of report.scenes)select.append(option(item.id,`${item.mode==='voxel3d'?'3D':'2D'} · ${item.name}`));
      select.value=link.to;
      select.addEventListener('change',()=>{if(callbacks.editDestination?.(link,select.value)){render(host,callbacks.analyze?.() || report,callbacks.getState?.() || project,callbacks);} });
      field.append(select);inspector.append(field);
      const preview=create('div','play-world-diagram-preview');
      preview.append(create('strong','',`Destination preview · ${dest?.name || 'Missing world'}`));
      preview.append(create('p','',dest?`${dest.mode==='voxel3d'?`Voxel world · ${dest.width}×${dest.depth} cells · ${dest.blocks} blocks`:`2D sprite world · ${dest.width}×${dest.depth} px · ${dest.triggers.length} objects`}`:'The destination no longer exists.'));
      if(dest&&previews){
        const live=previews.actualScene(pm,dest.id);
        if(live){
          const canvas=create('canvas','play-world-diagram-large-preview');canvas.width=420;canvas.height=190;
          previews.render(canvas,live,callbacks,previewRotation);preview.append(canvas);
          if(dest.mode==='voxel3d')preview.append(button('Rotate 3D preview',()=>{previewRotation=(previewRotation+1)%4;render(host,report,project,callbacks);},'play-world-diagram-rotate'));
        }
      }
      inspector.append(preview);
      if(link.event==='objectPortal') {
        const coordFields=create('div','play-world-diagram-coordinates');
        for(const [axis, val] of [['X',link.entryX], [dest?.mode==='voxel3d'?'Z (ground depth)':'Y',link.entryY]]) {
          const inputLabel=create('label','play-world-diagram-field');inputLabel.append(create('span','',`Entry ${axis}`));
          const input=create('input');input.type='number';input.step='1';input.value=val==null?'':String(val);input.className='play-world-diagram-entry';
          inputLabel.append(input);coordFields.append(inputLabel);
        }
        const apply=button('Save entry coordinates',()=>{
          const inputs=coordFields.querySelectorAll('input');
          if(callbacks.editEntry?.(link,inputs[0].value,inputs[1].value))render(host,callbacks.analyze?.() || report,callbacks.getState?.() || project,callbacks);
        },'play-world-diagram-apply');
        inspector.append(coordFields,apply);
      }else inspector.append(create('p','control-hint','This destination is shared by every rule path that reaches the same Go to Scene node. To change conditions or entry events, edit that rule on the Rule Map.'));
      if(link.actionId) inspector.append(button('Edit Go to Scene rule',()=>callbacks.selectRule?.(link.actionId),'play-world-diagram-action'));
    } else if(scene) {
      inspector.append(create('p','control-hint',`${scene.mode==='voxel3d'?'3D voxel world':'2D sprite world'} · ${scene.triggers.length} touch targets. Choose a target to inspect or create an editable rule.`));
      const images=create('div','play-world-diagram-sprites');
      if(scene.mode!=='voxel3d') for(const [index,frameIndex] of scene.spriteFrames.entries()){
        const tile=create('div','play-world-diagram-sprite');
        const canvas=callbacks.getFrameCanvas?.(frameIndex);
        if(canvas?.width){const preview=create('canvas');preview.width=42;preview.height=42;preview.className='play-world-diagram-thumb';preview.getContext('2d')?.drawImage(canvas,0,0,42,42);tile.append(preview);}
        tile.append(create('span','',`${['Idle','Walk','Jump'][index]} · Frame ${frameIndex+1}`));images.append(tile);
      }
      if(images.childElementCount)inspector.append(images);
      const filter=create('input','play-world-diagram-filter');filter.type='search';filter.placeholder='Find sprite or voxel marker';
      filter.setAttribute('aria-label','Find sprite or voxel marker');inspector.append(filter);
      const targets=create('div','play-world-diagram-bindings');
      for(const target of scene.triggers.slice(0,128)) {
        const rules=model.boundRules(pm,scene,target);
        const targetButton=button(`${target.kind==='voxel'?'Voxel marker':'Sprite'}: ${target.name} · ${rules.length} rule${rules.length===1?'':'s'}`,()=>{
          selectedTarget=target.id;render(host,report,project,callbacks);
        },`play-world-diagram-target${selectedTarget===target.id?' is-selected':''}`);
        targetButton.setAttribute('aria-pressed',String(selectedTarget===target.id));targets.append(targetButton);
      }
      if(scene.triggers.length>128)targets.append(create('p','control-hint',`Showing first 128 of ${scene.triggers.length} targets.`));
      filter.addEventListener('input',()=>{
        const term=filter.value.toLowerCase();
        for(const candidate of targets.querySelectorAll('.play-world-diagram-target'))candidate.hidden=!candidate.textContent.toLowerCase().includes(term);
      });
      if(!scene.triggers.length)targets.append(create('p','control-hint','No touch targets yet. Place a sprite in 2D or a trigger marker in voxel mode.'));
      inspector.append(targets);
      const target=scene.triggers.find(item=>item.id===selectedTarget);
      if(target) {
        const bound=model.boundRules(pm,scene,target);
        inspector.append(create('p','control-hint',`Trigger ID: ${target.id}${target.kind==='voxel'?` · marker at ${target.x}, ${target.y}, ${target.z}`:` · Base drawing frame ${(target.frame||0)+1}`}`));
        for(const node of bound)inspector.append(button(`Edit rule · ${node.name || node.id}`,()=>callbacks.selectRule?.(node.id),'play-world-diagram-action'));
        inspector.append(button('Create touch rule for this target',()=>callbacks.createTouchRule?.(scene.id,target),'play-world-diagram-action'));
      }
      const issues=report.issues.filter(issue=>issue.sceneId===scene.id || (!issue.sceneId && !issue.ruleId));
      if(issues.length) {
        const list=create('ul','play-world-diagram-diagnostics');
        for(const issue of issues.slice(0,12)) {
          const item=create('li','',issue.message);
          if(issue.ruleId)item.append(button('Open rule',()=>callbacks.selectRule?.(issue.ruleId),'play-world-diagram-action'));
          list.append(item);
        }
        inspector.append(create('strong','',`Diagnostics (${issues.length})`),list);
      }else inspector.append(create('p','play-world-diagram-ok','No binding errors reported for this world.'));
    }
    host.append(inspector);
    const unmatched = report.issues.filter(issue => !report.scenes.some(scene => scene.id === issue.sceneId));
    if (unmatched.length) {
      const globalChecks=create('section','play-world-diagram-global-checks');
      globalChecks.setAttribute('role','status');
      globalChecks.append(create('strong','',`Project-wide diagnostics (${unmatched.length})`));
      const list=create('ul','play-world-diagram-diagnostics');
      for(const issue of unmatched.slice(0,20)) {
        const row=create('li','',issue.message);
        if(issue.ruleId)row.append(button('Open affected rule',()=>callbacks.selectRule?.(issue.ruleId),'play-world-diagram-action'));
        list.append(row);
      }
      globalChecks.append(list);host.append(globalChecks);
    }
    const routeList=create('details','play-world-diagram-route-list');routeList.open=true;
    const routeSummary=create('summary','',`All transitions (${keyed.length})`);routeList.append(routeSummary);
    if(!keyed.length)routeList.append(create('p','control-hint','No routes yet. Connect a Touch or Interact rule to Go to Scene, or add a portal to a 2D object.'));
    else for(const item of keyed.slice(0,90)){
      const src=report.scenes.find(s=>s.id===item.from),dest=report.scenes.find(s=>s.id===item.to);
      routeList.append(button(`${src?.name||item.from} → ${dest?.name||item.to}${item.crossDimension?' · 2D ↔ 3D':''} · ${item.event==='objectPortal'?item.origin:'Rule '+(pm.nodeEditor?.nodes?.find(n=>n.id===item.rootId)?.name||item.rootId)}`,()=>{
        selectedLinkKey=item.key;selectedSceneId=item.from;selectedTarget='';render(host,report,project,callbacks);
      },'play-world-diagram-route'));
    }
    host.append(routeList);
  }
  return { render };
});
