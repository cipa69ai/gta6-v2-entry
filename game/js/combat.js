// Combat: bullets with travel time, hit resolution against peds, cars and the
// player, melee punches, and the damage numbers that float off hits.

import { WEAPONS } from './config.js';
import { dist, pointInCar, range } from './util.js';
import { G } from './state.js';
import { damageCar, explodeAt } from './vehicles.js';
import { killPed, scarePeds } from './pedestrians.js';
import { blood, muzzle, floater, burst } from './effects.js';
import { sfx } from './audio.js';
import { addHeat } from './police.js';

export function fireBullet(shooter, x, y, angle, weaponId, friendly) {
  const w = WEAPONS[weaponId];
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const spread = pellets > 1 ? range(G.rng, -0.09, 0.09) : range(G.rng, -0.02, 0.02);
    G.bullets.push({
      x, y, angle: angle + spread,
      vx: Math.cos(angle + spread) * 1100, vy: Math.sin(angle + spread) * 1100,
      damage: w.damage, range: w.range, travelled: 0,
      explosive: !!w.explosive, friendly, shooter,
      kind: weaponId,
    });
  }
  muzzle(x, y, angle);
  sfx.shoot(weaponId === 'smg' || weaponId === 'rifle' ? 'smg' : weaponId);
  if (friendly) {
    G.stats.shotsFired += pellets;
    scarePeds(x, y, 420, 0.9);
    addHeat(4, false);
  }
}

export function meleeHit(attacker, x, y, angle) {
  sfx.punch();
  const reach = 52;
  const hx = x + Math.cos(angle) * reach * 0.7;
  const hy = y + Math.sin(angle) * reach * 0.7;
  let hit = false;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(hx, hy, ped.x, ped.y) < 34) {
      ped.health -= 14;
      blood(ped.x, ped.y, 6);
      ped.panic = 1;
      if (ped.health <= 0) killPed(ped, attacker === G.player);
      hit = true;
    }
  }
  if (attacker === G.player) {
    const pl = G.player;
    if (!pl.onFoot) return hit;
    // Punching a car dents it.
    for (const car of G.cars) {
      if (car.health > 0 && pointInCar(hx, hy, car, 8)) {
        damageCar(car, 3);
        hit = true;
      }
    }
  } else if (attacker !== G.player && G.player.onFoot) {
    const pl = G.player;
    if (dist(hx, hy, pl.x, pl.y) < 34 && pl.invuln <= 0) {
      damagePlayer(10, attacker);
      hit = true;
    }
  }
  return hit;
}

export function damagePlayer(amount, source) {
  const pl = G.player;
  if (pl.invuln > 0 || G.mode !== 'playing') return;
  let rest = amount;
  if (pl.armor > 0) {
    const absorbed = Math.min(pl.armor, rest * 0.6);
    pl.armor -= absorbed;
    rest -= absorbed;
  }
  pl.health -= rest;
  pl.invuln = 0.25;
  G.cam.shake = Math.max(G.cam.shake, 5);
  floater(pl.x, pl.y - 30, '-' + Math.round(amount), '#ff5555');
  if (pl.health <= 0) {
    pl.health = 0;
    diePlayer();
  }
}

export function diePlayer() {
  G.mode = 'dead';
  G.stats.deaths++;
  sfx.fail();
}

export function updateBullets(dt) {
  const w = G.world;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    const step = Math.hypot(b.vx, b.vy) * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += step;
    let dead = b.travelled >= b.range;
    // Building hit: stop with a spark.
    if (!dead) {
      for (const c of w.colliders) {
        if (b.x >= c.x && b.x <= c.x + c.w && b.y >= c.y && b.y <= c.y + c.h) {
          burst(b.x, b.y, 4, ['#ffd76a', '#ffffff'], 120, 0.3, 2);
          dead = true;
          break;
        }
      }
    }
    if (!dead && b.explosive) {
      // RPG detonates on first contact.
      let hit = false;
      for (const car of G.cars) if (car.health > 0 && pointInCar(b.x, b.y, car, 4)) { hit = true; break; }
      if (!hit) for (const ped of G.peds) if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 16) { hit = true; break; }
      if (!hit && !b.friendly && G.player.onFoot && dist(b.x, b.y, G.player.x, G.player.y) < 18) hit = true;
      if (hit) { explodeAt(b.x, b.y); dead = true; }
    }
    if (!dead) {
      if (b.friendly) {
        for (const ped of G.peds) {
          if (ped.dead || ped === b.shooter) continue;
          if (dist(b.x, b.y, ped.x, ped.y) < 15) {
            ped.health -= b.damage;
            blood(ped.x, ped.y, 8);
            floater(ped.x, ped.y - 20, '' + b.damage, '#ffcc55', 13);
            G.stats.shotsHit++;
            ped.panic = 1;
            if (ped.health <= 0) {
              killPed(ped, true);
              if (ped.role === 'gang') { /* gang kills are expected */ }
              else addHeat(90, true);
            }
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const car of G.cars) {
            if (car.health <= 0) continue;
            if (pointInCar(b.x, b.y, car, 2)) {
              damageCar(car, b.damage);
              G.stats.shotsHit++;
              burst(b.x, b.y, 3, ['#ffd76a'], 100, 0.25, 2);
              dead = true;
              break;
            }
          }
        }
        if (!dead && G.heli && dist(b.x, b.y, G.heli.x, G.heli.y) < 34) {
          G.heli.health -= b.damage;
          G.stats.shotsHit++;
          burst(b.x, b.y, 4, ['#ffd76a'], 120, 0.3, 2);
          dead = true;
        }
      } else {
        // Enemy bullet: only the player matters.
        const pl = G.player;
        if (pl.onFoot && dist(b.x, b.y, pl.x, pl.y) < 16) {
          damagePlayer(b.damage, b.shooter);
          dead = true;
        } else if (!pl.onFoot && pl.car && pointInCar(b.x, b.y, pl.car, 2)) {
          damageCar(pl.car, b.damage * 0.6);
          dead = true;
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}
