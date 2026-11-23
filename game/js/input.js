// Keyboard + mouse input. Tracks held keys, edge-triggered presses, and the
// mouse position in screen and world coordinates.

import { G } from './state.js';

const DOWN = {};
const PRESSED = new Set();
let mouseDown = false;
let mousePressed = false;

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'brake', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyF: 'enter', KeyE: 'action',
  KeyR: 'reload', KeyM: 'mute', Escape: 'pause',
  KeyT: 'taxi', KeyY: 'delivery', KeyU: 'rampage', KeyI: 'race',
  KeyB: 'bribe', KeyN: 'station', KeyG: 'turf',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5',
  Enter: 'confirm',
};

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) { if (!DOWN[k]) PRESSED.add(k); DOWN[k] = true; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    G.keys[e.code] = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) DOWN[k] = false;
    G.keys[e.code] = false;
  });
  window.addEventListener('blur', () => { for (const k in DOWN) DOWN[k] = false; });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    G.mouse.x = e.clientX - r.left;
    G.mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { mouseDown = true; mousePressed = true; G.mouse.down = true; }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) { mouseDown = false; G.mouse.down = false; }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function isDown(action) { return !!DOWN[action]; }

export function wasPressed(action) {
  if (PRESSED.has(action)) { PRESSED.delete(action); return true; }
  return false;
}

export function mouseWasPressed() {
  if (mousePressed) { mousePressed = false; return true; }
  return false;
}

export function mouseIsDown() { return mouseDown; }

export function endFrameInput() {
  // PRESSED entries are consumed by wasPressed(); clear leftovers each frame
  // so a press never leaks into the next frame's logic.
  PRESSED.clear();
  mousePressed = false;
}

// Steering/throttle vector from the held keys: {x: -1..1, y: -1..1}.
export function driveInput() {
  return {
    x: (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0),
    y: (isDown('down') ? 1 : 0) - (isDown('up') ? 1 : 0),
  };
}
