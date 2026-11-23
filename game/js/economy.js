// Money in, money out: the Gun Barn, Sal's garage upgrades, Pay 'n Spray,
// safehouse healing, buyable businesses that pay passive income, and the
// bribe that gets the heat off your back.

import { WEAPONS, ECONOMY } from './config.js';
import { fmtCash } from './util.js';
import { G } from './state.js';
import { giveWeapon } from './player.js';
import { clearWanted } from './police.js';
import { sfx } from './audio.js';
import { floater } from './effects.js';

export const GUN_STOCK = [
  { id: 'pistol', label: 'P9 Pistol', price: 250, ammoPrice: 40 },
  { id: 'smg', label: 'VK-9 SMG', price: 900, ammoPrice: 80 },
  { id: 'shotgun', label: 'M870 Scattergun', price: 1400, ammoPrice: 90 },
  { id: 'rifle', label: 'AR-77 Carbine', price: 2400, ammoPrice: 120 },
  { id: 'rpg', label: 'RL-9 Launcher', price: 5000, ammoPrice: 300 },
];

export const GARAGE_UPGRADES = [
  { id: 'engine', label: 'Engine tune (+top speed)', price: 800 },
  { id: 'armor', label: 'Plating (+car health)', price: 600 },
  { id: 'paint', label: 'Fresh paint job', price: 150 },
  { id: 'repair', label: 'Full repair', price: 120 },
];

export const PROPERTIES = [
  { id: 'club', name: 'The Neon Palms', price: 5000, income: 60, desc: 'Nightclub — $60/min passive income' },
  { id: 'shop', name: 'Bait & Tackle', price: 1800, income: 25, desc: 'Marina shop — $25/min passive income' },
  { id: 'motel', name: 'Sunset Motel', price: 2500, income: 35, desc: 'Motel — $35/min passive income' },
];

export function canAfford(amount) { return G.cash >= amount; }

export function spend(amount) {
  if (!canAfford(amount)) return false;
  G.cash -= amount;
  return true;
}

export function buyWeapon(id) {
  const item = GUN_STOCK.find((g) => g.id === id);
  const p = G.player;
  if (!item) return 'No such weapon.';
  if (p.weapons[id]) {
    // Already owned: buy ammo instead.
    if (!spend(item.ammoPrice)) return 'Not enough cash for ammo.';
    p.weapons[id].ammo += WEAPONS[id].ammo;
    sfx.cash();
    return 'Bought ' + WEAPONS[id].ammo + ' rounds of ' + item.label + ' ammo.';
  }
  if (!spend(item.price)) return 'Not enough cash.';
  giveWeapon(id);
  sfx.cash();
  return 'Bought the ' + item.label + ' — press ' + (Object.keys(p.weapons).length) + ' to draw it.';
}

export function buyUpgrade(id) {
  const p = G.player;
  const car = p.car;
  const item = GARAGE_UPGRADES.find((u) => u.id === id);
  if (!item) return 'No such upgrade.';
  if (id === 'repair') {
    if (!car) return 'Bring a car to repair it.';
    if (!spend(item.price)) return 'Not enough cash.';
    car.health = 100; car.smoking = false; car.burning = false;
    sfx.cash();
    return 'Car fully repaired.';
  }
  if (id === 'paint') {
    if (!car) return 'Bring a car to repaint it.';
    if (!spend(item.price)) return 'Not enough cash.';
    car.color = '#' + Math.floor(G.rng() * 0xffffff).toString(16).padStart(6, '0');
    sfx.cash();
    return 'Fresh paint — looking sharp.';
  }
  if (id === 'engine') {
    if (!car) return 'Bring a car to tune it.';
    if (!spend(item.price)) return 'Not enough cash.';
    car.top = Math.min(980, car.top * 1.12);
    car.accel = Math.min(1200, car.accel * 1.12);
    sfx.cash();
    return 'Engine tuned — top speed up.';
  }
  if (id === 'armor') {
    if (!car) return 'Bring a car to plate it.';
    if (!spend(item.price)) return 'Not enough cash.';
    car.health = 150;
    sfx.cash();
    return 'Armour plating fitted — car health up.';
  }
  return 'Done.';
}

export function buyProperty(id) {
  const prop = PROPERTIES.find((x) => x.id === id);
  if (!prop) return 'No such property.';
  if (G.ownedProps.includes(id)) return 'You already own that.';
  if (!spend(prop.price)) return 'Not enough cash — ' + fmtCash(prop.price) + ' needed.';
  G.ownedProps.push(id);
  G.businesses.push(id);
  sfx.mission();
  return 'You now own ' + prop.name + ' — it pays ' + fmtCash(prop.income) + '/min.';
}

export function paynspray() {
  const p = G.player;
  if (!p.car) return 'Bring a car to respray it.';
  if (!spend(ECONOMY.paynsprayCost)) return 'Not enough cash.';
  p.car.health = 100;
  p.car.smoking = false;
  p.car.burning = false;
  clearWanted();
  sfx.cash();
  return 'Fresh coat, clean plates — the heat is off.';
}

export function bribeCop() {
  if (G.wanted === 0) return 'No heat to clear.';
  if (!spend(ECONOMY.bribeCost)) return 'Not enough cash for a bribe.';
  clearWanted();
  sfx.cash();
  return 'The dispatcher "lost" your file. Heat cleared.';
}

export function healAtSafehouse() {
  const p = G.player;
  p.health = 100;
  p.armor = 50;
  floater(p.x, p.y - 40, 'RESTED — health and armor restored', '#7dff6a');
  sfx.pickup();
}

let incomeTimer = 0;
export function updateEconomy(dt) {
  incomeTimer += dt;
  if (incomeTimer >= 60) {
    incomeTimer = 0;
    let income = 0;
    for (const id of G.businesses) {
      const prop = PROPERTIES.find((x) => x.id === id);
      if (prop) income += prop.income;
    }
    if (income > 0) {
      G.cash += income;
      G.stats.cashEarned += income;
      floater(G.player.x, G.player.y - 50, 'BUSINESS INCOME +$' + income, '#7dff6a');
    }
  }
}
