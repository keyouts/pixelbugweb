"use strict";
// Rig editor
// Asset persistence
(function attachVoxelRigEditor(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayVoxelRigEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVoxelRigEditor() {
  function mount(deps) {
    const $=id=>document.getElementById(id);
    const voxels=globalThis.PixelBugPlayVoxelAssets;
    const world=globalThis.PixelBugPlayVoxelWorld;
    const rigGeometry=globalThis.PixelBugVoxelCharacterGeometry;
    const select=$("play-rig-asset"),pose=$("play-rig-pose"),angle=$("play-rig-angle"),preview=$("play-rig-preview");
    const editor=$("play-voxel-rig-editor"),status=$("play-rig-status"),play=$("play-rig-play");
    let playing=false,timer=null,tick=0;
    const selected=()=>deps.playMode().voxelAssets?.find(item=>item.id===select?.value);
    function say(message) { if(status)status.textContent=message;deps.status(message); }
    function controls() {
      return rigGeometry.normalizeRig({ enabled:$("play-rig-enabled")?.checked,interpolate:$("play-rig-blend")?.checked,
        swing:Number($("play-rig-swing")?.value),bob:Number($("play-rig-bob")?.value) });
    }
    function setControls(asset) {
      const rig=rigGeometry.normalizeRig(asset?.rig);
      if ($("play-rig-enabled")) $("play-rig-enabled").checked=rig.enabled;
      if ($("play-rig-blend")) $("play-rig-blend").checked=rig.interpolate;
      if ($("play-rig-swing")) $("play-rig-swing").value=String(rig.swing);
      if ($("play-rig-bob")) $("play-rig-bob").value=String(rig.bob);
      if (pose) {
        const chosen=pose.value;
        pose.replaceChildren();pose.add(new Option("Base model",""));
        for (const p of asset?.poses || []) pose.add(new Option(p.name,p.id));
        pose.value=Array.from(pose.options).some(o=>o.value===chosen)?chosen:"";
      }
    }
    function refresh() {
      if (!select) return;
      const chosen=select.value;
      select.replaceChildren();
      select.add(new Option("Select a voxel asset",""));
      for (const asset of deps.playMode().voxelAssets || []) select.add(new Option(asset.name,asset.id));
      select.value=Array.from(select.options).some(o=>o.value===chosen)?chosen:"";
      if (!select.value && (deps.playMode().voxelAssets||[]).length) select.value=deps.playMode().voxelAssets[0].id;
      setControls(selected());draw();
    }
    function draw() {
      const ctx=preview?.getContext("2d");if (!ctx)return;
      const asset=selected();
      ctx.clearRect(0,0,preview.width,preview.height);
      if (!asset) {ctx.fillStyle="#3f5e64";ctx.fillText("Choose a voxel character",12,24);return;}
      const previewWorld=world.empty();
      previewWorld.width=4;previewWorld.depth=4;previewWorld.cellSize=112;
      previewWorld.cameraAngle=(Number(angle?.value)||0)*Math.PI/2;
      const actor={x:2,y:0,z:2,direction:"down",grounded:true,moving:playing,vx:playing?1:0,facing:1};
      const settings={voxelActorAssetId:asset.id,voxelIdlePoseId:pose?.value||"",
        voxelWalkPoseId:pose?.value||"",voxelIdlePoseClip:(asset.poses||[]).map(p=>p.id).join(","),
        voxelWalkPoseClip:(asset.poses||[]).map(p=>p.id).join(","),voxelPoseClipTicks:8,voxelRigPreview:controls()};
      const volume=voxels.actorVolume([asset],settings,actor,tick);
      world.draw(ctx,previewWorld,actor,volume,{follow:true,background:"#cee3e3",tick});
      ctx.fillStyle="#173c44";ctx.font="600 11px system-ui";
      ctx.fillText(`3D cells: ${volume?.cubes.length||0} · ${playing?"Moving":"Standing"}`,8,16);
    }
    function stop() { if (timer!==null)clearInterval(timer);timer=null;playing=false;if(play)play.textContent="Preview Walking";draw(); }
    select?.addEventListener("change",()=>{stop();setControls(selected());draw();});
    editor?.addEventListener("toggle",()=>{if(editor.open)refresh();else stop();});
    pose?.addEventListener("change",draw);angle?.addEventListener("change",draw);
    for(const id of ["play-rig-enabled","play-rig-blend","play-rig-swing","play-rig-bob"]) $(id)?.addEventListener("input",draw);
    play?.addEventListener("click",()=>{
      if(playing){stop();return;}
      if(!selected()){say("Select a reusable voxel asset first.");return;}
      playing=true;tick=0;play.textContent="Pause Walking";
      timer=setInterval(()=>{if(!preview?.isConnected||!editor?.open||!editor.getClientRects().length){stop();return;}tick++;draw();},1000/30);
    });
    $("play-rig-apply")?.addEventListener("click",()=>{
      if(deps.isRunning()){say("Stop Play Mode before modifying reusable assets.");return;}
      const asset=selected();if(!asset){say("Select a reusable voxel asset first.");return;}
      deps.history();asset.rig=controls();deps.refresh();
      say(`Updated the optional voxel rig for “${asset.name}”. Existing scene references remain intact.`);
    });
    return Object.freeze({refresh,stop});
  }
  return {mount};
});
