"use strict";
// Diagram contracts
(function attachPlayWorldDiagramModel(root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayWorldDiagramModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayWorldDiagramModel() {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
  const CARD_W = 220, CARD_H = 248, GAP_X = 145, GAP_Y = 80;
  function positions(scenes = [], saved = {}) {
    const result = Object.create(null);
    const perRow = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(scenes.length))));
    scenes.forEach((scene, index) => {
      const existing = saved && Object.prototype.hasOwnProperty.call(saved, scene.id) ? saved[scene.id] : null;
      result[scene.id] = {
        x: existing && Number.isFinite(Number(existing.x)) ? clamp(existing.x, 12, 2400) : 24 + (index % perRow) * (CARD_W + GAP_X),
        y: existing && Number.isFinite(Number(existing.y)) ? clamp(existing.y, 12, 2400) : 30 + Math.floor(index / perRow) * (CARD_H + GAP_Y)
      };
    });
    return result;
  }
  function dimensions(coords = {}) {
    const values = Object.values(coords);
    return { width: Math.max(740, ...values.map(item => item.x + CARD_W + 70)), height: Math.max(260, ...values.map(item => item.y + CARD_H + 75)) };
  }
  function linkKey(link) {
    return link.event === "objectPortal" ? `portal:${link.from}:${link.propIndex}` : `rule:${link.actionId}:${link.from}`;
  }
  // Collision routing
  // Candidate lanes
  function routePoints(link, coords, lane = 0) {
    const a=coords[link.from],b=coords[link.to];
    if(!a||!b)return [];
    if(link.from===link.to){
      const x=a.x+CARD_W-20,y=a.y+CARD_H/2;
      return [{x,y},{x:x+34,y},{x:x+48,y:y-37},{x:x+73,y:y-37},
        {x:x+73,y:y+37},{x:x+30,y:y+37},{x:x+30,y:y+12}];
    }
    const forward=b.x>=a.x;
    const oy=72+Math.min(6,Math.max(0,lane))*10;
    const start={x:a.x+(forward?CARD_W:0),y:a.y+oy};
    const end={x:b.x+(forward?0:CARD_W),y:b.y+oy};
    const stub=26;
    const s={x:start.x+(forward?stub:-stub),y:start.y};
    const e={x:end.x+(forward?-stub:stub),y:end.y};
    const rects=Object.values(coords).filter(Boolean).map(v=>({left:v.x-8,right:v.x+CARD_W+8,
      top:v.y-8,bottom:v.y+CARD_H+8}));
    const bounds=rects.filter(r=>r.left<=Math.max(s.x,e.x)&&r.right>=Math.min(s.x,e.x));
    const ys=new Set([s.y,e.y,Math.min(s.y,e.y)-25,Math.max(s.y,e.y)+25]);
    for(const r of bounds){ys.add(r.top-18);ys.add(r.bottom+18);}
    const xs=new Set([Math.min(s.x,e.x)-50,Math.max(s.x,e.x)+50]);
    for(const r of rects){xs.add(r.left-18);xs.add(r.right+18);}
    const candidates=[[start,s,{x:e.x,y:s.y},e,end]];
    for(const y of ys)candidates.push([start,s,{x:s.x,y},{x:e.x,y},e,end]);
    for(const x of xs)candidates.push([start,s,{x,y:s.y},{x,y:e.y},e,end]);
    function crosses(p,q,r) {
      if(p.x===q.x)return p.x>r.left&&p.x<r.right&&Math.max(p.y,q.y)>r.top&&Math.min(p.y,q.y)<r.bottom;
      if(p.y===q.y)return p.y>r.top&&p.y<r.bottom&&Math.max(p.x,q.x)>r.left&&Math.min(p.x,q.x)<r.right;
      return true;
    }
    function score(points){
      let penalty=0,length=0;
      for(let i=1;i<points.length;i++){
        const p=points[i-1],q=points[i];
        length+=Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
        // Terminal stubs
        if(i===1||i===points.length-1)continue;
        for(const r of rects)if(crosses(p,q,r))penalty++;
      }
      return penalty*100000+length;
    }
    candidates.sort((a,b)=>score(a)-score(b));
    const points=candidates[0];
    return points.filter((p,i)=>i===0||p.x!==points[i-1].x||p.y!==points[i-1].y);
  }
  function curve(link, coords, lane=0) {
    const points=routePoints(link,coords,lane);
    return points.length?points.map((p,i)=>`${i?'L':'M'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' '):'';
  }
  function editDestination(playMode, link, destination) {
    if (!playMode || !link || !destination || !(playMode.scenes || []).some(scene => scene.id === destination)) return false;
    if (link.event === "objectPortal") {
      const source = link.from === playMode.activeSceneId ? playMode : (playMode.scenes || []).find(scene => scene.id === link.from);
      if (source?.worldType === "voxel3d" || !Array.isArray(source?.props)) return false;
      const prop = source.props[link.propIndex];
      if (!prop || prop.targetSceneId === destination) return false;
      prop.targetSceneId = destination;
      prop.solid = false;
      return true;
    }
    const node = (playMode.nodeEditor?.nodes || []).find(item => item.id === link.actionId && item.type === "actionScene");
    if (!node || node.data?.sceneId === destination) return false;
    node.data = { ...node.data, sceneId: destination };
    return true;
  }
  function editEntry(playMode, link, x, y) {
    if (link?.event !== "objectPortal") return false;
    const source = link.from === playMode?.activeSceneId ? playMode : (playMode?.scenes || []).find(scene => scene.id === link.from);
    const prop = source?.props?.[link.propIndex];
    if (!prop) return false;
    const coord = v => v === "" || v == null ? null : Number.isFinite(Number(v)) ? clamp(v, -100000, 100000) : null;
    const nextX = coord(x), nextY = coord(y);
    if (prop.targetX === nextX && prop.targetY === nextY) return false;
    prop.targetX = nextX; prop.targetY = nextY;
    return true;
  }
  function boundRules(playMode, scene, target) {
    if (!scene || !target) return [];
    return (playMode?.nodeEditor?.nodes || []).filter(node => node.type === "eventTrigger" &&
      (!node.data?.sceneId || node.data.sceneId === scene.id) &&
      (node.data?.trigger === "any" || target.aliases.includes(String(node.data?.trigger || ""))));
  }
  return { CARD_W, CARD_H, positions, dimensions, linkKey, curve, routePoints, editDestination, editEntry, boundRules };
});
