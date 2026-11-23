// Cars and boats: arcade physics, traffic AI that follows the road grid,
// parked cars to steal, and drivable boats on the bay.

import { CAR_MODELS, CAR_TUNE } from './config.js';
import { clamp, angleLerp, pick, range, dist } from './util.js';
import { G } from './state.js';
import { sfx } from './audio.js';

let nextId = 1;

export function makeCar(modelId, x, y, angle, opts = {}) {
  const model = CAR_MODELS.find((m) => m.id === modelId) || CAR_MODELS[0];
  const color = opts.color || pick(G.rng, model.color);
  const car = {
    id: nextId++, kind: 'car', model: model.id, name: model.name,
    x, y, angle, vx: 0, vy: 0, speed: 0,
    halfLen: model.id === 'truck' || model.id === 'van' ? 34 : 27,
    halfWid: model.id === 'truck' || model.id === 'van' ? 16 : 13,
    top: model.top, accel: model.accel, grip: model.grip,
    color, health: 100, smoking: false, burning: false,
    driver: opts.driver || null,      // 'player' | 'traffic' | 'cop' | null (parked)
    ai: opts.ai || null,              // traffic AI state
    brakeLights: false, headlights: false,
    siren: model.id === 'police',
    stolen: false, owned: !!opts.owned,
    mission: !!opts.mission, despawn: 0,
  };
  return car;
}

export function makeBoat(x, y, angle) {
  return {
    id: nextId++, kind: 'boat', model: 'boat', name: 'Wave Runner',
    x, y, angle, vx: 0, vy: 0, speed: 0,
    halfLen: 30, halfWid: 13, top: 640, accel: 520, grip: 2.2,
    color: pick(G.rng, ['#e8e8e8', '#22a6c2', '#e85d3b']),
    health: 100, driver: null, wake: 0, mission: false,
  };
}

// Arcade car physics: forward speed along the heading, lateral slide damped
// by grip, handbrake drops grip for drifts.
export function stepCarPhysics(car, throttle, steer, handbrake, dt) {
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const forwardSpeed = car.vx * fx + car.vy * fy;
  let speed = forwardSpeed;
  if (throttle > 0) speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (speed > 5) speed -= CAR_TUNE.brake * dt;       // braking
    else speed += CAR_TUNE.reverseAccel * throttle * dt; // reversing
  }
  speed -= speed * CAR_TUNE.drag * dt;
  speed = clamp(speed, -CAR_TUNE.maxReverse, car.top);
  const grip = handbrake ? CAR_TUNE.driftGrip : car.grip;
  const turnAuthority = clamp(Math.abs(speed) / 140, 0, 1) * (speed < 0 ? -1 : 1);
  car.angle += steer * CAR_TUNE.turnRate * turnAuthority * dt * (handbrake ? 1.35 : 1);
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  const rx = -nfy, ry = nfx;
  const latSpeed = car.vx * rx + car.vy * ry;
  const dampedLat = latSpeed * Math.exp(-grip * dt);
  car.vx = nfx * speed + rx * dampedLat;
  car.vy = nfy * speed + ry * dampedLat;
  car.speed = speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  if (handbrake && Math.abs(speed) > 240 && Math.abs(dampedLat) > 60) {
    G.skidmarks.push({ x: car.x - nfx * car.halfLen, y: car.y - nfy * car.halfLen, angle: car.angle, t: 6 });
    if (G.skidmarks.length > 400) G.skidmarks.splice(0, 100);
  }
}

export function collideCarWorld(car) {
  const w = G.world;
  const c = w.clampToWorld(car.x, car.y);
  if (c.x !== car.x || c.y !== car.y) {
    car.x = c.x; car.y = c.y;
    car.vx *= -0.3; car.vy *= -0.3; car.speed *= -0.3;
    damageCar(car, 4);
  }
  const r = Math.max(car.halfLen, car.halfWid) * 0.8;
  const fixed = w.collideCircle(car.x, car.y, r);
  if (fixed.x !== car.x || fixed.y !== car.y) {
    const impact = Math.hypot(car.vx, car.vy);
    car.x = fixed.x; car.y = fixed.y;
    car.vx *= -0.35; car.vy *= -0.35; car.speed *= -0.35;
    if (impact > 200) {
      damageCar(car, impact / 40);
      if (car.driver === 'player') sfx.crash();
      spawnSparks(car.x, car.y, 8);
    }
  }
  // Cars cannot drive into the water (except boats).
  if (car.kind === 'car' && w.isWater(car.x, car.y)) {
    car.x -= car.vx * 0.05; car.y -= car.vy * 0.05;
    car.vx *= -0.2; car.vy *= -0.2; car.speed *= -0.2;
  }
}

export function damageCar(car, amount) {
  if (car.health <= 0) return;
  car.health -= amount;
  if (car.health <= 40 && !car.smoking) { car.smoking = true; }
  if (car.health <= 15 && !car.burning) { car.burning = true; }
  if (car.health <= 0) {
    car.health = 0;
    explodeAt(car.x, car.y);
    if (car.driver === 'player') {
      const p = G.player;
      p.onFoot = true; p.car = null;
      p.x = car.x + 40; p.y = car.y;
      p.health = Math.max(1, p.health - 25);
    }
    car.driver = 'wreck';
  }
}

export function explodeAt(x, y) {
  sfx.explosion();
  G.cam.shake = Math.max(G.cam.shake, 14);
  for (let i = 0; i < 26; i++) {
    const a = G.rng() * Math.PI * 2;
    const sp = range(G.rng, 60, 320);
    G.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: range(G.rng, 0.4, 1.1), t: 0,
      size: range(G.rng, 4, 12),
      color: pick(G.rng, ['#ffdd33', '#ff8822', '#ff4422', '#666666']),
      kind: 'fire',
    });
  }
  // Blast damages nearby cars, peds and the player.
  const blast = (e, dmg) => {
    const d = dist(x, y, e.x, e.y);
    if (d < 130) {
      if (e.kind === 'car' || e.kind === 'boat') damageCar(e, dmg * (1 - d / 160));
      else if (e.health !== undefined) e.health -= dmg * (1 - d / 160);
    }
  };
  for (const c of G.cars) if (c.health > 0) blast(c, 90);
  for (const p of G.peds) if (p.health > 0) { blast(p, 120); if (p.health <= 0) p.dead = true; }
  const pl = G.player;
  if (pl.onFoot && dist(x, y, pl.x, pl.y) < 130) pl.health -= 60 * (1 - dist(x, y, pl.x, pl.y) / 160);
}

export function spawnSparks(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    G.particles.push({
      x, y, vx: Math.cos(a) * range(G.rng, 40, 160), vy: Math.sin(a) * range(G.rng, 40, 160),
      life: range(G.rng, 0.2, 0.5), t: 0, size: range(G.rng, 1, 3),
      color: '#ffd76a', kind: 'spark',
    });
  }
}

// --- Traffic AI -------------------------------------------------------------

function newTrafficTarget(car) {
  const w = G.world;
  const vertical = G.rng() < 0.5;
  if (vertical) {
    const rx = pick(G.rng, w.roadsV);
    return { x: rx + (G.rng() < 0.5 ? -22 : 22), y: pick(G.rng, w.roadsH), vertical: true };
  }
  const ry = pick(G.rng, w.roadsH);
  return { x: pick(G.rng, w.roadsV), y: ry + (G.rng() < 0.5 ? -22 : 22), vertical: false };
}

export function spawnTraffic(n) {
  const w = G.world;
  const p = G.player;
  for (let i = 0; i < n; i++) {
    const vertical = G.rng() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = pick(G.rng, w.roadsV) + (G.rng() < 0.5 ? -22 : 22);
      y = range(G.rng, 200, w.size - 400);
      angle = G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      y = pick(G.rng, w.roadsH) + (G.rng() < 0.5 ? -22 : 22);
      x = range(G.rng, 200, w.size - 700);
      angle = G.rng() < 0.5 ? 0 : Math.PI;
    }
    if (p && dist(x, y, p.x, p.y) < 500) continue;
    const model = pick(G.rng, ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'muscle', 'truck']);
    const car = makeCar(model, x, y, angle, { driver: 'traffic' });
    car.ai = { target: newTrafficTarget(car), speed: range(G.rng, 150, 240), stuck: 0 };
    G.cars.push(car);
  }
}

export function spawnParked(n) {
  const w = G.world;
  for (let i = 0; i < n; i++) {
    const vertical = G.rng() < 0.5;
    let x, y, angle;
    if (vertical) {
      x = pick(G.rng, w.roadsV) + (G.rng() < 0.5 ? -36 : 36);
      y = range(G.rng, 200, w.size - 400);
      angle = G.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      y = pick(G.rng, w.roadsH) + (G.rng() < 0.5 ? -36 : 36);
      x = range(G.rng, 200, w.size - 700);
      angle = G.rng() < 0.5 ? 0 : Math.PI;
    }
    if (w.isWater(x, y)) continue;
    const model = pick(G.rng, ['sedan', 'coupe', 'van', 'muscle', 'sport', 'truck']);
    G.cars.push(makeCar(model, x, y, angle, { driver: null }));
  }
}

export function spawnBoats() {
  const w = G.world;
  for (let i = 0; i < 5; i++) {
    const y = 500 + i * 550 + range(G.rng, -80, 80);
    G.boats.push(makeBoat(w.waterLine + 160 + range(G.rng, 0, 200), y, range(G.rng, 0, Math.PI * 2)));
  }
}

function updateTrafficCar(car, dt) {
  const ai = car.ai;
  if (!ai) return;
  const t = ai.target;
  const d = dist(car.x, car.y, t.x, t.y);
  if (d < 60) { ai.target = newTrafficTarget(car); return; }
  const want = Math.atan2(t.y - car.y, t.x - car.x);
  const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const steer = clamp(diff * 2.2, -1, 1);
  // Slow for cars ahead.
  let targetSpeed = ai.speed;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  for (const other of G.cars) {
    if (other === car || other.health <= 0) continue;
    if (dist(aheadX, aheadY, other.x, other.y) < 46) { targetSpeed = 0; break; }
  }
  const throttle = car.speed < targetSpeed ? 0.7 : (car.speed > targetSpeed + 40 ? -0.5 : 0);
  stepCarPhysics(car, throttle, steer, false, dt);
  collideCarWorld(car);
  if (Math.abs(car.speed) < 8 && throttle > 0) {
    ai.stuck += dt;
    if (ai.stuck > 2.5) { ai.target = newTrafficTarget(car); ai.stuck = 0; }
  } else ai.stuck = 0;
}

export function updateVehicles(dt) {
  for (const car of G.cars) {
    if (car.health <= 0) { car.vx *= 0.9; car.vy *= 0.9; car.x += car.vx * dt; car.y += car.vy * dt; continue; }
    if (car.driver === 'traffic') updateTrafficCar(car, dt);
    else if (car.driver === 'cop') { /* police.js drives cop cars */ }
    else if (car.driver === null || car.driver === 'wreck') { /* parked */ }
    // Smoke / fire particles.
    if (car.smoking && G.rng() < 0.5) {
      G.particles.push({
        x: car.x + Math.cos(car.angle) * car.halfLen, y: car.y + Math.sin(car.angle) * car.halfLen,
        vx: range(G.rng, -20, 20), vy: range(G.rng, -50, -20),
        life: 0.9, t: 0, size: range(G.rng, 6, 12),
        color: car.burning ? '#ff7722' : '#555555', kind: 'smoke',
      });
    }
    if (car.burning) damageCar(car, 6 * dt);
  }
  // Car-car collisions (circle approx, cheap n^2 on nearby cars only).
  const cars = G.cars.filter((c) => c.health > 0);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.halfLen + b.halfLen - 14;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr * 0.55 && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const push = (rr * 0.74 - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
        if (rel > 120) {
          damageCar(a, rel / 60); damageCar(b, rel / 60);
          spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6);
          if (a.driver === 'player' || b.driver === 'player') sfx.crash();
        }
        const tmp = a.vx; a.vx = b.vx * 0.6; b.vx = tmp * 0.6;
      }
    }
  }
  // Boats drift gently and bob.
  for (const boat of G.boats) {
    if (boat.driver === 'player') continue;
    boat.angle += Math.sin(G.time * 0.4 + boat.id) * 0.0006;
    boat.x += Math.sin(G.time * 0.3 + boat.id * 2) * 0.02;
  }
  // Despawn far traffic, keep the streets alive near the player.
  const p = G.player;
  if (p) {
    for (let i = G.cars.length - 1; i >= 0; i--) {
      const c = G.cars[i];
      if (c.driver === 'traffic' && !c.mission && dist(c.x, c.y, p.x, p.y) > 1600) G.cars.splice(i, 1);
    }
    const trafficCount = G.cars.filter((c) => c.driver === 'traffic').length;
    if (trafficCount < 14) spawnTraffic(14 - trafficCount);
  }
}

export function nearestCar(x, y, maxD, includeParked = true) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c.health <= 0) continue;
    if (!includeParked && c.driver === null) continue;
    if (c.driver === 'cop') continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function nearestBoat(x, y, maxD) {
  let best = null, bd = maxD;
  for (const b of G.boats) {
    if (b.health <= 0) continue;
    const d = dist(x, y, b.x, b.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
