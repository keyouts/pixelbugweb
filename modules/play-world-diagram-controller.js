"use strict";
// Diagram controller
(function attachPlayWorldDiagramController(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorldDiagramController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayWorldDiagramController() {
  function render(ctx, bridge) {
    const host=ctx?.worldConnections, root=typeof globalThis!=="undefined"?globalThis:{};
    const diagram=root.PixelBugPlayWorldDiagram, map=root.PixelBugPlaySceneRuleMap;
    const model=root.PixelBugPlayWorldDiagramModel, author=root.PixelBugPlayWorldConnectionAuthoring;
    if (!host || !diagram || !map || !model || !author) return;
    const {api,graph,makeId,normalizeNode,renderAllContexts,select,setSelectedId,number} = bridge;
    const getState=()=>api?.getState?.();
    const analyze=()=>map.analyze(getState()?.playMode||{},getState()?.frames?.length||1);
    const change=(apply,success)=>{
      if (!getState()?.playMode) return false;
      api.beginHistory?.();
      if (!apply()) {api.rollbackHistory?.();return false;}
      api.capturePlayScene?.();renderAllContexts();api.commitHistory?.();api.setStatus?.(success);
      return true;
    };
    const callbacks={
      analyze,getState,
      getFrameCanvas:index=>api?.getPlayFrameCanvas?.(index),
      selectScene:sceneId=>{ if (api?.selectPlayScene?.(sceneId)) renderAllContexts(false); },
      moveScene:(sceneId,x,y)=>{
        if (["__proto__","constructor","prototype"].includes(String(sceneId))) return;
        const data=graph();
        data.worldPositions=Object.assign(Object.create(null),data.worldPositions&&typeof data.worldPositions==="object"?data.worldPositions:{});
        data.worldPositions[sceneId]={x:number(x,12,12,2400),y:number(y,12,12,2400)};
        api.saveLocal?.();
      },
      resetLayout:()=>change(()=>{const data=graph();if(!data.worldPositions||!Object.keys(data.worldPositions).length)return false;data.worldPositions={};return true;},"World diagram layout reset."),
      editDestination:(link,id)=>change(()=>model.editDestination(getState().playMode,link,id),"World transition destination updated."),
      editEntry:(link,x,y)=>change(()=>model.editEntry(getState().playMode,link,x,y),"Portal entry coordinates updated."),
      selectRule:ruleId=>{
        if(!graph().nodes.some(node=>node.id===ruleId))return;
        if(ctx?.mapDetails)ctx.mapDetails.open=true;
        select(ruleId);ctx?.inspector?.scrollIntoView?.({block:"nearest"});
      },
      createConnection:(fromId,toId,mode)=>{
        if(!getState()?.playMode)return {ok:false,message:"Open a Play Mode project first."};
        api.beginHistory?.();
        const result=author.create(getState().playMode,fromId,toId,{mode,makeId});
        if(!result.ok){api.rollbackHistory?.();api.setStatus?.(result.message);return result;}
        if(result.eventId){setSelectedId(result.eventId);graph().selectedId=result.eventId;}
        api.capturePlayScene?.();renderAllContexts();api.commitHistory?.();api.setStatus?.(result.message);
        return result;
      },
      createTouchRule:(sceneId,target)=>{
        const data=graph();
        if(data.nodes.length>98||!target?.id){api.setStatus?.("The rule map has reached its 100-rule limit.");return;}
        const sceneName=analyze().scenes.find(item=>item.id===sceneId)?.name||sceneId;
        api.beginHistory?.();const index=data.nodes.length;
        const event=normalizeNode({id:makeId("touch"),type:"eventTrigger",name:`Touch ${target.name}`,
          x:40+(index%5)*20,y:60+(index%5)*140,data:{sceneId,trigger:target.id}},index);
        const action=normalizeNode({id:makeId("message"),type:"actionMessage",name:`Respond to ${target.name}`,
          x:event.x+316,y:event.y,data:{message:`You touched ${target.name} in ${sceneName}.`}},index+1);
        event.next=action.id;data.nodes.push(event,action);
        setSelectedId(event.id);data.selectedId=event.id;
        if(ctx?.mapDetails)ctx.mapDetails.open=true;
        renderAllContexts();api.commitHistory?.();api.setStatus?.(`Created editable touch rule for ${target.name}.`);
      }
    };
    diagram.render(host,analyze(),getState(),callbacks);
  }
  return {render};
});
