// The SCPD: a five-star wanted system. Crimes add heat; heat decays when no
// cop can see the player. Cops chase and ram, set roadblocks at 3 stars,
// and a helicopter joins at 4. Get busted by standing still next to a cop
// at 1 star, or lose them by breaking line of sight.

import { WANTED } from './config.js';
import { clamp, dist, angleLerp, pick, range } from './util.js';
import { G } from './state.js';
import { makeCar, stepCarPhysics, collideCarWorld, damageCar, explodeAt } from './vehicles.js';
import { fireBullet } from './combat.js';
import { sfx } from './audio.js';
import { floater } from './effects.js';

export function starsForHeat(heat) {
  let stars = 0;
  for (let i = 0; i < WANTED.stars.length; i++) if (heat >= WANTED.stars[i]) stars = i;
  return stars;
}

export function addHeat(amount, witnessed = true) {
  if (G.mission && G.mission.noWanted) return;
  G.heat = clamp(G.heat + amount, 0, 1400);
  const stars = starsForHeat(G.heat);
  if (stars > G.wanted) {
    G.wanted = stars;
    if (witnessed) floater(G.player.x, G.player.y - 50, 'WANTED LEVEL ' + stars, '#ff5555', 18);
    sfx.sirenBlip();
  }
}

export function clearWanted() {
  G.wanted = 0;
  G.heat = 0;
  for (const cop of G.cops) {
    cop.driver = null;
    cop.ai = null;
  }
  G.cops = [];
  G.heli = null;
  G.roadblocks = [];
}

function spawnCopCar() {
  const p = G.player;
  const w = G.world;
  // Spawn on a road near the player but off-screen.
  let x, y, tries = 0;
  do {
    const a = G.rng() * Math.PI * 2;
    const r = range(G.rng, 650, 950);
    x = p.x + Math.cos(a) * r;
    y = p.y + Math.sin(a) * r;
    const rp = w.nearestRoadPoint(x, y);
    x = rp.x; y = rp.y;
    tries++;
  } while (tries < 10 && (w.isWater(x, y) || dist(x, y, p.x, p.y) < 550));
  const cop = makeCar('police', x, y, Math.atan2(p.y - y, p.x - x), { driver: 'cop' });
  cop.ai = { mode: 'chase', shootCooldown: range(G.rng, 1, 2), stuck: 0 };
  G.cops.push(cop);
  G.cars.push(cop);
  return cop;
}

function copCanSee(cop) {
  const p = G.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  if (d > 900) return false;
  // Line of sight blocked by buildings.
  const steps = Math.floor(d / 40);
  for (let i = 1; i < steps; i++) {
    const x = cop.x + ((p.x - cop.x) * i) / steps;
    const y = cop.y + ((p.y - cop.y) * i) / steps;
    for (const c of G.world.colliders) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return false;
    }
  }
  return true;
}

function updateCopCar(cop, dt) {
  const p = G.player;
  const ai = cop.ai;
  const d = dist(cop.x, cop.y, p.x, p.y);
  // Predict the player's position for the intercept.
  const lead = clamp(d / 600, 0, 1) * 0.9;
  const tx = p.x + p.vx * lead;
  const ty = p.y + p.vy * lead;
  const want = Math.atan2(ty - cop.y, tx - cop.x);
  const diff = ((want - cop.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const steer = clamp(diff * 2.4, -1, 1);
  const throttle = d > 90 ? 1 : 0.2;
  stepCarPhysics(cop, throttle, steer, false, dt);
  collideCarWorld(cop);
  if (Math.abs(cop.speed) < 10 && d > 150) {
    ai.stuck += dt;
    if (ai.stuck > 2) {
      // Reverse out of trouble.
      stepCarPhysics(cop, -1, -steer, false, dt);
      ai.stuck = 0;
    }
  } else ai.stuck = 0;
  // Cops shoot at 2+ stars when close and in sight.
  if (G.wanted >= 2 && d < 420 && copCanSee(cop)) {
    ai.shootCooldown -= dt;
    if (ai.shootCooldown <= 0) {
      ai.shootCooldown = range(G.rng, 0.7, 1.4);
      const aim = Math.atan2(p.y - cop.y, p.x - cop.x) + range(G.rng, -0.12, 0.12);
      fireBullet(cop, cop.x, cop.y, aim, 'pistol', false);
    }
  }
  // Busted: standing still next to a cop at low wanted.
  if (G.wanted <= 1 && p.onFoot && d < 55 && p.speed < 20) {
    G.bustedProgress += dt;
    if (G.bustedProgress > 2.5) bustPlayer();
  } else {
    G.bustedProgress = Math.max(0, G.bustedProgress - dt * 2);
  }
}

function bustPlayer() {
  G.mode = 'busted';
  G.stats.busted++;
  const fine = Math.min(G.cash, 150);
  G.cash -= fine;
  sfx.fail();
}

export function updateHeli(dt) {
  const p = G.player;
  if (G.wanted >= WANTED.heliAtStars && !G.heli) {
    G.heli = { x: p.x - 600, y: p.y - 600, angle: 0, health: 150, shootCooldown: 2, search: 0 };
    floater(p.x, p.y - 60, 'POLICE HELICOPTER INBOUND', '#ff5555', 16);
  }
  if (G.wanted < WANTED.heliAtStars && G.heli) {
    // Heli leaves when the heat drops.
    G.heli.search += dt;
    if (G.heli.search > 6) { G.heli = null; return; }
  }
  const h = G.heli;
  if (!h) return;
  const d = dist(h.x, h.y, p.x, p.y);
  const want = Math.atan2(p.y - h.y, p.x - h.x);
  h.angle = angleLerp(h.angle, want, 3 * dt);
  const speed = d > 120 ? 260 : 120;
  h.x += Math.cos(h.angle) * speed * dt;
  h.y += Math.sin(h.angle) * speed * dt;
  h.search = 0;
  if (G.wanted >= 5 && d < 500) {
    h.shootCooldown -= dt;
    if (h.shootCooldown <= 0) {
      h.shootCooldown = 1.6;
      const aim = Math.atan2(p.y - h.y, p.x - h.x) + range(G.rng, -0.1, 0.1);
      fireBullet(h, h.x, h.y, aim, 'rifle', false);
    }
  }
  if (h.health <= 0) {
    explodeAt(h.x, h.y);
    G.heli = null;
    G.stats.copsEvaded++;
    floater(p.x, p.y - 50, 'HELICOPTER DOWN! +$500', '#7dff6a');
    G.cash += 500;
    G.stats.cashEarned += 500;
  }
}

function updateRoadblocks(dt) {
  if (G.wanted >= WANTED.roadblockAtStars && G.roadblocks.length === 0 && G.player && !G.player.onFoot) {
    const p = G.player;
    const w = G.world;
    // Two cop cars parked across the road ahead of the player.
    const ahead = 420;
    const ax = p.x + Math.cos(p.angle) * ahead;
    const ay = p.y + Math.sin(p.angle) * ahead;
    const rp = w.nearestRoadPoint(ax, ay);
    for (let i = -1; i <= 1; i += 2) {
      const perp = rp.vertical ? 0 : Math.PI / 2;
      const cx = rp.x + Math.cos(perp) * i * 30;
      const cy = rp.y + Math.sin(perp) * i * 30;
      const block = makeCar('police', cx, cy, rp.vertical ? 0 : Math.PI / 2, { driver: 'cop' });
      block.ai = { mode: 'block', shootCooldown: 1, stuck: 0 };
      G.cops.push(block);
      G.cars.push(block);
      G.roadblocks.push(block);
    }
    floater(p.x, p.y - 60, 'ROADBLOCK AHEAD!', '#ff5555', 16);
  }
  // Clear roadblocks that are far behind.
  const p = G.player;
  for (let i = G.roadblocks.length - 1; i >= 0; i--) {
    if (dist(G.roadblocks[i].x, G.roadblocks[i].y, p.x, p.y) > 1200) {
      const rb = G.roadblocks[i];
      rb.driver = null; rb.ai = null;
      G.roadblocks.splice(i, 1);
    }
  }
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  // Stars always follow the heat, however the heat changed.
  const heatStars = starsForHeat(G.heat);
  if (heatStars > G.wanted) G.wanted = heatStars;
  // Heat decays; faster when no cop sees the player.
  let anySees = false;
  for (const cop of G.cops) if (cop.health > 0 && copCanSee(cop)) { anySees = true; break; }
  if (G.heli) anySees = true;
  if (anySees) G.lastSeen = G.time;
  if (G.wanted > 0) {
    const unseenFor = G.time - G.lastSeen;
    const decay = unseenFor > 3 ? WANTED.decayPerSec + WANTED.unseenDecayBonus : WANTED.decayPerSec * 0.25;
    G.heat = Math.max(0, G.heat - decay * dt);
    const stars = starsForHeat(G.heat);
    if (stars < G.wanted) {
      G.wanted = stars;
      if (stars === 0) {
        G.stats.copsEvaded++;
        floater(p.x, p.y - 50, 'YOU LOST THEM', '#7dff6a', 18);
        clearWanted();
        return;
      }
    }
  }
  // Keep the right number of pursuit cars.
  const want = WANTED.maxCops[G.wanted] || 0;
  const chasing = G.cops.filter((c) => c.health > 0 && c.ai && c.ai.mode === 'chase').length;
  if (chasing < want && G.wanted > 0) spawnCopCar();
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (cop.health <= 0) { G.cops.splice(i, 1); continue; }
    if (cop.ai && cop.ai.mode === 'chase') updateCopCar(cop, dt);
    else if (cop.ai && cop.ai.mode === 'block') {
      // Blockers sit still but shoot when the player approaches.
      const d = dist(cop.x, cop.y, p.x, p.y);
      if (d < 380 && copCanSee(cop)) {
        cop.ai.shootCooldown -= dt;
        if (cop.ai.shootCooldown <= 0) {
          cop.ai.shootCooldown = 1.2;
          const aim = Math.atan2(p.y - cop.y, p.x - cop.x);
          fireBullet(cop, cop.x, cop.y, aim, 'pistol', false);
        }
      }
    }
  }
  updateHeli(dt);
  updateRoadblocks(dt);
}
