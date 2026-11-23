// The one shared game state object. Every system imports G and reads/writes
// its own corner of it; main.js owns the lifecycle (new game / load / reset).

import { ECONOMY } from './config.js';

export const G = {
  mode: 'menu',           // menu | playing | paused | dead | busted | shop | dialog
  modeBeforeShop: 'playing',
  time: 0,                // seconds since boot (real)
  clock: 9 * 60 + 20,     // in-game minutes since midnight
  day: 1,
  weather: 'clear',       // clear | rain | overcast
  weatherTimer: 0,
  rain: 0,                // 0..1 rain intensity (ramps)

  world: null,            // built by world.js
  player: null,           // built by player.js
  cars: [],               // traffic + parked + mission cars
  boats: [],              // drivable boats on the bay
  peds: [],
  cops: [],               // police cars chasing the player
  heli: null,             // police helicopter state
  bullets: [],
  particles: [],
  skidmarks: [],
  pickups: [],            // cash, health, armor, packages
  floaters: [],           // floating text popups
  roadblocks: [],

  wanted: 0,              // 0..5 stars
  heat: 0,                // underlying heat score
  heatTimer: 0,
  lastSeen: 0,            // time a cop last had line of sight
  bustedProgress: 0,

  mission: null,          // active mission runtime state
  missionIndex: 0,        // next story mission (0..9), 10 = story done
  storyFlags: {},
  side: null,             // active side activity (taxi/delivery/race/rampage)
  race: null,

  cash: ECONOMY.startCash,
  respect: 0,             // 0..100, unlocks missions and shops
  stats: null,            // built by resetStats
  ownedCars: [],          // garage: {model, color, x, y} slots
  ownedProps: [],         // property ids
  businesses: [],         // business ids paying passive income
  collected: new Set(),   // hidden package ids
  jumpsDone: new Set(),   // stunt jump ids
  turf: {},               // district id -> owner ('player'|'vagos'|'neutral')

  cam: { x: 0, y: 0, zoom: 1, shake: 0 },
  mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
  keys: {},
  prompt: null,           // contextual action prompt {key, text, action}
  toastQueue: [],
  toast: null,
  dialogue: null,         // {speaker, text, portrait, onDone}
  objective: null,        // current objective text + marker
  banner: null,           // big centre-screen banner {title, sub, t}
  pausedMenu: 'main',     // pause submenu

  muted: false,
  musicStation: 0,
  quality: 'high',
  shotMode: null,         // ?shot= scene id, or null
  seed: 1337,
  rng: Math.random,
  demo: false,            // attract-mode autopilot for the menu backdrop
  canvas: null,
  ctx: null,
  saveSlot: null,
};

export function resetStats() {
  return {
    playSeconds: 0, cashEarned: 0, missionsDone: 0, carsStolen: 0,
    kills: 0, copsEvaded: 0, distanceDriven: 0, distanceWalked: 0,
    shotsFired: 0, shotsHit: 0, deaths: 0, busted: 0, faresDone: 0,
    racesWon: 0, jumpsDone: 0, packagesFound: 0, turfTaken: 0,
  };
}

export function freshPlayerState() {
  return {
    x: 0, y: 0, angle: -Math.PI / 2, vx: 0, vy: 0, speed: 0,
    onFoot: true, car: null, boat: null,
    health: 100, armor: 0, sprint: 1,
    weapons: { fists: { ammo: Infinity } },
    weapon: 'fists',
    fireCooldown: 0, punchCooldown: 0, invuln: 0,
    lastSafeX: 0, lastSafeY: 0,
  };
}

export function resetRun() {
  G.time = 0; G.clock = 9 * 60 + 20; G.day = 1;
  G.weather = 'clear'; G.weatherTimer = 0; G.rain = 0;
  G.cars = []; G.boats = []; G.peds = []; G.cops = []; G.heli = null;
  G.bullets = []; G.particles = []; G.skidmarks = []; G.pickups = [];
  G.floaters = []; G.roadblocks = [];
  G.wanted = 0; G.heat = 0; G.heatTimer = 0; G.bustedProgress = 0;
  G.mission = null; G.side = null; G.race = null;
  G.cash = ECONOMY.startCash; G.respect = 0;
  G.stats = resetStats();
  G.ownedCars = []; G.ownedProps = []; G.businesses = [];
  G.collected = new Set(); G.jumpsDone = new Set();
  G.turf = {};
  G.prompt = null; G.toastQueue = []; G.toast = null;
  G.dialogue = null; G.objective = null; G.banner = null;
  G.player = freshPlayerState();
  G.cam = { x: 0, y: 0, zoom: 1, shake: 0 };
}
