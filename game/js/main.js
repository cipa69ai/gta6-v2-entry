// Suncrest Bay — boot, game loop and glue. Owns the mode state machine
// (menu / playing / paused / shop / dead / busted), the clock and weather,
// POI interactions, and the demo camera behind the title screen.

import { DAY_LENGTH_SEC, ECONOMY } from './config.js';
import { mulberry32, hashSeed, dist, clamp } from './util.js';
import { G, resetRun } from './state.js';
import { buildWorld } from './world.js';
import { initInput, wasPressed, isDown, endFrameInput } from './input.js';
import { initAudio, resumeAudio, updateAudio, setMuted, nextStation, sfx } from './audio.js';
import { spawnTraffic, spawnParked, spawnBoats, updateVehicles, nearestCar } from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { updatePlayer, giveWeapon, collectPickup } from './player.js';
import { updateBullets } from './combat.js';
import { updatePolice, clearWanted } from './police.js';
import { updateMissions, startMission, nextMissionDef, missionStartPoi } from './missions.js';
import { updateActivities, startTaxi, startDelivery, startRace, startRampage, startTurf } from './activities.js';
import { updateEconomy, buyWeapon, buyUpgrade, buyProperty, paynspray, bribeCop, healAtSafehouse } from './economy.js';
import { updateEffects } from './effects.js';
import { resize, renderFrame, updateCamera, updateRain, daylight } from './render.js';
import { bindHud, updateHud, updateOverlays, show, hide, openShop, closeShop, showStats, hideStats, showPause, hidePause, showDead, showBusted, nextMissionHint } from './hud.js';
import { saveGame, loadGame, hasSave, autosave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '1337', 10);

function newGame() {
  resetRun();
  G.seed = SEED;
  G.rng = mulberry32(hashSeed('suncrest-' + SEED));
  buildWorld(SEED);
  const spawn = G.world.spawn;
  G.player.x = spawn.x; G.player.y = spawn.y;
  G.player.lastSafeX = spawn.x; G.player.lastSafeY = spawn.y;
  G.cam.x = spawn.x; G.cam.y = spawn.y;
  giveWeapon('pistol', 24);
  spawnTraffic(16);
  spawnParked(22);
  spawnPeds(26);
  spawnBoats();
  seedPickups();
  G.mode = 'playing';
  G.banner = { title: 'SUNCREST BAY', sub: 'Welcome home, Dax. Follow the ◆ marker to start your first job.', t: 5 };
  G.objective = { text: nextMissionHint(), mission: 'Suncrest Bay' };
}

function seedPickups() {
  const w = G.world;
  // Health and armor pickups near hospitals and shops.
  for (const poi of w.pois) {
    if (poi.kind === 'hospital') {
      G.pickups.push({ kind: 'health', x: poi.x + 40, y: poi.y + 40, t: 9999 });
      G.pickups.push({ kind: 'armor', x: poi.x - 40, y: poi.y + 40, t: 9999 });
    }
  }
  // A few cash drops around town.
  for (let i = 0; i < 12; i++) {
    const x = 200 + G.rng() * (w.size - 900);
    const y = 200 + G.rng() * (w.size - 500);
    if (!w.onRoad(x, y)) G.pickups.push({ kind: 'cash', x, y, amount: 25 + Math.floor(G.rng() * 75), t: 9999 });
  }
}

function continueGame() {
  resetRun();
  G.seed = SEED;
  G.rng = mulberry32(hashSeed('suncrest-' + SEED));
  buildWorld(SEED);
  const data = loadGame();
  if (!data) { newGame(); return; }
  const p = G.player;
  G.cam.x = p.x; G.cam.y = p.y;
  spawnTraffic(16);
  spawnParked(22);
  spawnPeds(26);
  spawnBoats();
  seedPickups();
  G.mode = 'playing';
  G.banner = { title: 'WELCOME BACK', sub: nextMissionHint(), t: 4 };
  G.objective = { text: nextMissionHint(), mission: 'Suncrest Bay' };
}

function startDemo() {
  // Attract mode behind the title screen: a slow camera drift over the city.
  resetRun();
  G.seed = SEED;
  G.rng = mulberry32(hashSeed('suncrest-' + SEED));
  buildWorld(SEED);
  const spawn = G.world.spawn;
  G.player.x = spawn.x; G.player.y = spawn.y;
  G.cam.x = spawn.x; G.cam.y = spawn.y;
  G.demo = true;
  spawnTraffic(18);
  spawnParked(22);
  spawnPeds(30);
  spawnBoats();
  G.mode = 'menu';
}

function respawnAfterDeath() {
  const w = G.world;
  const hospital = w.pois.find((p) => p.kind === 'hospital');
  const p = G.player;
  p.health = 100; p.armor = 0;
  p.onFoot = true; p.car = null; p.boat = null;
  p.x = hospital ? hospital.x + 60 : w.spawn.x;
  p.y = hospital ? hospital.y + 60 : w.spawn.y;
  G.cam.x = p.x; G.cam.y = p.y;
  clearWanted();
  const lost = Math.min(G.cash, 100);
  G.cash -= lost;
  G.mission = null;
  G.objective = { text: nextMissionHint(), mission: 'Suncrest Bay' };
  G.mode = 'playing';
  hide('dead-menu');
  G.banner = { title: 'PATCHED UP', sub: 'St. Mercy put you back together. -$' + lost, t: 3 };
}

function respawnAfterBusted() {
  const w = G.world;
  const p = G.player;
  p.health = 100;
  p.onFoot = true; p.car = null; p.boat = null;
  p.x = w.roadsV[4]; p.y = w.roadsH[2];
  G.cam.x = p.x; G.cam.y = p.y;
  clearWanted();
  // Confiscated weapons (keep fists).
  p.weapons = { fists: { ammo: Infinity } };
  p.weapon = 'fists';
  G.mission = null;
  G.objective = { text: nextMissionHint(), mission: 'Suncrest Bay' };
  G.mode = 'playing';
  hide('busted-menu');
  G.banner = { title: 'RELEASED', sub: 'Time served. Your weapons were confiscated.', t: 3 };
}

function nearestPoi(maxD) {
  const p = G.player;
  let best = null, bd = maxD;
  for (const poi of G.world.pois) {
    const d = dist(p.x, p.y, poi.x, poi.y);
    if (d < bd) { bd = d; best = poi; }
  }
  return best;
}

function handleInteractions() {
  const p = G.player;
  if (!p.onFoot) return;
  if (G.dialogue) return; // dialogue eats the E key, not the world
  // Mission start.
  const start = missionStartPoi();
  if (start && !G.mission && dist(p.x, p.y, start.x, start.y) < 110) {
    G.prompt = { key: 'E', text: 'Start mission: ' + start.title, action: 'mission' };
    if (wasPressed('action')) {
      startMission(G.missionIndex);
      sfx.mission();
    }
    return;
  }
  const poi = nearestPoi(110);
  if (!poi) return;
  if (poi.kind === 'gunshop') {
    G.prompt = { key: 'E', text: 'Enter the Gun Barn', action: 'shop' };
    if (wasPressed('action')) openShop('gunshop', (id) => buyWeapon(id));
  } else if (poi.kind === 'garage' || poi.kind === 'garage2') {
    G.prompt = { key: 'E', text: 'Enter the Garage', action: 'shop' };
    if (wasPressed('action')) openShop('garage', (id) => buyUpgrade(id));
  } else if (poi.kind === 'paynspray') {
    G.prompt = { key: 'E', text: 'Pay \'n Spray — $' + ECONOMY.paynsprayCost, action: 'paynspray' };
    if (wasPressed('action')) G.toastQueue.push(paynspray());
  } else if (poi.kind === 'safehouse') {
    G.prompt = { key: 'E', text: 'Rest & save game', action: 'safehouse' };
    if (wasPressed('action')) { healAtSafehouse(); autosave('safehouse'); }
  } else if (poi.kind === 'hospital') {
    G.prompt = { key: 'E', text: 'Get treated — $' + ECONOMY.healthPrice, action: 'hospital' };
    if (wasPressed('action')) {
      if (G.cash >= ECONOMY.healthPrice) {
        G.cash -= ECONOMY.healthPrice;
        p.health = 100;
        G.toastQueue.push('Treated — full health.');
        sfx.pickup();
      } else G.toastQueue.push('Not enough cash for treatment.');
    }
  } else if (poi.kind === 'club' || poi.kind === 'shop' || poi.kind === 'motel') {
    const owned = G.ownedProps.includes(poi.kind);
    G.prompt = { key: 'E', text: owned ? poi.name + ' (yours)' : 'Buy ' + poi.name, action: 'property' };
    if (wasPressed('action') && !owned) openShop('property', (id) => buyProperty(id));
  } else if (poi.kind === 'marina') {
    G.prompt = { key: 'E', text: 'Boats are moored on the bay — press F near one', action: null };
  }
}

function handleActivityKeys() {
  const p = G.player;
  if (wasPressed('taxi') && p.car) {
    if (!startTaxi()) G.toastQueue.push('Finish your current activity first.');
  }
  if (wasPressed('delivery')) {
    if (!startDelivery()) G.toastQueue.push('Finish your current activity first.');
  }
  if (wasPressed('rampage')) {
    if (!startRampage()) G.toastQueue.push('Finish your current activity first.');
  }
  if (wasPressed('race')) {
    if (p.car) {
      if (!startRace()) G.toastQueue.push('Finish your current activity first — or get in a car.');
    } else G.toastQueue.push('You need a car to race.');
  }
  if (wasPressed('bribe')) {
    G.toastQueue.push(bribeCop());
  }
  if (wasPressed('station')) {
    G.toastQueue.push('♪ ' + nextStation());
  }
  // Turf war: press G near a gang-held district centre.
  if (wasPressed('turf')) {
    const d = G.world.districtAt(p.x, p.y);
    if (d && ['barrio', 'docks', 'beach', 'marina'].includes(d.id)) {
      if (!startTurf(d.id)) G.toastQueue.push('This turf is already yours — or you are busy.');
    } else G.toastQueue.push('No gang turf here. Try El Prado, Portside, the Boardwalk or the Marina.');
  }
}

function updateClockAndWeather(dt) {
  G.clock += dt * (1440 / DAY_LENGTH_SEC);
  if (G.clock >= 1440) { G.clock -= 1440; G.day++; }
  G.weatherTimer -= dt;
  if (G.weatherTimer <= 0) {
    G.weatherTimer = 90 + G.rng() * 120;
    G.weather = G.rng() < 0.3 ? 'rain' : 'clear';
  }
  const targetRain = G.weather === 'rain' ? 0.85 : 0;
  G.rain = clamp(G.rain + (targetRain - G.rain) * dt * 0.5, 0, 1);
  if (G.rain > 0.05) updateRain(dt);
}

function update(dt) {
  G.time += dt;
  if (G.mode === 'menu') {
    // Demo camera drifts across the city.
    const t = G.time * 0.02;
    G.cam.x = G.world.size * (0.3 + 0.25 * Math.sin(t));
    G.cam.y = G.world.size * (0.35 + 0.2 * Math.cos(t * 0.8));
    updateVehicles(dt);
    updatePeds(dt);
    updateEffects(dt);
    updateClockAndWeather(dt);
    return;
  }
  if (G.mode === 'paused' || G.mode === 'shop') {
    // Esc resumes from pause or closes the shop.
    if (wasPressed('pause')) {
      if (G.mode === 'paused') { hidePause(); hideStats(); G.mode = 'playing'; }
      else closeShop();
    }
    return;
  }
  if (G.mode === 'dead' || G.mode === 'busted') {
    updateEffects(dt);
    return;
  }
  // Playing.
  G.stats.playSeconds += dt;
  updateClockAndWeather(dt);
  updatePlayer(dt);
  updateVehicles(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateMissions(dt);
  updateActivities(dt);
  updateBullets(dt);
  updateEconomy(dt);
  updateEffects(dt);
  updateCamera(dt);
  // Dialogue advance comes BEFORE world interactions so E answers the
  // dialogue instead of opening a shop behind it.
  if (G.dialogue && (wasPressed('action') || wasPressed('confirm') || wasPressed('enter'))) {
    const d = G.dialogue;
    G.dialogue = null;
    if (d.onDone) d.onDone();
  }
  handleInteractions();
  handleActivityKeys();
  // Hidden packages: walking over one collects it.
  const p = G.player;
  if (p.onFoot) {
    for (const pkg of G.world.packages) {
      if (!pkg.taken && !G.collected.has(pkg.id) && dist(p.x, p.y, pkg.x, pkg.y) < 30) {
        pkg.taken = true;
        collectPickup({ kind: 'package', id: pkg.id, x: pkg.x, y: pkg.y });
      }
    }
  }
  // Pause.
  if (wasPressed('pause')) {
    G.mode = 'paused';
    showPause();
    sfx.click();
  }
  if (wasPressed('mute')) setMuted(!G.muted);
  // Death / busted transitions.
  if (G.mode === 'playing' && p.health <= 0) {
    G.mode = 'dead';
    showDead();
  }
}

let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  update(dt);
  updateAudio(dt);
  if (G.mode !== 'menu') {
    updateHud();
    updateOverlays(dt);
  }
  renderFrame();
  endFrameInput();
  requestAnimationFrame(loop);
}

function wireMenus() {
  const $ = (id) => document.getElementById(id);
  $('btn-new').addEventListener('click', () => {
    initAudio(); resumeAudio();
    hide('menu'); show('hud');
    newGame();
  });
  $('btn-continue').addEventListener('click', () => {
    initAudio(); resumeAudio();
    hide('menu'); show('hud');
    continueGame();
  });
  if (!hasSave()) $('btn-continue').disabled = true;
  $('btn-how').addEventListener('click', () => {
    $('howto').classList.toggle('hidden');
  });
  $('btn-resume').addEventListener('click', () => {
    hidePause(); hideStats();
    G.mode = 'playing';
    sfx.click();
  });
  $('btn-stats').addEventListener('click', () => showStats());
  $('btn-stats-close').addEventListener('click', () => hideStats());
  $('btn-save').addEventListener('click', () => {
    if (saveGame()) G.toastQueue.push('Game saved.');
    sfx.click();
  });
  $('btn-quit').addEventListener('click', () => {
    hidePause(); hideStats(); hide('hud');
    show('menu');
    startDemo();
  });
  $('btn-respawn').addEventListener('click', () => respawnAfterDeath());
  $('btn-release').addEventListener('click', () => respawnAfterBusted());
  $('shop-close').addEventListener('click', () => closeShop());
  // Shot mode: skip the menu entirely.
  if (SHOT) {
    G.shotMode = SHOT;
    hide('menu'); show('hud');
    newGame();
    stageShot(SHOT);
  }
  window.addEventListener('resize', () => resize(G.canvas));
}

export function boot() {
  const canvas = document.getElementById('game');
  G.canvas = canvas;
  G.ctx = canvas.getContext('2d');
  resize(canvas);
  bindHud();
  initInput(canvas);
  startDemo();
  wireMenus();
  // Headless-validation hooks (harmless in normal play).
  window.__game = G;
  window.__gameReady = true;
  requestAnimationFrame(loop);
}

boot();
