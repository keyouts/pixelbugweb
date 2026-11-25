"use strict";

// Session controls
(function attachPlaySessionControls(root, factory) {
  const api = Object.freeze({ ...factory(), standaloneSource: `(${factory.toString()})()` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlaySessionControls = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlaySessionControls() {
  function mount(options) {
    const { session, document, window, capture, restore, recordEnabled, sceneModes, gameId, legacyGameId, container, savePortable } = options;
    if (typeof document?.createElement !== "function" || typeof document?.querySelector !== "function") return { receive() {} };
    const panel = document.createElement("section");
    if (typeof panel?.setAttribute !== "function") return { receive() {} };
    panel.setAttribute("aria-label", "Save and session replay controls");
    panel.className = "game-session-controls";
    panel.innerHTML = `<div role="group" aria-label="Game saves">
      <label for="session-slot">Save slot</label><select id="session-slot" aria-label="Choose save slot"><option value="1">Slot 1</option><option value="2">Slot 2</option><option value="3">Slot 3</option></select>
      <button type="button" data-action="save">Save game</button><button type="button" data-action="load">Load game</button>
      <button type="button" data-action="delete">Delete save</button><button type="button" data-action="save-file">Download save file</button>
      <button type="button" data-action="import-save">Import save file</button><input class="session-visually-hidden" type="file" accept=".pbsave,application/json" id="session-save-file" aria-label="Select saved game file"/></div>
      <div role="group" aria-label="Game recording and replay"><button type="button" data-action="record" aria-pressed="false">Start recording</button>
      <button type="button" data-action="stop-record">Stop recording</button><button type="button" data-action="replay">Replay session</button>
      <button type="button" data-action="stop-replay">Stop replay</button><button type="button" data-action="replay-file">Download replay</button>
      <button type="button" data-action="import-replay">Import replay</button><input class="session-visually-hidden" type="file" accept=".pbreplay,application/json" id="session-replay-file" aria-label="Select replay file"/></div>
      <p role="status" aria-live="polite" class="session-message">Three game save slots and session recording available.</p>`;
    const style=options.inlineStyles===false?null:document.createElement("style");
    if(style)style.textContent=`.game-session-controls{margin:12px auto;padding:12px;border:2px solid #829aa0;border-radius:7px;max-width:900px;font:14px system-ui;background:#20343b;color:#fff}.game-session-controls div{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:9px}.game-session-controls button,.game-session-controls select{padding:8px;border-radius:4px;border:1px solid #bed7d7;color:#fff;background:#354952;cursor:pointer}.game-session-controls :focus-visible{outline:3px solid #ffe073;outline-offset:2px}.session-visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`;
    if(style)document.head.appendChild(style);
    (container || document.querySelector("main"))?.appendChild(panel);
    const status=panel.querySelector(".session-message");
    const notify=value=>{status.textContent=String(value).slice(0,180);};
    let storage;
    try{storage=window.localStorage;}catch{storage={getItem(){return null;},setItem(){throw new Error("Storage is unavailable.");},removeItem(){}};}
    const store=session.createStorage(storage,gameId);
    const legacyStore=legacyGameId && legacyGameId!==gameId ? session.createStorage(storage,legacyGameId) : null;
    if(legacyStore && [1,2,3].some(number=>legacyStore.present(number))){
      const action=document.createElement("button");
      action.type="button";action.dataset.action="legacy-load";
      action.textContent="Recover older save";
      action.setAttribute("aria-label","Recover an older title-based save after confirming its identity");
      panel.querySelector('[role="group"]').appendChild(action);
    }
    function allowLegacy(){
      return typeof window.confirm==="function" && window.confirm("Older saves identify projects only by title and scene list. This may belong to another project. Recover it here?");
    }
    function decodeImported(data,kind){
      try{return kind==="save"?session.unpackSave(data,sceneModes,gameId):session.unpackTape(data,sceneModes,gameId);}
      catch(error){
        if(!legacyStore || !/belongs to a different game/.test(String(error.message)))throw error;
        if(!allowLegacy())throw new Error("Legacy import cancelled.");
        return kind==="save"?session.unpackSave(data,sceneModes,legacyGameId):session.unpackTape(data,sceneModes,legacyGameId);
      }
    }
    let recorder=null,lastTape=null,playing=false,replayTimer=null,originalState=null,disposed=false;
    function slot(){return Number(panel.querySelector("#session-slot").value);}
    async function download(source,name){
      if (typeof savePortable === "function") {
        const saved=await savePortable(source,"pixelbug-"+name);
        if (saved === false) throw new Error("File export cancelled.");
        return;
      }
      const url=URL.createObjectURL(new Blob([source],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download="pixelbug-"+name;
      document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),5000);
    }
    function stopRecord(){
      if(!recorder)return;
      lastTape=recorder.stop();recorder=null;recordEnabled(false);
      panel.querySelector('[data-action="record"]').setAttribute("aria-pressed","false");
      notify("Recording stopped with "+lastTape.frames.length+" frames.");
    }
    function stopReplay(restoreOriginal=true){
      if(replayTimer!==null){window.clearInterval(replayTimer);replayTimer=null;}
      if(!playing)return;
      playing=false;
      if(restoreOriginal&&originalState)restore(originalState,false);
      originalState=null;
    }
    function receive(type,details){
      if(type==="frame"&&recorder){
        try{if(!recorder.push(details.state)){stopRecord();notify("Recording limit reached.");}}
        catch{stopRecord();notify("Recording frame could not be validated.");}
      }
    }
    async function importFile(file,kind){
      if(!file||disposed)return;
      if(file.size>session.MAX_TAPE_BYTES+256)throw new Error("Imported file exceeds limit.");
      const data=await file.text();
      if(disposed)return;
      if(kind==="save"){
        stopReplay(false);stopRecord();restore(decodeImported(data,"save"),false);notify("Saved game imported.");
      }else{lastTape=decodeImported(data,"replay");notify("Replay imported ("+lastTape.frames.length+" frames).");}
    }
    panel.addEventListener("click",async event=>{
      const action=event.target.closest("button[data-action]")?.dataset.action;
      if(!action||disposed)return;
      try{
        if(action==="save"){store.save(slot(),capture(),sceneModes);notify("Saved to slot "+slot()+".");}
        if(action==="load"){
          const state=store.load(slot(),sceneModes);
          if(!state)throw new Error("Save slot is empty.");stopReplay(false);stopRecord();restore(state,false);notify("Slot "+slot()+" loaded.");
        }
        if(action==="delete"){store.erase(slot());notify("Slot "+slot()+" deleted.");}
        if(action==="legacy-load"){
          if(!legacyStore?.present(slot()))throw new Error("Older save slot is empty.");
          if(!allowLegacy())throw new Error("Legacy recovery cancelled.");
          const state=legacyStore.load(slot(),sceneModes);
          if(!state)throw new Error("Older save slot is empty.");
          store.save(slot(),state,sceneModes);
          stopReplay(false);stopRecord();restore(state,false);
          notify("Older save recovered to slot "+slot()+".");
        }
        if(action==="save-file"){await download(session.packSave(capture(),sceneModes,gameId),"save.pbsave");notify("Save file exported.");}
        if(action==="import-save")panel.querySelector("#session-save-file").click();
        if(action==="record"){
          if(playing)throw new Error("Stop replay first.");
          if(recorder){stopRecord();return;}
          recorder=session.createRecorder(sceneModes);recorder.push(capture());recordEnabled(true);
          panel.querySelector('[data-action="record"]').setAttribute("aria-pressed","true");
          notify("Recording. Maximum ten minutes at 30 frames per second.");
        }
        if(action==="stop-record")stopRecord();
        if(action==="replay"){
          if(!lastTape)throw new Error("No recording available.");
          stopRecord();stopReplay(false);originalState=capture();playing=true;
          let index=0;restore(lastTape.frames[index],true);
          replayTimer=window.setInterval(()=>{
            index++;
            if(index>=lastTape.frames.length){stopReplay(true);notify("Replay finished.");return;}
            restore(lastTape.frames[index],true);
          },1000/30);
          notify("Replaying "+lastTape.frames.length+" recorded frames.");
        }
        if(action==="stop-replay"){stopReplay();notify("Replay stopped.");}
        if(action==="replay-file"){
          if(!lastTape)throw new Error("No recording available.");
          await download(session.packTape(lastTape,sceneModes,gameId),"replay.pbreplay");notify("Replay file exported.");
        }
        if(action==="import-replay")panel.querySelector("#session-replay-file").click();
      }catch(error){notify(error.message||error);}
    });
    for(const [id,kind] of [["session-save-file","save"],["session-replay-file","replay"]]){
      const input=panel.querySelector("#"+id);
      input.addEventListener("change",async()=>{
        try{await importFile(input.files?.[0],kind);}catch(error){notify(error.message||error);}
        finally{input.value="";}
      });
    }
    return { receive, stopRecord, stopReplay, panel, get playing(){return playing;},
      dispose(){ disposed=true; stopRecord(); stopReplay(false); panel.remove(); style?.remove(); } };
  }
  return { mount };
});
