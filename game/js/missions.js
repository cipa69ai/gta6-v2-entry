// The story: Dax Mercer comes home to Suncrest Bay and works his way up from
// wheelman to kingpin across 10 missions in 3 acts. Each mission is a list of
// objectives the engine steps through; completing one pays cash and respect.

import { MISSION_REWARDS } from './config.js';
import { dist, pick, range } from './util.js';
import { G } from './state.js';
import { makeCar, makeBoat } from './vehicles.js';
import { makePed, scarePeds } from './pedestrians.js';
import { addHeat, clearWanted } from './police.js';
import { giveWeapon } from './player.js';
import { fireBullet } from './combat.js';
import { sfx } from './audio.js';
import { floater } from './effects.js';

const CONTACTS = {
  sal: { name: 'Sal', color: '#ffb347', portrait: '🔧' },
  iris: { name: 'Iris', color: '#ff6b9d', portrait: '💋' },
  kade: { name: 'Boss Kade', color: '#c0392b', portrait: '👑' },
  voss: { name: 'Det. Voss', color: '#3498db', portrait: '🕵️' },
  dax: { name: 'Dax', color: '#7dff6a', portrait: '😎' },
};

// Objective types:
//  goto {x,y,r,text} — reach a marker
//  drive {x,y,r,text} — reach a marker in a vehicle
//  kill {target:ped|count,text} — eliminate marked targets
//  pickup {kind,count,text} — collect pickups
//  survive {seconds,text} — stay alive / keep the heat
//  deliver {x,y,r,text} — drive a package to a marker
//  wait {seconds,text}
//  talk {contact,text} — dialogue beat, completes on keypress

export const MISSIONS = [
  {
    id: 'm1', act: 1, title: 'Welcome Home', giver: 'sal',
    brief: 'Sal needs a wheelman. Pick up his car from the impound lot and bring it to the garage.',
    objectives: [
      { type: 'goto', poi: 'garage', text: 'Go to Sal\'s Garage', r: 90 },
      { type: 'talk', contact: 'sal', text: 'Sal: "My Comet\'s at the impound. Go get her — and don\'t scratch the paint."' },
      { type: 'goto', poi: 'impound', text: 'Go to the impound lot', r: 90 },
      { type: 'drive', poi: 'garage', text: 'Drive the Comet back to Sal\'s Garage', r: 90, needCar: 'mission' },
    ],
    onStart() { spawnMissionCar('muscle', 'impound', 0x1); },
    onComplete() { giveWeapon('pistol', 60); },
  },
  {
    id: 'm2', act: 1, title: 'First Blood', giver: 'iris',
    brief: 'Iris has a problem with the Vagos crew shaking down her club. Clear them out.',
    objectives: [
      { type: 'goto', poi: 'club', text: 'Go to The Neon Palms', r: 100 },
      { type: 'talk', contact: 'iris', text: 'Iris: "Three Vagos inside. Make them leave. Permanently, if you have to."' },
      { type: 'kill', count: 3, role: 'gang', text: 'Deal with the Vagos crew (0/3)', spawnAt: 'club' },
      { type: 'goto', poi: 'club', text: 'Return to Iris', r: 100 },
    ],
  },
  {
    id: 'm3', act: 1, title: 'Hot Cargo', giver: 'sal',
    brief: 'A crate of "spare parts" needs to reach the docks. The cops are watching the main roads — keep it clean.',
    objectives: [
      { type: 'goto', poi: 'garage', text: 'Pick up the van at Sal\'s', r: 90 },
      { type: 'deliver', poi: 'docks', text: 'Deliver the cargo to Portside (avoid the cops)', r: 110, needCar: 'mission' },
    ],
    onStart() { spawnMissionCar('van', 'garage', 0x2); },
  },
  {
    id: 'm4', act: 1, title: 'The Getaway', giver: 'iris',
    brief: 'Iris lifted a necklace from the mayor\'s gala. Get her out of downtown — the SCPD will be all over you.',
    objectives: [
      { type: 'goto', poi: 'downtown', text: 'Pick up Iris downtown', r: 90 },
      { type: 'talk', contact: 'iris', text: 'Iris: "Drive. Fast. Don\'t ask what\'s in the bag."' },
      { type: 'drive', poi: 'safehouse', text: 'Lose the cops and reach the Safehouse', r: 110, wanted: 2, loseCops: true },
    ],
    onStart() { addHeat(160, true); },
  },
  {
    id: 'm5', act: 2, title: 'Storm the Docks', giver: 'kade',
    brief: 'Kade wants the Portside racket. Take the docks from the Vagos — their turf, their guns, their problem.',
    objectives: [
      { type: 'goto', poi: 'docks', text: 'Go to Portside', r: 120 },
      { type: 'kill', count: 5, role: 'gang', text: 'Take out the Vagos guards (0/5)', spawnAt: 'docks' },
      { type: 'survive', seconds: 20, text: 'Hold the docks until Kade\'s crew arrives' },
    ],
    onComplete() { G.turf['docks'] = 'player'; G.stats.turfTaken++; },
  },
  {
    id: 'm6', act: 2, title: 'The Informant', giver: 'voss',
    brief: 'Detective Voss plays both sides. He wants a witness silenced before the trial — quietly.',
    objectives: [
      { type: 'goto', poi: 'motel', text: 'Find the witness at the Sunset Motel', r: 100 },
      { type: 'kill', count: 1, role: 'gang', text: 'Silence the witness', spawnAt: 'motel' },
      { type: 'goto', poi: 'paynspray', text: 'Lose the heat at Pay \'n Spray', r: 90 },
    ],
    onComplete() { clearWanted(); },
  },
  {
    id: 'm7', act: 2, title: 'Bay Run', giver: 'iris',
    brief: 'A shipment is coming in by boat. Pick it up at the marina and run it past the coast patrol.',
    objectives: [
      { type: 'goto', poi: 'marina', text: 'Go to Marina Docks', r: 100 },
      { type: 'drive', poi: 'beach', text: 'Take the boat to the Boardwalk drop', r: 120, needCar: 'boat' },
      { type: 'goto', poi: 'club', text: 'Bring the shipment to Iris', r: 100 },
    ],
    onStart() { spawnMissionBoat('marina'); },
  },
  {
    id: 'm8', act: 2, title: 'Turbo Heist', giver: 'sal',
    brief: 'A Vortex GT prototype is parked at the airport. Steal it, outrun airport security, and bring it to Sal.',
    objectives: [
      { type: 'goto', poi: 'airport', text: 'Get to the Airport', r: 120 },
      { type: 'drive', poi: 'garage', text: 'Steal the Vortex GT and bring it to Sal', r: 100, needCar: 'mission', wanted: 3 },
    ],
    onStart() { spawnMissionCar('sport', 'airport', 0x3); addHeat(320, true); },
    onComplete() { G.ownedCars.push({ model: 'sport', color: '#ff2d78', name: 'Vortex GT Prototype' }); },
  },
  {
    id: 'm9', act: 3, title: 'Double Cross', giver: 'voss',
    brief: 'Voss set you up. Kade\'s men are coming to the safehouse — and Voss is coming with them.',
    objectives: [
      { type: 'goto', poi: 'safehouse', text: 'Get back to the Safehouse', r: 100 },
      { type: 'kill', count: 6, role: 'gang', text: 'Defend the Safehouse (0/6)', spawnAt: 'safehouse' },
      { type: 'kill', count: 1, role: 'gang', text: 'Deal with Det. Voss', spawnAt: 'safehouse', boss: true },
    ],
  },
  {
    id: 'm10', act: 3, title: 'King of Suncrest', giver: 'kade',
    brief: 'Kade wants the whole city. Take the downtown tower, and Suncrest Bay is yours.',
    objectives: [
      { type: 'goto', poi: 'downtown', text: 'Storm the Kade Tower downtown', r: 120 },
      { type: 'kill', count: 8, role: 'gang', text: 'Clear the tower guards (0/8)', spawnAt: 'downtown' },
      { type: 'survive', seconds: 30, text: 'Hold the tower against the last wave' },
      { type: 'talk', contact: 'kade', text: 'Kade: "The city is yours now, Dax. Don\'t waste it."' },
    ],
    onComplete() {
      G.turf['downtown'] = 'player';
      G.turf['marina'] = 'player';
      G.turf['beach'] = 'player';
      G.stats.turfTaken += 3;
    },
  },
];

function poiPos(name) {
  const w = G.world;
  const found = w.pois.find((p) => p.kind === name || p.name.toLowerCase().includes(name));
  if (found) return { x: found.x, y: found.y };
  // Fallbacks for abstract markers.
  const S = w.size;
  const map = {
    impound: { x: w.roadsV[9], y: w.roadsH[1] },
    downtown: { x: 0.38 * S, y: 0.30 * S },
    docks: { x: 0.84 * S, y: 0.72 * S },
    beach: { x: 0.5 * S, y: S - 200 },
    safehouse: { x: w.roadsV[2], y: w.roadsH[9] },
    club: { x: w.roadsV[4], y: w.roadsH[3] },
    garage: { x: w.roadsV[3], y: w.roadsH[4] },
    motel: { x: w.roadsV[1], y: w.roadsH[8] },
    marina: { x: w.waterLine - 60, y: w.roadsH[3] },
    airport: { x: w.roadsV[10], y: w.roadsH[10] },
    paynspray: { x: w.roadsV[7], y: w.roadsH[3] },
  };
  return map[name] || { x: S / 2, y: S / 2 };
}

function spawnMissionCar(model, poiName, tag) {
  const pos = poiPos(poiName);
  const car = makeCar(model, pos.x + 60, pos.y, 0, { driver: null, mission: true });
  car.missionTag = tag;
  G.cars.push(car);
  return car;
}

function spawnMissionBoat(poiName) {
  const pos = poiPos(poiName);
  const boat = makeBoat(G.world.waterLine + 120, pos.y, 0);
  boat.mission = true;
  G.boats.push(boat);
  return boat;
}

function spawnGang(n, poiName, boss = false) {
  const pos = poiPos(poiName);
  const gang = [];
  for (let i = 0; i < n; i++) {
    const ped = makePed(pos.x + range(G.rng, -120, 120), pos.y + range(G.rng, -120, 120), { role: 'gang', mission: true });
    ped.shirt = boss ? '#111111' : pick(G.rng, ['#8e1f2f', '#5c1a1a', '#3a0d0d']);
    ped.health = boss ? 300 : 100;
    ped.name = boss ? 'Det. Voss' : 'Vagos';
    ped.weapon = boss ? 'rifle' : 'pistol';
    ped.shootCooldown = range(G.rng, 0.5, 1.5);
    G.peds.push(ped);
    gang.push(ped);
  }
  return gang;
}

export function missionMarker() {
  const m = G.mission;
  if (!m) return null;
  const obj = m.def.objectives[m.step];
  if (!obj) return null;
  if (obj.poi) return { ...poiPos(obj.poi), text: obj.text };
  return null;
}

export function startMission(index) {
  const def = MISSIONS[index];
  if (!def) return false;
  G.mission = {
    def, index, step: 0, timer: 0, kills: 0, targets: [],
    startedAt: G.time, noWanted: false,
  };
  if (def.onStart) def.onStart();
  const obj = def.objectives[0];
  G.objective = { text: obj.text, mission: def.title };
  G.banner = { title: def.title, sub: 'Act ' + def.act + ' — ' + def.brief, t: 4 };
  sfx.mission();
  return true;
}

export function failMission(reason) {
  const m = G.mission;
  if (!m) return;
  G.mission = null;
  G.objective = null;
  G.banner = { title: 'MISSION FAILED', sub: reason, t: 3.5 };
  sfx.fail();
  cleanupMissionEntities();
}

export function completeMission() {
  const m = G.mission;
  if (!m) return;
  const reward = MISSION_REWARDS[m.index] || 500;
  G.cash += reward;
  G.stats.cashEarned += reward;
  G.stats.missionsDone++;
  G.respect = Math.min(100, G.respect + 10);
  if (m.def.onComplete) m.def.onComplete();
  G.missionIndex = Math.max(G.missionIndex, m.index + 1);
  G.mission = null;
  G.objective = null;
  cleanupMissionEntities();
  if (G.missionIndex >= MISSIONS.length) {
    G.banner = { title: 'KING OF SUNCREST BAY', sub: 'Story complete! The city is yours — $' + reward.toLocaleString() + ' earned.', t: 6 };
  } else {
    G.banner = { title: 'MISSION PASSED', sub: m.def.title + ' — +$' + reward.toLocaleString() + '  •  Next: ' + MISSIONS[G.missionIndex].title, t: 4 };
  }
  sfx.mission();
}

function cleanupMissionEntities() {
  for (let i = G.peds.length - 1; i >= 0; i--) if (G.peds[i].mission) G.peds.splice(i, 1);
  for (let i = G.cars.length - 1; i >= 0; i--) if (G.cars[i].mission && G.cars[i].driver !== 'player') G.cars.splice(i, 1);
  for (let i = G.boats.length - 1; i >= 0; i--) if (G.boats[i].mission && G.boats[i].driver !== 'player') G.boats.splice(i, 1);
}

function advanceStep() {
  const m = G.mission;
  m.step++;
  m.timer = 0;
  m.kills = 0;
  const obj = m.def.objectives[m.step];
  if (!obj) { completeMission(); return; }
  G.objective = { text: obj.text, mission: m.def.title };
  if (obj.type === 'kill' && obj.spawnAt) {
    m.targets = spawnGang(obj.count, obj.spawnAt, !!obj.boss);
  }
  if (obj.wanted) addHeat(obj.wanted === 2 ? 160 : 320, true);
  sfx.pickup();
}

export function updateMissions(dt) {
  const m = G.mission;
  if (!m) return;
  const obj = m.def.objectives[m.step];
  if (!obj) return;
  const p = G.player;
  m.timer += dt;

  // Gang members shoot at the player.
  for (const g of m.targets) {
    if (!g || g.dead) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    if (d < 520) {
      // Move toward the player and shoot.
      const want = Math.atan2(p.y - g.y, p.x - g.x);
      if (d > 200) {
        g.x += Math.cos(want) * 150 * dt;
        g.y += Math.sin(want) * 150 * dt;
      }
      g.angle = want;
      g.shootCooldown -= dt;
      if (g.shootCooldown <= 0) {
        g.shootCooldown = range(G.rng, 0.8, 1.6);
        fireBullet(g, g.x, g.y, want + range(G.rng, -0.1, 0.1), g.weapon || 'pistol', false);
      }
    }
  }

  switch (obj.type) {
    case 'goto':
    case 'drive':
    case 'deliver': {
      const pos = poiPos(obj.poi);
      const r = obj.r || 90;
      if (dist(p.x, p.y, pos.x, pos.y) < r) {
        if (obj.type === 'drive' && obj.needCar === 'mission' && (!p.car || !p.car.mission)) {
          // Arrived on foot or in the wrong car — remind, don't advance.
          if (m.timer > 1 && Math.floor(m.timer * 2) % 2 === 0) {
            G.objective = { text: obj.text + ' (bring the mission vehicle!)', mission: m.def.title };
          }
          return;
        }
        if (obj.type === 'drive' && obj.needCar === 'boat' && !p.boat) return;
        if (obj.loseCops && G.wanted > 0) return;
        advanceStep();
      }
      break;
    }
    case 'kill': {
      const dead = m.targets.filter((t) => t.dead).length;
      if (dead !== m.kills) {
        m.kills = dead;
        G.objective = { text: obj.text.replace(/\(\d+\/\d+\)/, '(' + dead + '/' + obj.count + ')'), mission: m.def.title };
      }
      if (dead >= obj.count) advanceStep();
      break;
    }
    case 'survive': {
      G.objective = { text: obj.text + ' (' + Math.max(0, Math.ceil(obj.seconds - m.timer)) + 's)', mission: m.def.title };
      if (m.timer >= obj.seconds) advanceStep();
      break;
    }
    case 'talk': {
      const c = CONTACTS[obj.contact] || CONTACTS.dax;
      if (!G.dialogue) {
        G.dialogue = { speaker: c.name, portrait: c.portrait, color: c.color, text: obj.text.replace(/^[^:]+:\s*/, ''), onDone: () => advanceStep() };
      }
      break;
    }
    case 'wait': {
      if (m.timer >= obj.seconds) advanceStep();
      break;
    }
    default:
      advanceStep();
  }
}

export function nextMissionDef() {
  return MISSIONS[G.missionIndex] || null;
}

export function missionStartPoi() {
  const def = nextMissionDef();
  if (!def) return null;
  const first = def.objectives[0];
  return first && first.poi ? { ...poiPos(first.poi), title: def.title, giver: def.giver } : null;
}
