"use strict";
// Component motion
(function attachPlayComponentMotion(root, factory) {
  const navigation = typeof module === "object" && module.exports ? require("./play-component-navigation.js") : root?.PixelBugPlayComponentNavigation;
  if (!navigation?.standaloneSource) throw new Error("Component navigation unavailable.");
  const platform = typeof module === "object" && module.exports ? require("./play-platform-navigation.js") : root?.PixelBugPlayPlatformNavigation;
  if (!platform?.standaloneSource) throw new Error("Platform navigation unavailable.");
  const api = Object.freeze({ ...factory(navigation, platform), standaloneSource: `(${factory.toString()})(${navigation.standaloneSource},${platform.standaloneSource})` });
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PixelBugPlayComponentMotion = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPlayComponentMotion(NAVIGATION, PLATFORM) {
  function bounded(value, fallback, lo, hi) {
    const n = Number(value);
    return Math.max(lo, Math.min(Number.isFinite(n) ? n : fallback, hi));
  }
  function settings(source = {}, frameCount = 1000) {
    return {
      componentPatrolRange: bounded(source.componentPatrolRange, 0, 0, 1024),
      componentPatrolSpeed: bounded(source.componentPatrolSpeed, 0, 0, 240),
      componentBobHeight: bounded(source.componentBobHeight, 0, 0, 24),
      componentAltFrame: source.componentAltFrame == null || source.componentAltFrame === "" ? null : Math.floor(bounded(source.componentAltFrame, 0, 0, 999)) < frameCount ? Math.floor(bounded(source.componentAltFrame, 0, 0, 999)) : null,
      componentFrameTicks: Math.floor(bounded(source.componentFrameTicks, 12, 2, 120)),
      componentBehavior: ["patrol", "chase", "guard", "wander", "sentry"].includes(source.componentBehavior) ? source.componentBehavior : "patrol",
      componentAggroRange: bounded(source.componentAggroRange, 180, 16, 1024),
      componentAvoidObstacles: source.componentAvoidObstacles === true,
      componentPlatformJump: source.componentPlatformJump === true
    };
  }
  const memory = new WeakMap();
  function reset(prop) { memory.delete(prop); }
  function position(prop = {}, tick = 0, worldWidth = Infinity, context = {}) {
    const x = Number(prop.x) || 0, y = Number(prop.y) || 0;
    const config = settings(prop);
    const { componentPatrolRange: range, componentPatrolSpeed: speed, componentBobHeight: bob } = config;
    const step = Math.max(0, Math.floor(Number(tick) || 0));
    const seconds = step / 60;
    let offset = 0, facing = 1;
    let adjustedY = y;
    if (config.componentBehavior === "sentry") {
      offset = 0;
    } else if (config.componentPlatformJump && config.componentAvoidObstacles &&
      (config.componentBehavior === "chase" || config.componentBehavior === "guard") && context.navigation) {
      let current=memory.get(prop);
      if(!current || step<current.tick || current.x0!==x || current.y0!==y || !current.platform) {
        current={...PLATFORM.create(x,y),x0:x,y0:y,platform:true};memory.set(prop,current);
      }
      const targetX=Number(context.actorX),targetY=Number(context.actorY);
      const seen=Number.isFinite(targetX)&&Number.isFinite(targetY)&&
        Math.hypot(targetX-current.x,targetY-current.y)<=config.componentAggroRange;
      const destination=seen?Math.max(x-range,Math.min(x+range,targetX)):
        config.componentBehavior==="guard"?x:current.x;
      const nav={...context.navigation,minX:Math.max(0,x-range),maxX:Math.min(worldWidth,x+range)};
      for(let t=current.tick;t<step && t<current.tick+240;t++)
        PLATFORM.tick(current,destination,{speed},nav);
      current.tick=step;offset=current.x-x;adjustedY=current.y;facing=current.facing;
    } else if (config.componentAvoidObstacles &&
        (config.componentBehavior === "chase" || config.componentBehavior === "guard") && context.navigation) {
      let current=memory.get(prop);
      if (!current || step<current.tick || current.x0!==x || current.y0!==y) {
        current={x0:x,y0:y,x,y,tick:0,facing:1,path:[],targetKey:"",nextRoute:0};
        memory.set(prop,current);
      }
      const targetX=Number(context.actorX),targetY=Number(context.actorY);
      const seen=Number.isFinite(targetX)&&Number.isFinite(targetY)&&
        Math.hypot(targetX-current.x,targetY-current.y)<=config.componentAggroRange;
      const destination=seen ? {
        x:Math.max(x-range,Math.min(x+range,targetX)),y:targetY
      } : config.componentBehavior==="guard" ? {x,y} : {x:current.x,y:current.y};
      const destinationKey=`${Math.floor(destination.x/20)},${Math.floor(destination.y/20)}`;
      if (destinationKey!==current.targetKey || step>=current.nextRoute) {
        current.path=NAVIGATION.route({x:current.x,y:current.y},destination,{
          ...context.navigation,minX:Math.max(0,x-range),maxX:Math.min(worldWidth,x+range)});
        current.targetKey=destinationKey;current.nextRoute=step+15;
      }
      let movement=speed*Math.min(8,Math.max(0,step-current.tick))/60;
      while (movement>.00001 && current.path.length) {
        const point=current.path[0],dx=point.x-current.x,dy=point.y-current.y,dist=Math.hypot(dx,dy);
        if(dist<=movement){current.x=point.x;current.y=point.y;movement-=dist;current.path.shift();}
        else{current.x+=dx/dist*movement;current.y+=dy/dist*movement;movement=0;}
        if(dx)current.facing=Math.sign(dx);
      }
      current.tick=step;offset=current.x-x;adjustedY=current.y;facing=current.facing;
    } else if (config.componentBehavior === "chase" || config.componentBehavior === "guard") {
      let current = memory.get(prop);
      if (!current || step < current.tick || step === 0 || current.x0 !== x) {
        current = { x0:x, x, tick:step, facing:1 };
        memory.set(prop, current);
      }
      if (step > current.tick) {
        const target = Number(context.actorX);
        const targetY = Number(context.actorY);
        const nearby = Number.isFinite(target) && Math.abs(target - current.x) <= config.componentAggroRange &&
          (!Number.isFinite(targetY) || Math.abs(targetY - y) <= config.componentAggroRange);
        const destination = nearby ? Math.max(x - range, Math.min(x + range, target)) :
          config.componentBehavior === "guard" ? x : current.x;
        const delta = destination - current.x;
        const move = Math.min(Math.abs(delta), speed * Math.min(30, step - current.tick) / 60);
        if (move > 0) { current.facing = Math.sign(delta); current.x += Math.sign(delta) * move; }
        current.tick = step;
      }
      offset = current.x - x;
      facing = current.facing;
    } else if (range > 0 && speed > 0) {
      const distance = seconds * speed % (range * 2);
      if (config.componentBehavior === "wander") {
        const period = Math.max(1, range * 2);
        const seed = String(prop.nodeTriggerId || prop.componentItem || "wander").split("")
          .reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 17);
        const cycle = Math.floor(seconds * speed / period);
        const reverse = ((cycle + seed) & 1) !== 0;
        offset = (reverse ? -1 : 1) * (range - Math.abs(distance - range));
        facing = reverse ? -1 : 1;
      } else {
        offset = range - Math.abs(distance - range);
        facing = seconds * speed % (range * 2) > range ? -1 : 1;
      }
    }
    const maxX = Number.isFinite(worldWidth) ? Math.max(0, worldWidth - 1) : Infinity;
    return { x: Math.max(0, Math.min(x + offset, maxX)),
      y: adjustedY - (bob ? bob * (0.5 - 0.5 * Math.cos(seconds * Math.PI * 3)) : 0), facing };
  }
  function frame(prop = {}, tick = 0) {
    const alt = settings(prop).componentAltFrame;
    return alt !== null && Math.floor(Math.max(0, Number(tick) || 0) / settings(prop).componentFrameTicks) % 2 === 1 ? alt : (Number(prop.frame) || 0);
  }
  return { settings, position, frame, reset };
});
