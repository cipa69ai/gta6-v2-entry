// Particles, floating score text, skid marks and screen-shake helpers.
// Pure visual juice — no gameplay logic lives here.

import { G } from './state.js';
import { range, pick } from './util.js';

export function burst(x, y, n, colors, speed = 220, life = 0.7, size = 5, kind = 'spark') {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    const sp = range(G.rng, speed * 0.3, speed);
    G.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: range(G.rng, life * 0.5, life), t: 0,
      size: range(G.rng, size * 0.5, size),
      color: pick(G.rng, colors), kind,
    });
  }
}

export function blood(x, y, n = 10) {
  burst(x, y, n, ['#a01818', '#c02020', '#701010'], 160, 0.6, 4, 'blood');
}

export function muzzle(x, y, angle) {
  G.particles.push({
    x: x + Math.cos(angle) * 26, y: y + Math.sin(angle) * 26,
    vx: Math.cos(angle) * 60, vy: Math.sin(angle) * 60,
    life: 0.07, t: 0, size: 9, color: '#ffe27a', kind: 'flash',
  });
}

export function floater(x, y, text, color = '#ffffff', size = 16) {
  G.floaters.push({ x, y, text, color, size, t: 0, life: 1.4 });
}

export function updateEffects(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.t += dt;
    if (p.t >= p.life) { G.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
    if (p.kind === 'smoke') { p.vy -= 30 * dt; p.size += 8 * dt; }
    if (p.kind === 'fire') p.size = Math.max(0.5, p.size - 4 * dt);
  }
  for (let i = G.floaters.length - 1; i >= 0; i--) {
    const f = G.floaters[i];
    f.t += dt; f.y -= 34 * dt;
    if (f.t >= f.life) G.floaters.splice(i, 1);
  }
  for (let i = G.skidmarks.length - 1; i >= 0; i--) {
    G.skidmarks[i].t -= dt;
    if (G.skidmarks[i].t <= 0) G.skidmarks.splice(i, 1);
  }
  if (G.cam.shake > 0) G.cam.shake = Math.max(0, G.cam.shake - 30 * dt);
}
