// The player: Dax Mercer, ex-getaway driver. On foot he walks, sprints and
// aims with the mouse; in a car or boat he drives with the same keys.
// Entering a car with a driver inside is a carjacking.

import { PLAYER_TUNE, WEAPONS } from './config.js';
import { clamp, angleLerp, dist, pointInCar } from './util.js';
import { G } from './state.js';
import { isDown, wasPressed, driveInput, mouseWasPressed, mouseIsDown } from './input.js';
import { nearestCar, nearestBoat, stepCarPhysics, collideCarWorld, damageCar } from './vehicles.js';
import { fireBullet, meleeHit } from './combat.js';
import { addHeat } from './police.js';
import { sfx } from './audio.js';
import { floater } from './effects.js';
import { killPed } from './pedestrians.js';

const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle', 'rpg'];

export function giveWeapon(id, ammo) {
  const w = WEAPONS[id];
  if (!w) return;
  const p = G.player;
  if (!p.weapons[id]) p.weapons[id] = { ammo: 0 };
  if (w.ammo !== Infinity) p.weapons[id].ammo += ammo !== undefined ? ammo : w.ammo;
  p.weapon = id;
}

export function switchWeapon(id) {
  const p = G.player;
  if (p.weapons[id]) { p.weapon = id; sfx.click(); }
}

export function cycleWeapon(dir) {
  const p = G.player;
  const owned = WEAPON_ORDER.filter((w) => p.weapons[w]);
  if (owned.length < 2) return;
  const i = owned.indexOf(p.weapon);
  p.weapon = owned[(i + dir + owned.length) % owned.length];
  sfx.click();
}

function enterCar(car) {
  const p = G.player;
  if (car.driver === 'traffic') {
    // Carjacking: the driver flees on foot, the player takes the wheel.
    const driver = { x: car.x, y: car.y };
    void driver;
    car.stolen = true;
    G.stats.carsStolen++;
    addHeat(35, true);
    floater(car.x, car.y - 30, 'CARJACKED!', '#ffaa33');
    sfx.horn();
  } else if (car.driver === null && !car.owned) {
    car.stolen = true;
    G.stats.carsStolen++;
  }
  car.driver = 'player';
  p.car = car;
  p.boat = null;
  p.onFoot = false;
  p.x = car.x; p.y = car.y;
  sfx.click();
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  p.car = null;
  p.onFoot = true;
  const side = 1;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30 * side;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30 * side;
  const fixed = G.world.collideCircle(p.x, p.y, 12);
  p.x = fixed.x; p.y = fixed.y;
  p.vx = 0; p.vy = 0;
}

function enterBoat(boat) {
  const p = G.player;
  boat.driver = 'player';
  p.boat = boat;
  p.car = null;
  p.onFoot = false;
  p.x = boat.x; p.y = boat.y;
  sfx.splash();
}

function exitBoat() {
  const p = G.player;
  const boat = p.boat;
  if (!boat) return;
  boat.driver = null;
  p.boat = null;
  p.onFoot = true;
  // Drop the player at the nearest dry land.
  const w = G.world;
  let bx = boat.x, by = boat.y;
  for (let r = 0; r < 400; r += 20) {
    if (!w.isWater(bx - r, by)) { bx -= r; break; }
  }
  p.x = bx; p.y = by;
  p.vx = 0; p.vy = 0;
}

function tryFire(dt) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  if (p.fireCooldown > 0) return;
  const wantFire = w.auto ? mouseIsDown() : mouseWasPressed();
  if (!wantFire) return;
  if (p.weapon === 'fists') {
    if (p.punchCooldown <= 0) {
      meleeHit(p, p.x, p.y, p.angle);
      p.punchCooldown = 0.38;
      p.fireCooldown = 0.38;
    }
    return;
  }
  const slot = p.weapons[p.weapon];
  if (!slot || slot.ammo <= 0) {
    if (mouseWasPressed()) { sfx.denied(); floater(p.x, p.y - 28, 'NO AMMO', '#ff5555', 13); }
    p.fireCooldown = 0.25;
    return;
  }
  if (slot.ammo !== Infinity) slot.ammo--;
  const aim = Math.atan2(G.mouse.wy - p.y, G.mouse.wx - p.x);
  p.angle = aim;
  const mx = p.x + Math.cos(aim) * 24, my = p.y + Math.sin(aim) * 24;
  fireBullet(p, mx, my, aim, p.weapon, true);
  p.fireCooldown = 1 / w.rate;
}

function updateOnFoot(dt) {
  const p = G.player;
  const inp = driveInput();
  const sprint = isDown('sprint') && p.sprint > 0.05;
  const speed = sprint ? PLAYER_TUNE.sprintSpeed : PLAYER_TUNE.walkSpeed;
  if (sprint && (inp.x || inp.y)) p.sprint = Math.max(0, p.sprint - dt * 0.25);
  else p.sprint = Math.min(1, p.sprint + dt * 0.12);
  const len = Math.hypot(inp.x, inp.y) || 1;
  const tx = (inp.x / len) * speed * (inp.x || inp.y ? 1 : 0);
  const ty = (inp.y / len) * speed * (inp.x || inp.y ? 1 : 0);
  p.vx += (tx - p.vx) * Math.min(1, 12 * dt);
  p.vy += (ty - p.vy) * Math.min(1, 12 * dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.speed = Math.hypot(p.vx, p.vy);
  G.stats.distanceWalked += p.speed * dt;
  const fixed = G.world.collideCircle(p.x, p.y, 12);
  p.x = fixed.x; p.y = fixed.y;
  const c = G.world.clampToWorld(p.x, p.y);
  p.x = c.x; p.y = c.y;
  // Wading: the player can walk on the beach but not swim out.
  if (G.world.isWater(p.x, p.y)) {
    p.x -= p.vx * dt * 2; p.y -= p.vy * dt * 2;
  }
  // Aim follows the mouse when armed; otherwise face the movement.
  if (p.weapon !== 'fists' || mouseIsDown()) {
    p.angle = Math.atan2(G.mouse.wy - p.y, G.mouse.wx - p.x);
  } else if (p.speed > 20) {
    p.angle = angleLerp(p.angle, Math.atan2(p.vy, p.vx), 10 * dt);
  }
  // Run over peds? No — the player pushes through the crowd instead.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(p.x, p.y, ped.x, ped.y) < 20) {
      ped.panic = Math.max(ped.panic, 0.4);
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.x += Math.cos(a) * 30 * dt;
      ped.y += Math.sin(a) * 30 * dt;
    }
  }
  tryFire(dt);
}

function updateDriving(dt) {
  const p = G.player;
  const vehicle = p.car || p.boat;
  if (!vehicle) { p.onFoot = true; return; }
  const inp = driveInput();
  const handbrake = isDown('brake');
  let throttle = -inp.y;
  // Screenshot scenes keep the vehicle rolling on their own.
  if (G.shotMode && throttle <= 0 && !handbrake) throttle = 0.55;
  stepCarPhysics(vehicle, throttle, inp.x, handbrake, dt);
  if (vehicle.kind === 'car') {
    collideCarWorld(vehicle);
    G.stats.distanceDriven += Math.abs(vehicle.speed) * dt;
    // Running over peds while driving.
    for (const ped of G.peds) {
      if (ped.dead) continue;
      if (pointInCar(ped.x, ped.y, vehicle, 6) && Math.abs(vehicle.speed) > 120) {
        killPed(ped, true);
        addHeat(60, true);
        floater(ped.x, ped.y - 20, 'HIT AND RUN', '#ff5555', 13);
      } else if (pointInCar(ped.x, ped.y, vehicle, 26)) {
        ped.panic = 1;
      }
    }
  } else {
    // Boat: stays on the water, leaves a wake.
    const w = G.world;
    if (!w.isWater(vehicle.x, vehicle.y) && !w.isBeach(vehicle.x, vehicle.y)) {
      vehicle.x -= vehicle.vx * dt * 2;
      vehicle.y -= vehicle.vy * dt * 2;
      vehicle.vx *= 0.5; vehicle.vy *= 0.5;
    }
    vehicle.wake += dt;
    if (Math.abs(vehicle.speed) > 200 && vehicle.wake > 0.08) {
      vehicle.wake = 0;
      G.particles.push({
        x: vehicle.x - Math.cos(vehicle.angle) * vehicle.halfLen,
        y: vehicle.y - Math.sin(vehicle.angle) * vehicle.halfLen,
        vx: range(G.rng, -10, 10), vy: range(G.rng, -10, 10),
        life: 1.2, t: 0, size: range(G.rng, 5, 9), color: '#cfeef5', kind: 'wake',
      });
    }
  }
  p.x = vehicle.x; p.y = vehicle.y;
  p.angle = vehicle.angle;
  p.speed = Math.abs(vehicle.speed);
  // Drive-by: the player can shoot from the car with the mouse.
  if (p.weapon !== 'fists') tryFire(dt);
  if (wasPressed('enter')) {
    if (p.car) exitCar();
    else exitBoat();
  }
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p || G.mode !== 'playing') return;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);

  // Weapon hotkeys.
  const hotkeys = ['w1', 'w2', 'w3', 'w4', 'w5'];
  for (let i = 0; i < hotkeys.length; i++) {
    if (wasPressed(hotkeys[i])) {
      const owned = WEAPON_ORDER.filter((w) => p.weapons[w]);
      if (owned[i]) switchWeapon(owned[i]);
    }
  }

  if (p.onFoot) {
    updateOnFoot(dt);
    // Enter nearest car or boat.
    if (wasPressed('enter')) {
      const car = nearestCar(p.x, p.y, 70);
      const boat = nearestBoat(p.x, p.y, 80);
      if (car && (!boat || dist(p.x, p.y, car.x, car.y) < dist(p.x, p.y, boat.x, boat.y))) enterCar(car);
      else if (boat) enterBoat(boat);
    }
    // Pickups.
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const pk = G.pickups[i];
      if (dist(p.x, p.y, pk.x, pk.y) < 26) {
        collectPickup(pk);
        G.pickups.splice(i, 1);
      }
    }
  } else {
    updateDriving(dt);
  }

  // Context prompt.
  G.prompt = null;
  if (p.onFoot) {
    const car = nearestCar(p.x, p.y, 70);
    if (car) G.prompt = { key: 'F', text: car.driver === 'traffic' ? 'Carjack ' + car.name : 'Drive ' + car.name, action: 'enter' };
    else {
      const boat = nearestBoat(p.x, p.y, 80);
      if (boat) G.prompt = { key: 'F', text: 'Board ' + boat.name, action: 'enter' };
    }
  }
}

export function collectPickup(pk) {
  const p = G.player;
  if (pk.kind === 'cash') {
    G.cash += pk.amount;
    G.stats.cashEarned += pk.amount;
    floater(pk.x, pk.y - 20, '+$' + pk.amount, '#7dff6a');
    sfx.cash();
  } else if (pk.kind === 'health') {
    p.health = Math.min(100, p.health + 50);
    floater(pk.x, pk.y - 20, '+50 HP', '#ff6b6b');
    sfx.pickup();
  } else if (pk.kind === 'armor') {
    p.armor = Math.min(100, p.armor + 50);
    floater(pk.x, pk.y - 20, '+50 ARMOR', '#6bc2ff');
    sfx.pickup();
  } else if (pk.kind === 'package') {
    G.collected.add(pk.id);
    G.stats.packagesFound++;
    G.cash += 100;
    G.stats.cashEarned += 100;
    floater(pk.x, pk.y - 20, 'MEDALLION ' + G.collected.size + '/40  +$100', '#ffd76a');
    sfx.mission();
  }
}

function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
