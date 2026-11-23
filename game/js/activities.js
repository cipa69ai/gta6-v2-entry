// Side activities: taxi fares, courier deliveries, street races, mayhem
// rampages, stunt jumps, turf takeovers and random street events. Each pays
// cash and respect, and keeps the city alive between story missions.

import { ECONOMY } from './config.js';
import { dist, pick, range } from './util.js';
import { G } from './state.js';
import { makePed } from './pedestrians.js';
import { addHeat } from './police.js';
import { fireBullet } from './combat.js';
import { sfx } from './audio.js';
import { floater } from './effects.js';

function randomRoadPoint() {
  const w = G.world;
  if (G.rng() < 0.5) return { x: pick(G.rng, w.roadsV), y: pick(G.rng, w.roadsH) };
  return { x: pick(G.rng, w.roadsV), y: pick(G.rng, w.roadsH) };
}

// --- Taxi -------------------------------------------------------------------

export function startTaxi() {
  if (G.side) return false;
  const p = G.player;
  if (!p.car) return false;
  const dest = randomRoadPoint();
  G.side = {
    kind: 'taxi', stage: 'pickup', fare: 0,
    pickup: { x: p.x + range(G.rng, -400, 400), y: p.y + range(G.rng, -400, 400) },
    dest, timer: 120,
  };
  const rp = G.world.nearestRoadPoint(G.side.pickup.x, G.side.pickup.y);
  G.side.pickup = rp;
  G.objective = { text: 'Taxi: pick up the fare', mission: 'Taxi' };
  floater(p.x, p.y - 40, 'TAXI FARE — pick up the passenger', '#ffe14d');
  return true;
}

function updateTaxi(dt) {
  const s = G.side;
  const p = G.player;
  s.timer -= dt;
  if (s.timer <= 0) { endSide('Fare timed out'); return; }
  if (!p.car) { endSide('You left the cab'); return; }
  if (s.stage === 'pickup') {
    if (dist(p.x, p.y, s.pickup.x, s.pickup.y) < 80) {
      s.stage = 'dropoff';
      s.timer = 120;
      G.objective = { text: 'Taxi: drop the passenger off', mission: 'Taxi' };
      sfx.pickup();
    }
  } else if (dist(p.x, p.y, s.dest.x, s.dest.y) < 90) {
    const pay = ECONOMY.taxiFareBase + Math.floor(G.rng() * 60) + Math.floor(s.timer / 10) * 5;
    G.cash += pay; G.stats.cashEarned += pay; G.stats.faresDone++;
    G.respect = Math.min(100, G.respect + 1);
    floater(p.x, p.y - 40, 'FARE COMPLETE +$' + pay, '#7dff6a');
    sfx.cash();
    endSide(null);
  }
}

// --- Courier deliveries -----------------------------------------------------

export function startDelivery() {
  if (G.side) return false;
  const dest = randomRoadPoint();
  G.side = { kind: 'delivery', dest, timer: 90, stage: 'go' };
  G.objective = { text: 'Courier: deliver the package (90s)', mission: 'Courier' };
  return true;
}

function updateDelivery(dt) {
  const s = G.side;
  const p = G.player;
  s.timer -= dt;
  G.objective = { text: 'Courier: deliver the package (' + Math.ceil(s.timer) + 's)', mission: 'Courier' };
  if (s.timer <= 0) { endSide('Delivery failed — too slow'); return; }
  if (dist(p.x, p.y, s.dest.x, s.dest.y) < 90) {
    const pay = ECONOMY.deliveryPay + Math.floor(s.timer) * 2;
    G.cash += pay; G.stats.cashEarned += pay;
    G.respect = Math.min(100, G.respect + 1);
    floater(p.x, p.y - 40, 'DELIVERED +$' + pay, '#7dff6a');
    sfx.cash();
    endSide(null);
  }
}

// --- Street races -----------------------------------------------------------

export function startRace() {
  if (G.race || G.side) return false;
  const p = G.player;
  if (!p.car) return false;
  const loop = G.world.raceLoop;
  G.race = {
    checkpoints: loop, next: 0, laps: 2, lap: 1,
    rivals: [], timer: 0, position: 4, finished: false,
  };
  // Three rival cars start ahead of the player.
  for (let i = 0; i < 3; i++) {
    const rx = loop[0].x + (i + 1) * 60;
    const ry = loop[0].y + (i % 2) * 40;
    const rival = { x: rx, y: ry, angle: 0, speed: 0, cp: 0, lap: 1, finished: false, color: pick(G.rng, ['#ff2d78', '#22e6ff', '#ffe14d']), rubber: range(G.rng, 0.92, 1.05) };
    G.race.rivals.push(rival);
  }
  G.objective = { text: 'Race: lap 1/2 — checkpoint 1/' + (loop.length - 1), mission: 'Street Race' };
  G.banner = { title: 'STREET RACE', sub: '2 laps around downtown — beat 3 rivals', t: 3 };
  sfx.mission();
  return true;
}

function updateRace(dt) {
  const r = G.race;
  const p = G.player;
  r.timer += dt;
  if (!p.car) { endRace('You left your car'); return; }
  const cps = r.checkpoints;
  const target = cps[r.next];
  if (dist(p.x, p.y, target.x, target.y) < 110) {
    r.next++;
    if (r.next >= cps.length) {
      r.next = 1;
      r.lap++;
      if (r.lap > r.laps) { finishRace(); return; }
      floater(p.x, p.y - 40, 'LAP ' + r.lap + '/' + r.laps, '#ffe14d');
    }
    G.objective = { text: 'Race: lap ' + r.lap + '/' + r.laps + ' — checkpoint ' + r.next + '/' + (cps.length - 1), mission: 'Street Race' };
    sfx.pickup();
  }
  // Rivals follow the loop with rubber-banding.
  for (const rv of r.rivals) {
    if (rv.finished) continue;
    const t = cps[rv.cp];
    const d = dist(rv.x, rv.y, t.x, t.y);
    if (d < 100) {
      rv.cp++;
      if (rv.cp >= cps.length) {
        rv.cp = 1;
        rv.lap++;
        if (rv.lap > r.laps) { rv.finished = true; continue; }
      }
    }
    const want = Math.atan2(t.y - rv.y, t.x - rv.x);
    let diff = ((want - rv.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    rv.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const playerAhead = (r.lap * 100 + r.next) > (rv.lap * 100 + rv.cp);
    const speed = 330 * rv.rubber * (playerAhead ? 1.08 : 0.94);
    rv.x += Math.cos(rv.angle) * speed * dt;
    rv.y += Math.sin(rv.angle) * speed * dt;
  }
  // Position: count rivals ahead.
  const myScore = r.lap * 100 + r.next;
  let pos = 1;
  for (const rv of r.rivals) if (!rv.finished && rv.lap * 100 + rv.cp > myScore) pos++;
  r.position = pos;
}

function finishRace() {
  const r = G.race;
  const pos = r.position;
  const prize = pos === 1 ? ECONOMY.racePrize : pos === 2 ? 250 : pos === 3 ? 100 : 0;
  if (prize > 0) {
    G.cash += prize; G.stats.cashEarned += prize;
    if (pos === 1) G.stats.racesWon++;
    G.respect = Math.min(100, G.respect + (pos === 1 ? 5 : 2));
  }
  G.banner = { title: pos === 1 ? 'RACE WON!' : 'FINISHED P' + pos, sub: prize > 0 ? '+$' + prize : 'No prize this time — try again', t: 4 };
  if (pos === 1) sfx.mission(); else sfx.fail();
  G.race = null;
  G.objective = null;
}

function endRace(reason) {
  G.race = null;
  G.objective = null;
  if (reason) floater(G.player.x, G.player.y - 40, reason, '#ff5555');
}

// --- Mayhem rampage ---------------------------------------------------------

export function startRampage() {
  if (G.side) return false;
  G.side = { kind: 'rampage', timer: 60, score: 0, target: 1500 };
  G.objective = { text: 'MAYHEM: cause $1,500 of chaos in 60s', mission: 'Mayhem' };
  G.banner = { title: 'MAYHEM!', sub: 'Smash, crash and blast — $1,500 of chaos in 60 seconds', t: 3 };
  addHeat(60, true);
  return true;
}

export function rampageScore(amount) {
  if (G.side && G.side.kind === 'rampage') {
    G.side.score += amount;
    G.objective = { text: 'MAYHEM: $' + G.side.score + ' / $1,500 (' + Math.ceil(G.side.timer) + 's)', mission: 'Mayhem' };
  }
}

function updateRampage(dt) {
  const s = G.side;
  s.timer -= dt;
  if (s.score >= s.target) {
    const pay = 400;
    G.cash += pay; G.stats.cashEarned += pay;
    G.respect = Math.min(100, G.respect + 4);
    G.banner = { title: 'MAYHEM COMPLETE', sub: '+$' + pay, t: 3 };
    sfx.mission();
    endSide(null);
    return;
  }
  if (s.timer <= 0) { endSide('Mayhem fizzled out'); }
}

// --- Turf takeover ----------------------------------------------------------

export function startTurf(districtId) {
  if (G.side || G.mission) return false;
  const d = G.world.districtAt;
  void d;
  const districts = { barrio: 'El Prado', docks: 'Portside', beach: 'Boardwalk', marina: 'Marina' };
  const name = districts[districtId];
  if (!name || G.turf[districtId] === 'player') return false;
  const pos = { x: 0, y: 0 };
  const S = G.world.size;
  const spots = {
    barrio: { x: 0.16 * S, y: 0.62 * S },
    docks: { x: 0.84 * S, y: 0.72 * S },
    beach: { x: 0.5 * S, y: S - 300 },
    marina: { x: 0.86 * S, y: 0.3 * S },
  };
  Object.assign(pos, spots[districtId]);
  const gang = [];
  for (let i = 0; i < 5; i++) {
    const ped = makePed(pos.x + range(G.rng, -150, 150), pos.y + range(G.rng, -150, 150), { role: 'gang', mission: true });
    ped.shirt = '#8e1f2f'; ped.weapon = 'pistol'; ped.shootCooldown = range(G.rng, 0.5, 1.5);
    G.peds.push(ped);
    gang.push(ped);
  }
  G.side = { kind: 'turf', district: districtId, name, gang, pos };
  G.objective = { text: 'Take over ' + name + ' — clear the gang (0/5)', mission: 'Turf War' };
  G.banner = { title: 'TURF WAR', sub: 'Take ' + name + ' from the Vagos', t: 3 };
  return true;
}

function updateTurf(dt) {
  const s = G.side;
  const dead = s.gang.filter((g) => g.dead).length;
  G.objective = { text: 'Take over ' + s.name + ' — clear the gang (' + dead + '/5)', mission: 'Turf War' };
  // Gang shoots back.
  const p = G.player;
  for (const g of s.gang) {
    if (g.dead) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    if (d < 480) {
      const want = Math.atan2(p.y - g.y, p.x - g.x);
      if (d > 180) { g.x += Math.cos(want) * 140 * dt; g.y += Math.sin(want) * 140 * dt; }
      g.angle = want;
      g.shootCooldown -= dt;
      if (g.shootCooldown <= 0) {
        g.shootCooldown = range(G.rng, 0.9, 1.7);
        fireBullet(g, g.x, g.y, want + range(G.rng, -0.12, 0.12), 'pistol', false);
      }
    }
  }
  if (dead >= s.gang.length) {
    G.turf[s.district] = 'player';
    G.stats.turfTaken++;
    G.respect = Math.min(100, G.respect + 6);
    const pay = 600;
    G.cash += pay; G.stats.cashEarned += pay;
    G.banner = { title: s.name.toUpperCase() + ' IS YOURS', sub: '+$' + pay + ' — your crew now holds this turf', t: 4 };
    sfx.mission();
    endSide(null);
  }
}

export function endSide(reason) {
  if (reason) {
    G.banner = { title: 'ACTIVITY OVER', sub: reason, t: 2.5 };
    sfx.fail();
  }
  if (G.side && G.side.kind === 'turf') {
    for (const g of G.side.gang) if (!g.dead) { g.mission = false; g.role = 'civilian'; }
  }
  G.side = null;
  if (!G.mission) G.objective = null;
}

// --- Stunt jumps ------------------------------------------------------------

export function checkStuntJumps() {
  const p = G.player;
  if (p.onFoot || !p.car) return;
  for (const j of G.world.jumps) {
    if (j.done || G.jumpsDone.has(j.id)) continue;
    if (dist(p.x, p.y, j.x, j.y) < 60 && Math.abs(p.car.speed) > 480) {
      j.done = true;
      G.jumpsDone.add(j.id);
      G.stats.jumpsDone++;
      const pay = 250;
      G.cash += pay; G.stats.cashEarned += pay;
      G.banner = { title: 'STUNT JUMP!', sub: 'Clean air — +$' + pay + '  (' + G.jumpsDone.size + '/6)', t: 3 };
      sfx.jump();
      G.cam.shake = Math.max(G.cam.shake, 6);
    }
  }
}

// --- Random street events ---------------------------------------------------

let eventTimer = 45;

export function updateRandomEvents(dt) {
  eventTimer -= dt;
  if (eventTimer > 0 || G.mission || G.side) return;
  eventTimer = range(G.rng, 50, 110);
  const roll = G.rng();
  const p = G.player;
  if (roll < 0.4) {
    // Armored truck: rob it for cash, but the cops will notice.
    const w = G.world;
    const rp = w.nearestRoadPoint(p.x + range(G.rng, -600, 600), p.y + range(G.rng, -600, 600));
    const truck = { x: rp.x, y: rp.y, kind: 'cash', amount: 800, t: 60, armored: true };
    G.pickups.push(truck);
    floater(p.x, p.y - 50, 'ARMORED TRUCK SPOTTED NEARBY — $800 inside', '#ffe14d', 15);
  } else if (roll < 0.7) {
    // Street race invitation.
    floater(p.x, p.y - 50, 'RACERS ARE MEETING DOWNTOWN — press 9 near the start line', '#22e6ff', 15);
  } else {
    // A gang drive-by rolls past.
    scarePeds(p.x, p.y, 500, 1);
    floater(p.x, p.y - 50, 'GANG DRIVE-BY! Take cover!', '#ff5555', 15);
  }
}

export function updateActivities(dt) {
  if (G.side) {
    if (G.side.kind === 'taxi') updateTaxi(dt);
    else if (G.side.kind === 'delivery') updateDelivery(dt);
    else if (G.side.kind === 'rampage') updateRampage(dt);
    else if (G.side.kind === 'turf') updateTurf(dt);
  }
  if (G.race) updateRace(dt);
  checkStuntJumps();
  updateRandomEvents(dt);
}
