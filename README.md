# Suncrest Bay — Open World Crime

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/cipa69ai/gta6-v2-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/cipa69ai/gta6-v2-entry/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for make.fun's **gta6-01** bounty, built
for the [make.fun](https://make.fun) competition. Dax Mercer comes home to
Suncrest Bay — a sun-soaked coastal city of neon downtown towers, a marina,
a boardwalk beach and gang-held turf — and works his way from wheelman to
kingpin across a 10-mission story in 3 acts.

Play it: `node serve.ts`, then open http://localhost:8080.

## What is in the city

- **A living open world**: a road-grid city with 6 districts, traffic that
  follows the roads, sidewalk pedestrians who panic and flee, a beach, a
  bay with drivable boats, a day/night cycle and rolling rain.
- **10 story missions** with dialogue, objectives and rewards — car
  recoveries, gang clear-outs, getaways, a dock siege, a boat run, a
  prototype heist and a final tower assault.
- **Side activities**: taxi fares, courier deliveries, 2-lap street races
  against 3 rivals, mayhem rampages, 6 stunt jumps, 40 hidden medallions,
  turf wars in 4 districts, and random street events.
- **A five-star wanted system**: heat that decays out of sight, cop cars
  that chase and ram, roadblocks at 3 stars, a searchlight helicopter at
  4, bribes and Pay 'n Spray to clear the heat.
- **An economy**: earn cash from missions and side work, buy 5 weapons at
  the Gun Barn, tune and armour cars at Sal's Garage, and buy 3 businesses
  that pay passive income every minute.
- **Combat on foot and from the car**, with 6 weapons, drive-bys,
  explosions, health/armor pickups and a hospital.
- **Polish**: synthesized WebAudio sound and 3 radio stations, a minimap
  with mission/cop/turf blips, skid marks, particles, screen shake,
  headlights and neon at night, save/load, stats, and a pause menu.

Controls: WASD walk/drive, mouse aim, click shoot, F enter car/boat,
E interact, Space handbrake, Shift sprint, 1–5 weapons, T taxi, Y courier,
I race, U mayhem, G turf war, B bribe, N radio, M mute, Esc pause.

## Layout

- `game/` — the game itself, static files, no network, no build step.
  - `index.html` — page, HUD and menus
  - `css/style.css` — HUD and menu styling
  - `js/main.js` — boot, game loop, modes, POI interactions
  - `js/world.js` — the city: roads, districts, buildings, collision
  - `js/config.js` — tuning, palettes, weapons, car models
  - `js/state.js` — the shared game state
  - `js/player.js` — Dax on foot, behind the wheel and at the helm
  - `js/vehicles.js` — car physics, traffic AI, boats
  - `js/pedestrians.js` — sidewalk life that panics and flees
  - `js/police.js` — wanted stars, cop AI, roadblocks, helicopter
  - `js/combat.js` — bullets, melee, explosions, damage
  - `js/missions.js` — the 10-mission story arc
  - `js/activities.js` — taxi, courier, races, mayhem, jumps, turf
  - `js/economy.js` — shops, garage, properties, passive income
  - `js/render.js` — camera, lighting, weather, minimap
  - `js/hud.js` — HUD, menus, dialogue, shop screens
  - `js/audio.js` — WebAudio synth: effects, engine, sirens, radio
  - `js/effects.js` — particles, floating text, skid marks
  - `js/save.js` — localStorage save/load
  - `js/shots.js` — `?shot=` scene staging for screenshots
  - `js/input.js`, `js/util.js`
- `screenshots/` — four renders of the game itself (see `shots.json` for
  the `?shot=` scene each one shows).
- `main.ts` — the entry program: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json`.

Built with the [make.fun](https://make.fun) agent toolkit. Play more
bounties at https://make.fun — referral code `jm7qvfrf`.
