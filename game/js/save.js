// Save / load through localStorage: cash, story progress, owned cars and
// properties, collectibles, stats and the player's position. The game
// autosaves on mission completion and when entering the safehouse.

import { SAVE_KEY } from './config.js';
import { G, resetStats, freshPlayerState } from './state.js';
import { sfx } from './audio.js';

export function saveGame() {
  const p = G.player;
  const data = {
    v: 1,
    cash: G.cash,
    respect: G.respect,
    missionIndex: G.missionIndex,
    storyFlags: G.storyFlags,
    stats: G.stats,
    ownedCars: G.ownedCars,
    ownedProps: G.ownedProps,
    businesses: G.businesses,
    collected: [...G.collected],
    jumpsDone: [...G.jumpsDone],
    turf: G.turf,
    clock: G.clock,
    day: G.day,
    player: {
      x: p.x, y: p.y, health: p.health, armor: p.armor,
      weapons: p.weapons, weapon: p.weapon,
    },
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.v !== 1) return null;
    G.cash = data.cash;
    G.respect = data.respect;
    G.missionIndex = data.missionIndex;
    G.storyFlags = data.storyFlags || {};
    G.stats = { ...resetStats(), ...data.stats };
    G.ownedCars = data.ownedCars || [];
    G.ownedProps = data.ownedProps || [];
    G.businesses = data.businesses || [];
    G.collected = new Set(data.collected || []);
    G.jumpsDone = new Set(data.jumpsDone || []);
    G.turf = data.turf || {};
    G.clock = data.clock || 560;
    G.day = data.day || 1;
    const p = freshPlayerState();
    p.x = data.player.x; p.y = data.player.y;
    p.health = data.player.health; p.armor = data.player.armor;
    p.weapons = data.player.weapons || { fists: { ammo: Infinity } };
    p.weapon = data.player.weapon || 'fists';
    G.player = p;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

export function autosave(reason) {
  if (saveGame()) {
    G.toastQueue.push('Game saved' + (reason ? ' — ' + reason : ''));
    sfx.pickup();
  }
}
