// Rendering: the camera, the city, every entity, day/night lighting, rain,
// and the minimap. All drawing is canvas 2D — no image assets.

import { PALETTE, WEAPONS } from './config.js';
import { clamp, lerp, shade, dist } from './util.js';
import { G } from './state.js';
import { missionMarker } from './missions.js';

let W = 1280, H = 720;
let rainDrops = [];

export function resize(canvas) {
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = W; canvas.height = H;
}

export function screenSize() { return { w: W, h: H }; }

// 0 = midnight, 0.5 = noon. Returns {day: 0..1 brightness, dusk: 0..1}.
export function daylight() {
  const h = (G.clock / 60) % 24;
  // Sunrise ~6:30, sunset ~19:30.
  let day = 0;
  if (h > 6.5 && h < 19.5) {
    const t = (h - 6.5) / 13;
    day = Math.sin(t * Math.PI);
    day = 0.55 + 0.45 * day;
  } else {
    day = 0.12;
  }
  const dusk = (h > 17.5 && h < 20) || (h > 5.5 && h < 7.5) ? 1 : 0;
  return { day, dusk, hour: h, night: day < 0.3 };
}

export function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const cam = G.cam;
  const lookX = p.x + (p.vx || 0) * 0.35;
  const lookY = p.y + (p.vy || 0) * 0.35;
  cam.x = lerp(cam.x, lookX, Math.min(1, 5 * dt));
  cam.y = lerp(cam.y, lookY, Math.min(1, 5 * dt));
  const speed = p.speed || 0;
  const wantZoom = speed > 420 ? 0.82 : speed > 240 ? 0.92 : 1;
  cam.zoom = lerp(cam.zoom, wantZoom, Math.min(1, 2 * dt));
  if (cam.x === 0 && cam.y === 0) { cam.x = p.x; cam.y = p.y; }
}

function worldToScreen(x, y) {
  const cam = G.cam;
  return {
    x: (x - cam.x) * cam.zoom + W / 2,
    y: (y - cam.y) * cam.zoom + H / 2,
  };
}

function drawCarBody(ctx, car, t) {
  const { x, y } = worldToScreen(car.x, car.y);
  const z = G.cam.zoom;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(car.angle);
  const L = car.halfLen * 2 * z, Wd = car.halfWid * 2 * z;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 3 * z, -Wd / 2 + 4 * z, L, Wd, 6 * z);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -Wd / 2, L, Wd, 6 * z);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.roundRect(-L / 2, -Wd / 2, L, Wd * 0.35, 6 * z);
  ctx.fill();
  // Cabin.
  ctx.fillStyle = '#10141c';
  ctx.beginPath();
  ctx.roundRect(-L * 0.18, -Wd * 0.36, L * 0.36, Wd * 0.72, 4 * z);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(-L * 0.14, -Wd * 0.3, L * 0.1, Wd * 0.6, 2 * z);
  ctx.fill();
  // Headlights / taillights.
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(L / 2 - 2 * z, -Wd / 2 + 2 * z, 2 * z, 4 * z);
  ctx.fillRect(L / 2 - 2 * z, Wd / 2 - 6 * z, 2 * z, 4 * z);
  ctx.fillStyle = car.brakeLights ? '#ff2222' : '#aa2222';
  ctx.fillRect(-L / 2, -Wd / 2 + 2 * z, 2 * z, 4 * z);
  ctx.fillRect(-L / 2, Wd / 2 - 6 * z, 2 * z, 4 * z);
  if (car.model === 'police') {
    // Light bar.
    const flash = Math.floor(t * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2222' : '#2244ff';
    ctx.fillRect(-4 * z, -Wd / 2 + 2 * z, 8 * z, 5 * z);
    ctx.fillStyle = flash ? '#2244ff' : '#ff2222';
    ctx.fillRect(-4 * z, Wd / 2 - 7 * z, 8 * z, 5 * z);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${7 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SCPD', 0, 2 * z);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#222';
    ctx.font = `bold ${7 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2 * z);
  }
  ctx.restore();
}

function drawBoat(ctx, boat) {
  const { x, y } = worldToScreen(boat.x, boat.y);
  const z = G.cam.zoom;
  ctx.save();
  ctx.translate(x, y + Math.sin(G.time * 2 + boat.id) * 2 * z);
  ctx.rotate(boat.angle);
  const L = boat.halfLen * 2 * z, Wd = boat.halfWid * 2 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 3 * z, L / 2, Wd / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = boat.color;
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.lineTo(L * 0.2, -Wd / 2);
  ctx.lineTo(-L / 2, -Wd / 2);
  ctx.lineTo(-L / 2, Wd / 2);
  ctx.lineTo(L * 0.2, Wd / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#20303c';
  ctx.fillRect(-L * 0.25, -Wd * 0.28, L * 0.3, Wd * 0.56);
  ctx.restore();
}

function drawPed(ctx, ped) {
  const { x, y } = worldToScreen(ped.x, ped.y);
  const z = G.cam.zoom;
  if (ped.dead) {
    ctx.fillStyle = 'rgba(120,10,10,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, y, 12 * z, 8 * z, ped.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(x, y, 9 * z, 6 * z, ped.angle, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 1.5 * z;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * z, y + 4 * z, 8 * z, 5 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs.
  ctx.strokeStyle = ped.pants;
  ctx.lineWidth = 3.5 * z;
  ctx.lineCap = 'round';
  const step = Math.sin(ped.walkPhase) * 5 * z * Math.min(1, ped.speed / 100);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(ped.angle) * step - Math.sin(ped.angle) * 3 * z, y + Math.sin(ped.angle) * step + Math.cos(ped.angle) * 3 * z);
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(ped.angle) * step + Math.sin(ped.angle) * 3 * z, y - Math.sin(ped.angle) * step - Math.cos(ped.angle) * 3 * z);
  ctx.stroke();
  // Body.
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(x, y + bob, 7 * z, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(x + Math.cos(ped.angle) * 2 * z, y + Math.sin(ped.angle) * 2 * z + bob, 4.5 * z, 0, Math.PI * 2);
  ctx.fill();
  if (ped.role === 'gang') {
    ctx.fillStyle = '#ff2222';
    ctx.font = `bold ${9 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('▼', x, y - 14 * z);
  }
}

function drawPlayer(ctx) {
  const p = G.player;
  if (!p) return;
  if (!p.onFoot) {
    // Draw the vehicle with a marker ring; the car itself is drawn in the car pass.
    const { x, y } = worldToScreen(p.x, p.y);
    const z = G.cam.zoom;
    ctx.strokeStyle = 'rgba(125,255,106,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 34 * z, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const { x, y } = worldToScreen(p.x, p.y);
  const z = G.cam.zoom;
  const bob = p.speed > 20 ? Math.sin(G.time * 14) * 1.5 * z : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * z, y + 5 * z, 9 * z, 6 * z, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs.
  ctx.strokeStyle = '#22303c';
  ctx.lineWidth = 4 * z;
  ctx.lineCap = 'round';
  const step = Math.sin(G.time * 14) * 6 * z * Math.min(1, p.speed / 200);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(p.angle) * step - Math.sin(p.angle) * 3.5 * z, y + Math.sin(p.angle) * step + Math.cos(p.angle) * 3.5 * z);
  ctx.moveTo(x, y);
  ctx.lineTo(x - Math.cos(p.angle) * step + Math.sin(p.angle) * 3.5 * z, y - Math.sin(p.angle) * step - Math.cos(p.angle) * 3.5 * z);
  ctx.stroke();
  // Jacket — Dax wears a teal jacket and dark jeans.
  ctx.fillStyle = '#0f766e';
  ctx.beginPath();
  ctx.arc(x, y + bob, 8 * z, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c79b';
  ctx.beginPath();
  ctx.arc(x + Math.cos(p.angle) * 2 * z, y + Math.sin(p.angle) * 2 * z + bob, 5 * z, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  ctx.fillStyle = '#1a1210';
  ctx.beginPath();
  ctx.arc(x + Math.cos(p.angle) * 1 * z, y + Math.sin(p.angle) * 1 * z + bob - 1 * z, 5 * z, p.angle + 2.2, p.angle + 4.1);
  ctx.fill();
  // Weapon in hand.
  if (p.weapon !== 'fists') {
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(p.angle) * 6 * z, y + Math.sin(p.angle) * 6 * z);
    ctx.lineTo(x + Math.cos(p.angle) * 20 * z, y + Math.sin(p.angle) * 20 * z);
    ctx.stroke();
  }
  // Aim line (short, subtle).
  if (p.weapon !== 'fists') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(p.angle) * 24 * z, y + Math.sin(p.angle) * 24 * z);
    ctx.lineTo(x + Math.cos(p.angle) * 90 * z, y + Math.sin(p.angle) * 90 * z);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawWorld(ctx) {
  const w = G.world;
  const cam = G.cam;
  const z = cam.zoom;
  const { day, dusk, night } = daylight();
  // Ground: grass base.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, W, H);

  const viewL = cam.x - W / 2 / z - 100;
  const viewR = cam.x + W / 2 / z + 100;
  const viewT = cam.y - H / 2 / z - 100;
  const viewB = cam.y + H / 2 / z + 100;

  // Water (bay east + sea south).
  ctx.fillStyle = PALETTE.water;
  const bay = worldToScreen(w.waterLine, 0);
  ctx.fillRect(bay.x, 0, W - bay.x + 100, H);
  const sea = worldToScreen(0, w.size - 60);
  ctx.fillRect(0, sea.y, W, H - sea.y + 100);
  // Animated wave lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const wy = ((i * 317 + G.time * 22) % (H + 80)) - 40;
    const wx = bay.x + 30 + (i % 4) * 90;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 24, wy + 6, wx + 48, wy);
    ctx.stroke();
  }
  // Beach.
  ctx.fillStyle = PALETTE.sand;
  const beach = worldToScreen(0, w.beachLine);
  ctx.fillRect(0, beach.y, bay.x, sea.y - beach.y);

  // Roads.
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of w.roadsV) {
    const s = worldToScreen(rx, 0);
    if (s.x < -120 || s.x > W + 120) continue;
    ctx.fillRect(s.x - (w.halfRoad * z), 0, w.halfRoad * 2 * z, H);
  }
  for (const ry of w.roadsH) {
    const s = worldToScreen(0, ry);
    if (s.y < -120 || s.y > H + 120) continue;
    ctx.fillRect(0, s.y - (w.halfRoad * z), W, w.halfRoad * 2 * z);
  }
  // Lane dashes.
  ctx.strokeStyle = 'rgba(232,227,200,0.75)';
  ctx.lineWidth = 2 * z;
  ctx.setLineDash([18 * z, 22 * z]);
  for (const rx of w.roadsV) {
    const s = worldToScreen(rx, 0);
    if (s.x < -60 || s.x > W + 60) continue;
    ctx.beginPath(); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, H); ctx.stroke();
  }
  for (const ry of w.roadsH) {
    const s = worldToScreen(0, ry);
    if (s.y < -60 || s.y > H + 60) continue;
    ctx.beginPath(); ctx.moveTo(0, s.y); ctx.lineTo(W, s.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Sidewalks.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of w.roadsV) {
    const s = worldToScreen(rx, 0);
    if (s.x < -140 || s.x > W + 140) continue;
    ctx.fillRect(s.x - (w.halfRoad + 24) * z, 0, 24 * z, H);
    ctx.fillRect(s.x + w.halfRoad * z, 0, 24 * z, H);
  }
  for (const ry of w.roadsH) {
    const s = worldToScreen(0, ry);
    if (s.y < -140 || s.y > H + 140) continue;
    ctx.fillRect(0, s.y - (w.halfRoad + 24) * z, W, 24 * z);
    ctx.fillRect(0, s.y + w.halfRoad * z, W, 24 * z);
  }
  // Re-draw road surface over sidewalk overlaps at intersections.
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of w.roadsV) for (const ry of w.roadsH) {
    const s = worldToScreen(rx, ry);
    if (s.x < -120 || s.x > W + 120 || s.y < -120 || s.y > H + 120) continue;
    ctx.fillRect(s.x - w.halfRoad * z, s.y - w.halfRoad * z, w.halfRoad * 2 * z, w.halfRoad * 2 * z);
  }

  // Skid marks.
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 4 * z;
  for (const sk of G.skidmarks) {
    const s = worldToScreen(sk.x, sk.y);
    ctx.globalAlpha = Math.min(1, sk.t / 2);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(sk.angle) * 8 * z, s.y - Math.sin(sk.angle) * 8 * z);
    ctx.lineTo(s.x + Math.cos(sk.angle) * 8 * z, s.y + Math.sin(sk.angle) * 8 * z);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Buildings with fake height: a shaded side + a roof.
  for (const b of w.buildings) {
    if (b.kind === 'tree') continue;
    if (b.x + b.w < viewL || b.x > viewR || b.y + b.h < viewT || b.y > viewB) continue;
    const s = worldToScreen(b.x, b.y);
    const bw = b.w * z, bh = b.h * z;
    const hgt = Math.min(26, 3 + b.floors * 1.4) * z;
    // Side shadow (south-east face).
    ctx.fillStyle = shade(b.roof, -38);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y + bh);
    ctx.lineTo(s.x + bw, s.y + bh);
    ctx.lineTo(s.x + bw + hgt * 0.6, s.y + bh + hgt);
    ctx.lineTo(s.x + hgt * 0.6, s.y + bh + hgt);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.roof, -22);
    ctx.beginPath();
    ctx.moveTo(s.x + bw, s.y);
    ctx.lineTo(s.x + bw + hgt * 0.6, s.y + hgt);
    ctx.lineTo(s.x + bw + hgt * 0.6, s.y + bh + hgt);
    ctx.lineTo(s.x + bw, s.y + bh);
    ctx.closePath();
    ctx.fill();
    // Roof.
    ctx.fillStyle = b.roof;
    ctx.fillRect(s.x, s.y, bw, bh);
    // Rooftop details.
    ctx.fillStyle = shade(b.roof, -14);
    const vents = Math.floor((b.w * b.h) / 9000);
    for (let i = 0; i < vents; i++) {
      const vx = s.x + ((i * 53 + b.x) % Math.max(20, bw - 16));
      const vy = s.y + ((i * 91 + b.y) % Math.max(20, bh - 16));
      ctx.fillRect(vx, vy, 10 * z, 10 * z);
    }
    // Neon edge for downtown towers at night.
    if (b.neon && night) {
      ctx.strokeStyle = b.neon;
      ctx.lineWidth = 2 * z;
      ctx.globalAlpha = 0.9;
      ctx.strokeRect(s.x, s.y, bw, bh);
      ctx.globalAlpha = 1;
    }
    // Lit windows at night.
    if (night && b.floors > 4) {
      ctx.fillStyle = 'rgba(255,220,120,0.75)';
      const rows = Math.min(6, b.floors);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 4; c++) {
          if (((b.x + r * 7 + c * 13) % 5) < 2) {
            ctx.fillRect(s.x + 6 * z + c * (bw - 12 * z) / 4, s.y + 6 * z + r * (bh - 12 * z) / rows, 4 * z, 4 * z);
          }
        }
      }
    }
  }

  // Trees and palms.
  const drawTree = (t) => {
    const s = worldToScreen(t.x, t.y);
    if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) return;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(s.x + 4 * z, s.y + 5 * z, t.r * z, t.r * 0.7 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    if (t.palm) {
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = 3 * z;
      ctx.beginPath(); ctx.moveTo(s.x, s.y + 6 * z); ctx.lineTo(s.x, s.y - 4 * z); ctx.stroke();
      ctx.strokeStyle = '#2f7a33';
      ctx.lineWidth = 3 * z;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - 4 * z);
        ctx.quadraticCurveTo(s.x + Math.cos(a) * 10 * z, s.y - 4 * z + Math.sin(a) * 10 * z - 4 * z, s.x + Math.cos(a) * 15 * z, s.y - 4 * z + Math.sin(a) * 15 * z + 3 * z);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#2f7a33';
      ctx.beginPath();
      ctx.arc(s.x, s.y, t.r * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f9a44';
      ctx.beginPath();
      ctx.arc(s.x - 3 * z, s.y - 3 * z, t.r * 0.6 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const b of w.buildings) if (b.kind === 'tree') drawTree(b);
  for (const t of w.palms) drawTree(t);

  // Street lamps glow at night.
  if (night) {
    for (const l of w.lamps) {
      const s = worldToScreen(l.x, l.y);
      if (s.x < -40 || s.x > W + 40 || s.y < -40 || s.y > H + 40) continue;
      const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 46 * z);
      g.addColorStop(0, 'rgba(255,230,150,0.5)');
      g.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 46 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe69a';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.5 * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // POI markers.
  for (const poi of w.pois) {
    const s = worldToScreen(poi.x, poi.y);
    if (s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H + 60) continue;
    const icons = { safehouse: '🏠', garage: '🔧', garage2: '🔧', gunshop: '🔫', paynspray: '🎨', hospital: '🏥', marina: '⛵', club: '🎵', shop: '🛒', motel: '🛏️', airport: '✈️' };
    ctx.font = `${20 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(icons[poi.kind] || '📍', s.x, s.y);
  }

  // Mission marker: a tall pulsing beacon.
  const mm = missionMarker();
  if (mm) {
    const s = worldToScreen(mm.x, mm.y);
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.fillStyle = 'rgba(255,215,0,0.25)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 46 * z * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3 * z;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 30 * z * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = `bold ${22 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('◆', s.x, s.y - 34 * z * pulse);
  }
  // Side activity marker.
  if (G.side) {
    const t = G.side.kind === 'taxi' ? (G.side.stage === 'pickup' ? G.side.pickup : G.side.dest) : G.side.dest;
    if (t) {
      const s = worldToScreen(t.x, t.y);
      ctx.fillStyle = 'rgba(34,230,255,0.25)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 36 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#22e6ff';
      ctx.lineWidth = 2.5 * z;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26 * z, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Race checkpoint.
  if (G.race) {
    const t = G.race.checkpoints[G.race.next];
    const s = worldToScreen(t.x, t.y);
    ctx.strokeStyle = '#39ff88';
    ctx.lineWidth = 4 * z;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 40 * z, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#39ff88';
    ctx.font = `bold ${16 * z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🏁', s.x, s.y + 6 * z);
    for (const rv of G.race.rivals) {
      drawCarBody(ctx, { ...rv, halfLen: 27, halfWid: 13, model: 'coupe', brakeLights: false }, G.time);
    }
  }

  // Pickups.
  for (const pk of G.pickups) {
    const s = worldToScreen(pk.x, pk.y);
    const bobY = Math.sin(G.time * 3 + pk.x) * 3 * z;
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#7dff6a';
      ctx.font = `${18 * z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💵', s.x, s.y + bobY);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#ff6b6b';
      ctx.font = `${18 * z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('✚', s.x, s.y + bobY);
    } else if (pk.kind === 'armor') {
      ctx.fillStyle = '#6bc2ff';
      ctx.font = `${18 * z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🛡️', s.x, s.y + bobY);
    } else if (pk.kind === 'package') {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(s.x, s.y + bobY, 10 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6d1a';
      ctx.font = `bold ${11 * z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('★', s.x, s.y + bobY + 4 * z);
    }
  }

  // Hidden packages that are still out there.
  for (const pkg of w.packages) {
    if (pkg.taken || G.collected.has(pkg.id)) continue;
    const s = worldToScreen(pkg.x, pkg.y);
    if (s.x < -30 || s.x > W + 30 || s.y < -30 || s.y > H + 30) continue;
    const glow = 0.6 + Math.sin(G.time * 3 + pkg.x) * 0.4;
    ctx.fillStyle = `rgba(255,215,106,${glow})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // Boats, cars, peds, player.
  for (const b of G.boats) drawBoat(ctx, b);
  for (const car of G.cars) drawCarBody(ctx, car, G.time);
  for (const ped of G.peds) drawPed(ctx, ped);
  drawPlayer(ctx);

  // Bullets.
  ctx.fillStyle = '#ffe27a';
  for (const b of G.bullets) {
    const s = worldToScreen(b.x, b.y);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2.5 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // Particles.
  for (const pt of G.particles) {
    const s = worldToScreen(pt.x, pt.y);
    ctx.globalAlpha = Math.max(0, 1 - pt.t / pt.life);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.max(0.5, pt.size * z), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Police helicopter.
  if (G.heli) {
    const h = G.heli;
    const s = worldToScreen(h.x, h.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(s.x + 10 * z, s.y + 14 * z, 22 * z, 10 * z, 0, 0, Math.PI * 2);
    ctx.fill();
    // Searchlight cone.
    const p = G.player;
    const ps = worldToScreen(p.x, p.y);
    const grad = ctx.createLinearGradient(s.x, s.y, ps.x, ps.y);
    grad.addColorStop(0, 'rgba(255,255,200,0.35)');
    grad.addColorStop(1, 'rgba(255,255,200,0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(ps.x - 30 * z, ps.y - 30 * z);
    ctx.lineTo(ps.x + 30 * z, ps.y + 30 * z);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 20 * z, 12 * z, h.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 3 * z;
    const rotor = G.time * 40;
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(rotor) * 30 * z, s.y - Math.sin(rotor) * 30 * z);
    ctx.lineTo(s.x + Math.cos(rotor) * 30 * z, s.y + Math.sin(rotor) * 30 * z);
    ctx.stroke();
    ctx.fillStyle = '#ff2222';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3 * z, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floating texts.
  ctx.textAlign = 'center';
  for (const f of G.floaters) {
    const s = worldToScreen(f.x, f.y);
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    ctx.font = `bold ${f.size * z}px sans-serif`;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, s.x, s.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, s.x, s.y);
  }
  ctx.globalAlpha = 1;

  // Day/night overlay + dusk tint.
  if (day < 0.95) {
    ctx.fillStyle = `rgba(8,12,38,${(0.95 - day) * 0.55})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (dusk) {
    ctx.fillStyle = 'rgba(255,120,40,0.10)';
    ctx.fillRect(0, 0, W, H);
  }
  // Rain.
  if (G.rain > 0.05) {
    if (rainDrops.length < 120) {
      for (let i = rainDrops.length; i < 120; i++) {
        rainDrops.push({ x: Math.random() * W, y: Math.random() * H, l: 10 + Math.random() * 12, s: 700 + Math.random() * 400 });
      }
    }
    ctx.strokeStyle = `rgba(180,210,255,${0.45 * G.rain})`;
    ctx.lineWidth = 1.2;
    for (const d of rainDrops) {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 3, d.y + d.l);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(120,150,200,${0.08 * G.rain})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function updateRain(dt) {
  for (const d of rainDrops) {
    d.y += d.s * dt;
    d.x -= d.s * 0.12 * dt;
    if (d.y > H + 20) { d.y = -20; d.x = Math.random() * (W + 100); }
  }
}

// --- Minimap ---------------------------------------------------------------

export function drawMinimap(ctx) {
  const w = G.world;
  const S = w.size;
  const mm = 168;
  const mx = 16, my = 16;
  const scale = mm / S;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.82)';
  ctx.beginPath();
  ctx.roundRect(mx - 4, my - 4, mm + 8, mm + 8, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(mx, my, mm, mm, 6);
  ctx.clip();
  // Ground.
  ctx.fillStyle = '#3f6b34';
  ctx.fillRect(mx, my, mm, mm);
  // Water.
  ctx.fillStyle = '#1f6f8b';
  ctx.fillRect(mx + w.waterLine * scale, my, mm, mm);
  ctx.fillRect(mx, my + (S - 60) * scale, mm, mm);
  // Beach.
  ctx.fillStyle = '#c9b078';
  ctx.fillRect(mx, my + w.beachLine * scale, w.waterLine * scale, (S - 60 - w.beachLine) * scale);
  // Roads.
  ctx.strokeStyle = '#9a958a';
  ctx.lineWidth = 3;
  for (const rx of w.roadsV) {
    ctx.beginPath();
    ctx.moveTo(mx + rx * scale, my);
    ctx.lineTo(mx + rx * scale, my + mm);
    ctx.stroke();
  }
  for (const ry of w.roadsH) {
    ctx.beginPath();
    ctx.moveTo(mx, my + ry * scale);
    ctx.lineTo(mx + mm, my + ry * scale);
    ctx.stroke();
  }
  // Turf colours.
  for (const [id, owner] of Object.entries(G.turf)) {
    if (owner !== 'player') continue;
    const d = { downtown: [0.38, 0.30], marina: [0.86, 0.30], beach: [0.5, 0.94], docks: [0.84, 0.72], barrio: [0.16, 0.62] }[id];
    if (!d) continue;
    ctx.fillStyle = 'rgba(125,255,106,0.3)';
    ctx.beginPath();
    ctx.arc(mx + d[0] * mm, my + d[1] * mm, 16, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker.
  const mmk = missionMarker();
  if (mmk) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(mx + mmk.x * scale, my + mmk.y * scale, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Side marker.
  if (G.side) {
    const t = G.side.kind === 'taxi' ? (G.side.stage === 'pickup' ? G.side.pickup : G.side.dest) : G.side.dest;
    if (t) {
      ctx.fillStyle = '#22e6ff';
      ctx.beginPath();
      ctx.arc(mx + t.x * scale, my + t.y * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cops (red) and player (white arrow).
  ctx.fillStyle = '#ff4444';
  for (const cop of G.cops) {
    ctx.beginPath();
    ctx.arc(mx + cop.x * scale, my + cop.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (G.heli) {
    ctx.fillStyle = '#ff8844';
    ctx.beginPath();
    ctx.arc(mx + G.heli.x * scale, my + G.heli.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  const p = G.player;
  if (p) {
    ctx.save();
    ctx.translate(mx + p.x * scale, my + p.y * scale);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // North indicator.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', mx + mm / 2, my + mm + 16);
}

// --- Frame ------------------------------------------------------------------

export function renderFrame() {
  const ctx = G.ctx;
  const canvas = G.canvas;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, W, H);
  const shake = G.cam.shake;
  if (shake > 0) {
    ctx.save();
    ctx.translate((G.rng() - 0.5) * shake, (G.rng() - 0.5) * shake);
    drawWorld(ctx);
    ctx.restore();
  } else {
    drawWorld(ctx);
  }
  if (G.mode === 'playing' || G.mode === 'paused' || G.mode === 'shop') {
    drawMinimap(ctx);
  }
}
