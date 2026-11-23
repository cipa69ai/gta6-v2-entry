// Suncrest Bay itself: a road grid, city blocks with buildings, a beach along
// the south edge, a bay on the east edge with a marina, and every point of
// interest the game needs. Deterministic from G.seed.

import { WORLD, DISTRICTS, PALETTE } from './config.js';
import { mulberry32, pick, range, irange, clamp } from './util.js';
import { G } from './state.js';

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const S = WORLD.size;
  const gap = WORLD.roadGap;
  const halfRoad = WORLD.roadWidth / 2;

  // Road centrelines: verticals and horizontals across the city, except where
  // the bay eats the east side and the beach eats the south edge.
  const roadsV = [], roadsH = [];
  for (let x = gap; x < S - 40; x += gap) roadsV.push(x);
  for (let y = gap; y < S - 140; y += gap) roadsH.push(y);

  const waterLine = S - 520;   // x beyond this is the bay
  const beachLine = S - 260;   // y beyond this is sand, then sea at the very edge

  const isWater = (x, y) => x > waterLine + 60 || y > S - 60;
  const isBeach = (x, y) => !isWater(x, y) && y > beachLine;

  const onRoad = (x, y) => {
    if (isWater(x, y)) return false;
    for (const rx of roadsV) if (Math.abs(x - rx) < halfRoad && y < beachLine + 40) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) < halfRoad && x < waterLine + 40) return true;
    return false;
  };
  const onSidewalk = (x, y) => {
    if (isWater(x, y) || onRoad(x, y)) return false;
    for (const rx of roadsV) if (Math.abs(x - rx) < halfRoad + WORLD.sidewalk && y < beachLine + 40) return true;
    for (const ry of roadsH) if (Math.abs(y - ry) < halfRoad + WORLD.sidewalk && x < waterLine + 40) return true;
    return false;
  };

  const districtAt = (x, y) => {
    let best = null, bestD = Infinity;
    for (const d of DISTRICTS) {
      const dx = x - d.cx * S, dy = y - d.cy * S;
      const dd = Math.hypot(dx, dy) / (d.r * S);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return bestD <= 1 ? best : null;
  };

  // Buildings fill each block between roads.
  const buildings = [];
  const colliders = [];
  for (let i = 0; i < roadsV.length - 1; i++) {
    for (let j = 0; j < roadsH.length - 1; j++) {
      const x0 = roadsV[i] + halfRoad + WORLD.sidewalk + WORLD.blockInset;
      const y0 = roadsH[j] + halfRoad + WORLD.sidewalk + WORLD.blockInset;
      const x1 = roadsV[i + 1] - halfRoad - WORLD.sidewalk - WORLD.blockInset;
      const y1 = roadsH[j + 1] - halfRoad - WORLD.sidewalk - WORLD.blockInset;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      if (x0 > waterLine - 40 || y0 > beachLine - 20) continue;
      const d = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const density = d ? d.density : 0.7;
      if (rng() > density) {
        // Park / empty lot: trees and benches instead of a building.
        const trees = irange(rng, 3, 8);
        for (let t = 0; t < trees; t++) {
          buildings.push({ kind: 'tree', x: range(rng, x0, x1), y: range(rng, y0, y1), r: range(rng, 10, 16), palm: rng() < 0.55 });
        }
        continue;
      }
      const w = x1 - x0, h = y1 - y0;
      const tall = d && d.id === 'downtown' ? rng() < 0.7 : rng() < 0.18;
      const floors = tall ? irange(rng, 8, 22) : irange(rng, 1, 4);
      const b = {
        kind: 'building', x: x0, y: y0, w, h, floors,
        roof: pick(rng, PALETTE.buildingRoof),
        neon: d && d.id === 'downtown' && rng() < 0.6 ? pick(rng, PALETTE.neon) : null,
        hue: d ? d.hue : 'plain',
      };
      buildings.push(b);
      colliders.push({ x: x0, y: y0, w, h, solid: true });
    }
  }

  // Palm trees along the beach and marina promenade.
  const palms = [];
  for (let x = 120; x < S - 600; x += 90 + rng() * 60) {
    palms.push({ x: x + range(rng, -20, 20), y: beachLine + range(rng, 20, 90), r: 12, palm: true });
  }
  for (let y = 200; y < beachLine; y += 110 + rng() * 50) {
    palms.push({ x: waterLine + range(rng, -30, 10), y, r: 12, palm: true });
  }

  // Street lamps at intersections.
  const lamps = [];
  for (const rx of roadsV) for (const ry of roadsH) {
    if (rx > waterLine - 60 || ry > beachLine) continue;
    lamps.push({ x: rx + halfRoad + 8, y: ry + halfRoad + 8 });
  }

  // Points of interest, placed on real road coordinates.
  const poi = (name, kind, rx, ry, extra = {}) => ({ name, kind, x: rx, y: ry, ...extra });
  const pois = [
    poi('Safehouse', 'safehouse', roadsV[2], roadsH[9], { price: 0 }),
    poi('Sal\'s Garage', 'garage', roadsV[3], roadsH[4]),
    poi('Gun Barn', 'gunshop', roadsV[5], roadsH[6]),
    poi('Pay \'n Spray', 'paynspray', roadsV[7], roadsH[3]),
    poi('Pay \'n Spray', 'paynspray', roadsV[2], roadsH[7]),
    poi('St. Mercy Hospital', 'hospital', roadsV[4], roadsH[2]),
    poi('Marina Docks', 'marina', waterLine - 30, roadsH[3]),
    poi('The Neon Palms', 'club', roadsV[4], roadsH[3], { price: 5000, income: 60 }),
    poi('Bait & Tackle', 'shop', roadsV[9], roadsH[8], { price: 1800, income: 25 }),
    poi('Sunset Motel', 'motel', roadsV[1], roadsH[8], { price: 2500, income: 35 }),
    poi('Vortex Customs', 'garage2', roadsV[8], roadsH[6]),
    poi('Airport', 'airport', roadsV[10], roadsH[10]),
  ];

  // Hidden packages: 40 brass medallions tucked around the city.
  const packages = [];
  for (let i = 0; i < 40; i++) {
    let x, y, tries = 0;
    do {
      x = range(rng, 140, S - 700); y = range(rng, 140, S - 300);
      tries++;
    } while (tries < 40 && (onRoad(x, y) || hitsBuilding(x, y, colliders)));
    packages.push({ id: 'pkg' + i, x, y, taken: false });
  }

  // Stunt jumps: ramps on straight roads.
  const jumps = [];
  const jumpSpots = [
    { x: roadsV[5], y: roadsH[1] + 60, dir: 0 },
    { x: roadsV[1], y: roadsH[5] - 60, dir: Math.PI },
    { x: roadsV[8], y: roadsH[8] + 60, dir: 0 },
    { x: roadsV[3], y: roadsH[10] - 60, dir: Math.PI },
    { x: roadsV[10], y: roadsH[5] + 60, dir: 0 },
    { x: roadsV[6], y: roadsH[9] - 60, dir: Math.PI },
  ];
  jumpSpots.forEach((j, i) => jumps.push({ id: 'jump' + i, ...j, done: false }));

  // Race checkpoints: a loop around downtown.
  const raceLoop = [
    { x: roadsV[4], y: roadsH[2] }, { x: roadsV[7], y: roadsH[2] },
    { x: roadsV[7], y: roadsH[5] }, { x: roadsV[4], y: roadsH[5] },
    { x: roadsV[4], y: roadsH[2] },
  ];

  function hitsBuilding(x, y, list) {
    for (const c of list) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return true;
    return false;
  }

  const world = {
    size: S, roadsV, roadsH, halfRoad, waterLine, beachLine,
    buildings, palms, lamps, colliders, pois, packages, jumps, raceLoop,
    isWater, isBeach, onRoad, onSidewalk, districtAt,
    spawn: { x: roadsV[2] + 30, y: roadsH[9] + 30 },
    clampToWorld(x, y) {
      return { x: clamp(x, 30, S - 30), y: clamp(y, 30, S - 30) };
    },
    // Circle vs building colliders; returns corrected position.
    collideCircle(x, y, r) {
      let cx = x, cy = y;
      for (const c of colliders) {
        const nx = clamp(cx, c.x, c.x + c.w), ny = clamp(cy, c.y, c.y + c.h);
        const dx = cx - nx, dy = cy - ny, d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            cx = nx + (dx / d) * r; cy = ny + (dy / d) * r;
          } else {
            // centre inside the box: push out along the smallest overlap
            const l = cx - c.x, rr = c.x + c.w - cx, t = cy - c.y, b = c.y + c.h - cy;
            const m = Math.min(l, rr, t, b);
            if (m === l) cx = c.x - r; else if (m === rr) cx = c.x + c.w + r;
            else if (m === t) cy = c.y - r; else cy = c.y + c.h + r;
          }
        }
      }
      return { x: cx, y: cy };
    },
    // Nearest point on the road network (for traffic spawning / AI).
    nearestRoadPoint(x, y) {
      let best = null, bd = Infinity;
      for (const rx of roadsV) { const d = Math.abs(x - rx); if (d < bd) { bd = d; best = { x: rx, y, vertical: true }; } }
      for (const ry of roadsH) { const d = Math.abs(y - ry); if (d < bd) { bd = d; best = { x, y: ry, vertical: false }; } }
      return best;
    },
  };

  G.world = world;
  return world;
}
