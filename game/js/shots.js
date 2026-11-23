// Screenshot staging: ?shot=<scene> puts the game into a composed moment so
// the screenshots show the real game at its best. Every scene is the game
// itself running — no mockups, no overlays the player cannot reach.

import { G } from './state.js';
import { makeCar, spawnTraffic } from './vehicles.js';
import { spawnPeds } from './pedestrians.js';
import { addHeat } from './police.js';
import { giveWeapon } from './player.js';
import { startMission } from './missions.js';
import { dist } from './util.js';

function putPlayerInCar(model, x, y, angle) {
  const car = makeCar(model, x, y, angle, { driver: 'player', mission: true });
  car.health = 150;
  G.cars.push(car);
  const p = G.player;
  p.car = car; p.onFoot = false;
  p.x = x; p.y = y; p.angle = angle;
  car.vx = Math.cos(angle) * 420; car.vy = Math.sin(angle) * 420; car.speed = 420;
  G.cam.x = x; G.cam.y = y;
  return car;
}

function spawnChaseCops(n) {
  const p = G.player;
  for (let i = 0; i < n; i++) {
    const behind = p.angle + Math.PI + (i - 1) * 0.35;
    const d = 300 + i * 150;
    const cx = p.x + Math.cos(behind) * d;
    const cy = p.y + Math.sin(behind) * d;
    const cop = makeCar('police', cx, cy, p.angle, { driver: 'cop' });
    cop.ai = { mode: 'chase', shootCooldown: 2, stuck: 0 };
    cop.vx = Math.cos(p.angle) * 320; cop.vy = Math.sin(p.angle) * 320; cop.speed = 320;
    G.cops.push(cop);
    G.cars.push(cop);
  }
}

export function stageShot(scene) {
  const w = G.world;
  const p = G.player;
  G.mode = 'playing';
  G.banner = null; // never let the welcome banner cover a screenshot
  G.dialogue = null;
  G.cash = 2450;
  G.respect = 42;
  giveWeapon('pistol', 120);
  giveWeapon('smg', 200);
  p.health = 100; p.armor = 60;

  if (scene === 'chase') {
    // Cover shot: sunset chase downtown, 3 stars, mission objective live.
    G.clock = 18 * 60 + 35;
    G.weather = 'clear'; G.rain = 0;
    const x = w.roadsV[5], y = w.roadsH[3];
    putPlayerInCar('sport', x, y, 0);
    spawnTraffic(8);
    spawnPeds(10);
    addHeat(320, true);
    spawnChaseCops(3);
    startMission(3); // The Getaway — objective shows on the HUD
    G.objective = { text: 'Lose the cops and reach the Safehouse', mission: 'The Getaway' };
    G.banner = null;
    G.dialogue = null;
  } else if (scene === 'downtown') {
    // Midday on foot in the neon district, traffic and crowds.
    G.clock = 12 * 60 + 10;
    const x = w.roadsV[4] + 60, y = w.roadsH[3] + 40;
    p.x = x; p.y = y; p.onFoot = true; p.angle = Math.PI / 4;
    G.cam.x = x; G.cam.y = y;
    spawnTraffic(10);
    spawnPeds(16);
    G.objective = { text: 'Go to Sal\'s Garage', mission: 'Welcome Home' };
    G.cash = 850;
  } else if (scene === 'night') {
    // Rainy night, neon downtown, wanted 2, headlights on.
    G.clock = 22 * 60 + 20;
    G.weather = 'rain'; G.rain = 0.8;
    const x = w.roadsV[4], y = w.roadsH[2];
    putPlayerInCar('muscle', x, y, Math.PI / 2);
    spawnTraffic(8);
    spawnPeds(8);
    addHeat(320, true); // 3 stars at staging; decay leaves 2 by screenshot time
    spawnChaseCops(2);
    G.objective = { text: 'Lose the cops and reach the Safehouse', mission: 'The Getaway' };
  } else if (scene === 'marina') {
    // Golden hour on the bay in a boat, marina skyline behind.
    G.clock = 17 * 60 + 50;
    G.weather = 'clear'; G.rain = 0;
    const boat = G.boats[0];
    if (boat) {
      boat.x = w.waterLine + 220; boat.y = w.roadsH[3];
      boat.angle = Math.PI / 2;
      boat.driver = 'player';
      p.boat = boat; p.car = null; p.onFoot = false;
      p.x = boat.x; p.y = boat.y; p.angle = boat.angle;
      boat.vx = 0; boat.vy = 260; boat.speed = 260;
      G.cam.x = boat.x; G.cam.y = boat.y;
    }
    spawnTraffic(6);
    G.objective = { text: 'Take the boat to the Boardwalk drop', mission: 'Bay Run' };
  }
  // Settle the camera on the player.
  G.cam.x = p.x; G.cam.y = p.y;
}
