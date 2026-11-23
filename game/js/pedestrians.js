// Pedestrians: sidewalk walkers with somewhere to go, who panic and flee from
// gunfire, explosions and nearby speeding cars. A few are vendors or mission
// characters; most are just city life.

import { clamp, pick, range, dist, angleLerp } from './util.js';
import { G } from './state.js';

const SKINS = ['#f2c79b', '#c98d5a', '#8a5a33', '#e8b98a', '#5d3a22', '#d9a066'];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1', '#34495e', '#ff6b9d'];
const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#5d4037', '#1a1a2e'];

let nextId = 1;

export function makePed(x, y, opts = {}) {
  return {
    id: nextId++, x, y, angle: range(G.rng, 0, Math.PI * 2),
    vx: 0, vy: 0, speed: 0,
    skin: pick(G.rng, SKINS), shirt: pick(G.rng, SHIRTS), pants: pick(G.rng, PANTS),
    health: 100, dead: false, panic: 0,
    target: null, wait: 0, walkPhase: G.rng() * Math.PI * 2,
    role: opts.role || 'civilian', // civilian | vendor | gang | mission
    name: opts.name || null,
    mission: !!opts.mission,
  };
}

function sidewalkTarget(ped) {
  const w = G.world;
  for (let tries = 0; tries < 12; tries++) {
    const x = ped.x + range(G.rng, -700, 700);
    const y = ped.y + range(G.rng, -700, 700);
    if (x < 80 || y < 80 || x > w.size - 700 || y > w.size - 200) continue;
    if (w.onSidewalk(x, y) || w.isBeach(x, y)) return { x, y };
  }
  return { x: ped.x + 100, y: ped.y };
}

export function spawnPeds(n) {
  const w = G.world;
  const p = G.player;
  for (let i = 0; i < n; i++) {
    let x, y, tries = 0;
    do {
      x = range(G.rng, 140, w.size - 700);
      y = range(G.rng, 140, w.size - 300);
      tries++;
    } while (tries < 30 && !w.onSidewalk(x, y) && !w.isBeach(x, y));
    if (p && dist(x, y, p.x, p.y) < 420) continue;
    const ped = makePed(x, y);
    ped.target = sidewalkTarget(ped);
    G.peds.push(ped);
  }
}

export function scarePeds(x, y, radius, amount = 1) {
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(x, y, ped.x, ped.y) < radius) ped.panic = Math.min(1, ped.panic + amount);
  }
}

export function updatePeds(dt) {
  const w = G.world;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    ped.walkPhase += dt * (4 + Math.abs(ped.speed) * 0.05);
    if (ped.panic > 0.05) {
      // Flee from the player / danger.
      const px = G.player ? G.player.x : ped.x;
      const py = G.player ? G.player.y : ped.y;
      const away = Math.atan2(ped.y - py, ped.x - px) + range(G.rng, -0.4, 0.4);
      ped.angle = angleLerp(ped.angle, away, 8 * dt);
      ped.speed = 300;
      ped.panic = Math.max(0, ped.panic - dt * 0.12);
    } else {
      if (ped.wait > 0) { ped.wait -= dt; ped.speed = 0; }
      else {
        if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 24) {
          if (G.rng() < 0.3) ped.wait = range(G.rng, 1, 4);
          ped.target = sidewalkTarget(ped);
        }
        const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
        ped.angle = angleLerp(ped.angle, want, 6 * dt);
        ped.speed = 62;
      }
    }
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    if (!w.isWater(nx, ny)) {
      const fixed = w.collideCircle(nx, ny, 12);
      ped.x = fixed.x; ped.y = fixed.y;
    }
    ped.vx = Math.cos(ped.angle) * ped.speed;
    ped.vy = Math.sin(ped.angle) * ped.speed;
  }
  // Keep the crowd alive near the player; recycle the far ones.
  const p = G.player;
  if (p) {
    for (let i = G.peds.length - 1; i >= 0; i--) {
      const ped = G.peds[i];
      if (ped.dead) { G.peds.splice(i, 1); continue; }
      if (!ped.mission && dist(ped.x, ped.y, p.x, p.y) > 1500) G.peds.splice(i, 1);
    }
    const alive = G.peds.filter((q) => !q.dead).length;
    if (alive < 26) spawnPeds(26 - alive);
  }
}

export function killPed(ped, byPlayer) {
  if (ped.dead) return;
  ped.dead = true;
  ped.health = 0;
  if (byPlayer) {
    G.stats.kills++;
    // Drop a little cash sometimes.
    if (G.rng() < 0.5) {
      G.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, amount: 10 + Math.floor(G.rng() * 40), t: 20 });
    }
  }
}
