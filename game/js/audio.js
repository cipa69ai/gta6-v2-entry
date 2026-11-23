// All sound is synthesized with WebAudio — no audio files. A tiny step
// sequencer plays one of three radio stations, and one-shot effects cover
// gunfire, sirens, engines, crashes, pickups and UI.

import { G } from './state.js';

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let engineOsc = null;
let engineGain = null;
let sirenOsc = null;
let sirenGain = null;
let seqTimer = 0;
let seqStep = 0;

const STATIONS = [
  { name: 'SUNSET FM — synthwave', bpm: 96, bass: [0, 0, 7, 5, 3, 3, 10, 7], lead: [12, 15, 19, 15, 12, 10, 7, 10], root: 110 },
  { name: 'PALM 98 — latin groove', bpm: 112, bass: [0, 3, 5, 3, 0, 3, 7, 5], lead: [12, 12, 15, 12, 10, 12, 15, 19], root: 98 },
  { name: 'BAY CITY TALK — lo-fi', bpm: 76, bass: [0, 0, 5, 3, 0, 0, 7, 5], lead: [7, 10, 12, 10, 7, 5, 3, 5], root: 130.8 },
];

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.muted ? 0 : 0.55;
    master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
  } catch (e) { ctx = null; }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
}

function tone(freq, dur, type = 'square', vol = 0.2, when = 0, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.3, filterFreq = 1200, when = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t);
}

export const sfx = {
  shoot(kind = 'pistol') {
    if (kind === 'shotgun') { noise(0.22, 0.5, 900); tone(120, 0.15, 'square', 0.25, 0, 50); }
    else if (kind === 'rpg') { noise(0.5, 0.4, 500); tone(80, 0.4, 'sawtooth', 0.3, 0, 40); }
    else if (kind === 'smg') { noise(0.08, 0.28, 1800); tone(220, 0.06, 'square', 0.14, 0, 90); }
    else { noise(0.12, 0.35, 1500); tone(180, 0.09, 'square', 0.2, 0, 70); }
  },
  punch() { noise(0.08, 0.3, 600); tone(90, 0.08, 'sine', 0.3, 0, 50); },
  crash() { noise(0.3, 0.5, 700); tone(70, 0.25, 'sawtooth', 0.3, 0, 35); },
  explosion() { noise(0.9, 0.7, 400); tone(55, 0.8, 'sine', 0.5, 0, 28); },
  pickup() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.14, 'sine', 0.25, 0.08); },
  cash() { tone(880, 0.08, 'triangle', 0.25); tone(1174, 0.08, 'triangle', 0.25, 0.07); tone(1568, 0.16, 'triangle', 0.25, 0.14); },
  mission() { tone(523, 0.12, 'triangle', 0.3); tone(659, 0.12, 'triangle', 0.3, 0.1); tone(784, 0.12, 'triangle', 0.3, 0.2); tone(1046, 0.3, 'triangle', 0.3, 0.3); },
  fail() { tone(392, 0.18, 'sawtooth', 0.2); tone(311, 0.18, 'sawtooth', 0.2, 0.16); tone(233, 0.4, 'sawtooth', 0.2, 0.32); },
  click() { tone(1200, 0.04, 'square', 0.12); },
  horn() { tone(370, 0.25, 'square', 0.18); tone(466, 0.25, 'square', 0.18); },
  sirenBlip() { tone(900, 0.12, 'sine', 0.15, 0, 1400); },
  splash() { noise(0.4, 0.3, 900); },
  jump() { tone(300, 0.3, 'sine', 0.2, 0, 900); },
  denied() { tone(220, 0.12, 'square', 0.2); tone(180, 0.2, 'square', 0.2, 0.1); },
};

export function updateAudio(dt) {
  if (!ctx) return;
  // Music sequencer.
  const st = STATIONS[G.musicStation];
  const stepDur = 60 / st.bpm / 2;
  seqTimer += dt;
  while (seqTimer >= stepDur) {
    seqTimer -= stepDur;
    seqStep = (seqStep + 1) % 16;
    const bar = Math.floor(seqStep / 8);
    const i = seqStep % 8;
    const bassNote = st.bass[i] + (bar === 1 ? -2 : 0);
    const bassFreq = st.root * Math.pow(2, bassNote / 12);
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = bassFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 0.95);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + stepDur);
    if (seqStep % 2 === 0) {
      const leadFreq = st.root * 2 * Math.pow(2, st.lead[i] / 12);
      const o2 = ctx.createOscillator(); o2.type = 'sine';
      o2.frequency.value = leadFreq;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.07, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
      o2.connect(g2); g2.connect(musicGain);
      o2.start(t); o2.stop(t + stepDur * 2);
    }
    if (seqStep % 4 === 0) { // kick
      const o3 = ctx.createOscillator(); o3.type = 'sine';
      o3.frequency.setValueAtTime(120, t);
      o3.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.25, t);
      g3.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o3.connect(g3); g3.connect(musicGain);
      o3.start(t); o3.stop(t + 0.16);
    }
  }
  // Engine hum follows the player's car speed.
  const p = G.player;
  const driving = p && !p.onFoot && p.car;
  if (driving && !engineOsc) {
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(sfxGain);
    engineOsc.start();
  }
  if (engineOsc) {
    if (driving) {
      const s = Math.abs(p.car.speed) / 800;
      engineOsc.frequency.value = 55 + s * 130;
      engineGain.gain.value = 0.05 + s * 0.06;
    } else {
      engineGain.gain.value = 0;
    }
  }
  // Siren loop while wanted.
  if (G.wanted > 0 && !sirenOsc) {
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine';
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain); sirenGain.connect(sfxGain);
    sirenOsc.start();
  }
  if (sirenOsc) {
    if (G.wanted > 0) {
      sirenOsc.frequency.value = 700 + Math.sin(G.time * 4.5) * 280;
      sirenGain.gain.value = 0.035;
    } else {
      sirenGain.gain.value = 0;
    }
  }
}

export function stationName() { return STATIONS[G.musicStation].name; }
export function nextStation() {
  G.musicStation = (G.musicStation + 1) % STATIONS.length;
  return stationName();
}
