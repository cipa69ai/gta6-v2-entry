// The DOM layer: HUD readouts, menus, dialogue boxes, shop screens, banners
// and toasts. Canvas draws the world; this module draws everything else.

import { WEAPONS, ECONOMY } from './config.js';
import { fmtCash, fmtClock } from './util.js';
import { G } from './state.js';
import { stationName } from './audio.js';
import { nextMissionDef } from './missions.js';
import { GUN_STOCK, GARAGE_UPGRADES, PROPERTIES } from './economy.js';
import { daylight } from './render.js';

let el = {};

export function bindHud() {
  const ids = ['hud', 'cash', 'stars', 'health-bar', 'armor-bar', 'health-text',
    'clock', 'district', 'objective', 'objective-mission', 'speed', 'weapon',
    'ammo', 'prompt', 'banner', 'banner-title', 'banner-sub', 'toast',
    'dialogue', 'dialogue-speaker', 'dialogue-text', 'dialogue-portrait',
    'menu', 'pause-menu', 'dead-menu', 'busted-menu', 'shop-menu', 'shop-title',
    'shop-list', 'shop-close', 'stats-menu', 'stats-list', 'respect-bar',
    'respect-text', 'station', 'help-line', 'vignette'];
  for (const id of ids) el[id] = document.getElementById(id);
}

export function show(id) { if (el[id]) el[id].classList.remove('hidden'); }
export function hide(id) { if (el[id]) el[id].classList.add('hidden'); }

export function updateHud() {
  const p = G.player;
  if (!p || !el.hud) return;
  el.cash.textContent = fmtCash(G.cash);
  // Wanted stars.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < G.wanted ? '★' : '☆';
  el.stars.textContent = stars;
  el.stars.className = 'stars' + (G.wanted > 0 ? ' wanted' : '');
  el['health-bar'].style.width = Math.max(0, p.health) + '%';
  el['armor-bar'].style.width = Math.max(0, p.armor) + '%';
  el['health-text'].textContent = Math.ceil(p.health) + ' HP';
  el.clock.textContent = fmtClock(G.clock) + '  •  Day ' + G.day + (G.rain > 0.3 ? '  •  🌧' : daylight().night ? '  •  🌙' : '  •  ☀️');
  const d = G.world.districtAt(p.x, p.y);
  el.district.textContent = d ? d.name : 'Suncrest Bay';
  el['respect-bar'].style.width = G.respect + '%';
  el['respect-text'].textContent = 'RESPECT ' + Math.floor(G.respect);
  if (G.objective) {
    el.objective.textContent = G.objective.text;
    el['objective-mission'].textContent = G.objective.mission || '';
    el.objective.parentElement.classList.remove('hidden');
  } else {
    el.objective.parentElement.classList.add('hidden');
  }
  if (p.car || p.boat) {
    const v = p.car || p.boat;
    el.speed.textContent = Math.round(Math.abs(v.speed) * 0.18) + ' km/h';
    el.speed.parentElement.classList.remove('hidden');
  } else {
    el.speed.parentElement.classList.add('hidden');
  }
  const w = WEAPONS[p.weapon];
  el.weapon.textContent = w.icon + ' ' + w.name;
  const slot = p.weapons[p.weapon];
  el.ammo.textContent = slot && slot.ammo !== Infinity ? slot.ammo + ' rounds' : '∞';
  el.station.textContent = '♪ ' + stationName();
  if (G.prompt) {
    el.prompt.textContent = '[' + G.prompt.key + '] ' + G.prompt.text;
    el.prompt.classList.remove('hidden');
  } else {
    el.prompt.classList.add('hidden');
  }
  // Low-health vignette.
  el.vignette.style.opacity = p.health < 30 ? String(0.5 + Math.sin(G.time * 5) * 0.2) : '0';
  // Busted progress.
  if (G.bustedProgress > 0) {
    el.toast.textContent = '⚠️ STAY STILL AND YOU\'RE BUSTED — MOVE!';
    el.toast.classList.remove('hidden');
  }
}

export function updateOverlays(dt) {
  // Banner.
  if (G.banner) {
    el['banner-title'].textContent = G.banner.title;
    el['banner-sub'].textContent = G.banner.sub;
    el.banner.classList.remove('hidden');
    G.banner.t -= dt;
    if (G.banner.t <= 0) { G.banner = null; el.banner.classList.add('hidden'); }
  }
  // Toast queue.
  if (!G.toast && G.toastQueue.length > 0) {
    G.toast = { text: G.toastQueue.shift(), t: 2.5 };
    el.toast.textContent = G.toast.text;
    el.toast.classList.remove('hidden');
  }
  if (G.toast) {
    G.toast.t -= dt;
    if (G.toast.t <= 0) { G.toast = null; el.toast.classList.add('hidden'); }
  }
  // Dialogue.
  if (G.dialogue) {
    el['dialogue-speaker'].textContent = G.dialogue.speaker;
    el['dialogue-speaker'].style.color = G.dialogue.color;
    el['dialogue-text'].textContent = G.dialogue.text;
    el['dialogue-portrait'].textContent = G.dialogue.portrait;
    el.dialogue.classList.remove('hidden');
  } else {
    el.dialogue.classList.add('hidden');
  }
}

export function openShop(kind, onBuy) {
  G.modeBeforeShop = G.mode;
  G.mode = 'shop';
  el['shop-title'].textContent =
    kind === 'gunshop' ? '🔫 Gun Barn' :
    kind === 'garage' ? '🔧 Sal\'s Garage' :
    kind === 'property' ? '🏢 Properties' : 'Shop';
  const list = el['shop-list'];
  list.innerHTML = '';
  const items = kind === 'gunshop' ? GUN_STOCK : kind === 'garage' ? GARAGE_UPGRADES : PROPERTIES;
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'shop-row';
    const owned = kind === 'gunshop' && G.player.weapons[item.id];
    const ownedProp = kind === 'property' && G.ownedProps.includes(item.id);
    row.innerHTML =
      '<span class="shop-name">' + (item.label || item.name) + '</span>' +
      '<span class="shop-desc">' + (item.desc || (owned ? 'Owned — buy ammo ' + fmtCash(item.ammoPrice) : '')) + '</span>' +
      '<button class="shop-buy" data-id="' + item.id + '">' + (ownedProp ? 'OWNED' : owned ? fmtCash(item.ammoPrice) : fmtCash(item.price)) + '</button>';
    list.appendChild(row);
  }
  list.querySelectorAll('.shop-buy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const msg = onBuy(btn.dataset.id, kind);
      if (msg) G.toastQueue.push(msg);
      openShop(kind, onBuy); // refresh prices/owned state
    });
  });
  show('shop-menu');
}

export function closeShop() {
  hide('shop-menu');
  G.mode = G.modeBeforeShop === 'shop' ? 'playing' : G.modeBeforeShop;
}

export function showStats() {
  const s = G.stats;
  const rows = [
    ['Missions completed', s.missionsDone + ' / 10'],
    ['Cash earned', fmtCash(s.cashEarned)],
    ['Cars stolen', s.carsStolen],
    ['Kills', s.kills],
    ['Cops evaded', s.copsEvaded],
    ['Distance driven', (s.distanceDriven / 1000).toFixed(1) + ' km'],
    ['Distance walked', (s.distanceWalked / 1000).toFixed(1) + ' km'],
    ['Accuracy', s.shotsFired ? Math.round((s.shotsHit / s.shotsFired) * 100) + '%' : '—'],
    ['Taxi fares', s.faresDone],
    ['Races won', s.racesWon],
    ['Stunt jumps', s.jumpsDone + ' / 6'],
    ['Medallions', G.collected.size + ' / 40'],
    ['Turf held', Object.values(G.turf).filter((t) => t === 'player').length + ' districts'],
    ['Properties', G.ownedProps.length + ' owned'],
    ['Deaths', s.deaths],
    ['Times busted', s.busted],
    ['Play time', Math.floor(s.playSeconds / 60) + ' min'],
  ];
  el['stats-list'].innerHTML = rows.map((r) =>
    '<div class="stat-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  show('stats-menu');
}

export function hideStats() { hide('stats-menu'); }

export function showPause() { show('pause-menu'); }
export function hidePause() { hide('pause-menu'); }

export function showDead() {
  document.getElementById('dead-cash').textContent = fmtCash(G.cash);
  show('dead-menu');
}

export function showBusted() {
  document.getElementById('busted-cash').textContent = fmtCash(G.cash);
  show('busted-menu');
}

export function nextMissionHint() {
  const def = nextMissionDef();
  if (!def) return 'Story complete — the city is yours. Try races, turf wars and medallions!';
  return 'Next mission: ' + def.title + ' — follow the ◆ marker.';
}
