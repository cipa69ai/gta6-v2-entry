// Suncrest Bay — tuning, palettes and world constants.
// One place for every number the rest of the game agrees on.

export const WORLD = {
  size: 4200,          // world is WORLD.size x WORLD.size pixels
  roadGap: 320,        // distance between parallel roads
  roadWidth: 92,
  sidewalk: 26,
  blockInset: 14,
};

export const DISTRICTS = [
  { id: 'downtown', name: 'Downtown', cx: 0.38, cy: 0.30, r: 0.20, hue: 'neon',   density: 1.0 },
  { id: 'marina',   name: 'Marina',   cx: 0.86, cy: 0.30, r: 0.16, hue: 'harbor', density: 0.7 },
  { id: 'beach',    name: 'Boardwalk',cx: 0.50, cy: 0.94, r: 0.22, hue: 'sand',   density: 0.6 },
  { id: 'barrio',   name: 'El Prado', cx: 0.16, cy: 0.62, r: 0.18, hue: 'warm',   density: 0.85 },
  { id: 'hills',    name: 'Vista Hills', cx: 0.20, cy: 0.14, r: 0.16, hue: 'green', density: 0.5 },
  { id: 'docks',    name: 'Portside', cx: 0.84, cy: 0.72, r: 0.17, hue: 'rust',   density: 0.8 },
];

export const PALETTE = {
  asphalt: '#2e2f36', asphaltEdge: '#23242a', lane: '#e8e3c8',
  sidewalk: '#8f8b82', sidewalkEdge: '#7a766e',
  grass: '#5d8a4a', grassDry: '#7a9a52', sand: '#e6d29a',
  water: '#1f6f8b', waterDeep: '#155a75', waterShallow: '#3d9ab5',
  buildingRoof: ['#b8b0a0', '#a89f8d', '#c4b9a5', '#9b9484', '#b5a48c', '#a8574a', '#5a6b8a', '#8a7a5a', '#7a8a6a', '#c98a5a'],
  neon: ['#ff2d78', '#22e6ff', '#ffe14d', '#a855f7', '#39ff88'],
};

export const PLAYER_TUNE = {
  walkSpeed: 210, sprintSpeed: 330, accel: 2400, friction: 1800,
  maxHealth: 100, maxArmor: 100, punchDamage: 12, punchRange: 46,
};

export const CAR_TUNE = {
  accel: 620, reverseAccel: 420, maxSpeed: 620, maxReverse: 220,
  turnRate: 2.9, grip: 5.2, driftGrip: 1.6, brake: 900, drag: 0.35,
};

export const WEAPONS = {
  fists:  { name: 'Fists',    damage: 12, rate: 2.6, range: 48,  auto: false, ammo: Infinity, price: 0,    icon: '✊' },
  pistol: { name: 'P9 Pistol',damage: 18, rate: 4.5, range: 520, auto: false, ammo: 120,      price: 250,  icon: '🔫' },
  smg:    { name: 'VK-9 SMG', damage: 11, rate: 11,  range: 460, auto: true,  ammo: 300,      price: 900,  icon: '🔫' },
  shotgun:{ name: 'M870 Scattergun', damage: 9, rate: 1.6, range: 300, auto: false, ammo: 48, price: 1400, icon: '🔫', pellets: 7 },
  rifle:  { name: 'AR-77 Carbine', damage: 26, rate: 7.5, range: 700, auto: true, ammo: 180, price: 2400, icon: '🔫' },
  rpg:    { name: 'RL-9 Launcher', damage: 120, rate: 0.8, range: 800, auto: false, ammo: 12, price: 5000, icon: '🚀', explosive: true },
};

export const CAR_MODELS = [
  { id: 'sedan',   name: 'Meridian Sedan',  top: 560, accel: 560, grip: 5.4, color: ['#c23b2e', '#3b6ec2', '#d8d8d8', '#3aa655'] },
  { id: 'coupe',   name: 'Falcon Coupe',    top: 680, accel: 700, grip: 5.0, color: ['#e8b93b', '#222831', '#c23b8e', '#2ec2b0'] },
  { id: 'taxi',    name: 'City Cab',        top: 540, accel: 540, grip: 5.2, color: ['#f5c518'] },
  { id: 'van',     name: 'Hauler Van',      top: 470, accel: 420, grip: 5.8, color: ['#8a8f98', '#6b4f2e', '#d8d8d8'] },
  { id: 'muscle',  name: 'Comet Muscle',    top: 720, accel: 800, grip: 4.4, color: ['#8e1f2f', '#1f3a8e', '#e86a1f'] },
  { id: 'sport',   name: 'Vortex GT',       top: 820, accel: 900, grip: 4.8, color: ['#ff2d78', '#22e6ff', '#ffe14d'] },
  { id: 'police',  name: 'SCPD Interceptor',top: 700, accel: 780, grip: 5.6, color: ['#1d2733'] },
  { id: 'truck',   name: 'Box Truck',       top: 430, accel: 360, grip: 6.0, color: ['#d8d8d8', '#4a7a3a'] },
];

export const WANTED = {
  // heat thresholds per star; heat decays when no cop sees the player
  stars: [0, 60, 160, 320, 560, 900],
  crimeHeat: { killPed: 90, killCop: 220, carjack: 35, shoot: 25, hitCar: 8, speedNearCop: 5 },
  decayPerSec: 14, unseenDecayBonus: 26,
  maxCops: [0, 2, 3, 4, 6, 8],
  heliAtStars: 4, roadblockAtStars: 3,
};

export const ECONOMY = {
  startCash: 150,
  paynsprayCost: 100, bribeCost: 400, resprayCost: 150,
  armorPrice: 200, healthPrice: 80,
  taxiFareBase: 45, deliveryPay: 120, racePrize: 500,
  businessIncomePerMin: 25,
};

export const MISSION_REWARDS = [200, 350, 500, 650, 800, 1000, 1300, 1600, 2000, 3000];

export const DAY_LENGTH_SEC = 420; // one full in-game day
export const SAVE_KEY = 'suncrest-bay-save-v1';
