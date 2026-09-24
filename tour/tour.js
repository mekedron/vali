import * as THREE from 'three';
import { createWorld } from '../shared/world.js';
import { STOPS } from './stops.js';

// Guided presentation of VÄLI: the visitor never walks. Each stop is a fixed
// viewpoint; the camera cuts between them through a short fade with a slow
// dolly-in, and the installation's sound starts on its own. The visitor only
// looks around and steps forward or back.

const FADE_OUT = 0.45;
const FADE_IN = 0.9;
const DOLLY_TIME = 2.4;
const DOLLY_DISTANCE = 0.7;
const AUDIO_FADE = 0.6;
const LOOK_SPEED = 0.0022;

const overlay = document.getElementById('overlay');
const progressEl = document.getElementById('progress');
const volumeInput = document.getElementById('volume');
const hud = document.getElementById('hud');
const titleEl = document.getElementById('stop-title');
const subtitleEl = document.getElementById('stop-subtitle');
const dotsEl = document.getElementById('dots');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';
scene.add(camera);

// Black veil in front of the lens for cuts; it lives in the scene rather than the
// DOM so the same fade works inside a headset.
const veil = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
);
veil.position.z = -0.2;
veil.renderOrder = 999;
camera.add(veil);

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => { progressEl.textContent = `Loading… ${loaded} / ${total}`; };
manager.onLoad = () => document.body.classList.add('loaded');

// ---- Audio ------------------------------------------------------------------

// Master volume scales every sound's authored level. It always starts at 5% so each
// exhibition visitor gets the same level regardless of what the previous one chose.
let masterVolume = 0.05;
// Each voice fades by its own envelope; the element volume is base × envelope × master.
const voices = new Map();

function voice(media, base) {
  if (!voices.has(media)) voices.set(media, { media, base, env: 0, target: 0 });
  return voices.get(media);
}

function applyVolume(v) {
  v.media.volume = THREE.MathUtils.clamp(v.base * v.env * masterVolume, 0, 1);
}

function setMasterVolume(value) {
  masterVolume = THREE.MathUtils.clamp(value, 0, 1);
  volumeInput.value = Math.round(masterVolume * 100);
  for (const v of voices.values()) applyVolume(v);
}

function fadeVoices(dt) {
  const step = dt / AUDIO_FADE;
  for (const v of voices.values()) {
    if (v.env === v.target) continue;
    v.env = v.env < v.target ? Math.min(v.target, v.env + step) : Math.max(v.target, v.env - step);
    applyVolume(v);
    if (v.env === 0 && v.target === 0) v.media.pause();
  }
}

// ---- Stops ------------------------------------------------------------------

let world = null;
let ambient = null;
const stopMedia = [];

async function build() {
  world = await createWorld({ renderer, scene, manager, sceneUrl: '../scene.json' });
  const { data } = world;
  document.getElementById('title').textContent = data.title;
  document.getElementById('author').textContent = data.author;

  const audio = (src) => {
    const a = new Audio(world.url(src));
    a.preload = 'auto';
    return a;
  };
  ambient = voice(audio(data.ambient.src), data.ambient.volume);
  ambient.media.loop = true;

  for (const stop of STOPS) {
    if (stop.sound) {
      const el = data.elements.find((e) => e.sound?.name === stop.sound);
      const media = audio(el.sound.src);
      media.loop = true;
      stopMedia.push(voice(media, el.sound.volume));
    } else if (stop.video) {
      const source = [...world.videoSources.values()].find((s) => s.el.label === stop.video);
      source.video.muted = false;
      stopMedia.push(voice(source.video, source.baseVolume));
    } else {
      stopMedia.push(null);
    }
  }
  setMasterVolume(masterVolume);

  // Sounds start by themselves here, so the FRAGMENT/SILENCE floor buttons would only
  // invite clicks that do nothing.
  for (const { el, mesh } of world.tiles) if (el.sound) mesh.visible = false;

  for (let i = 0; i < STOPS.length; i++) {
    const dot = document.createElement('span');
    dotsEl.appendChild(dot);
  }
  if (pendingStart) begin();
}

// ---- Camera -----------------------------------------------------------------

let current = -1;
let look = { yaw: 0, pitch: 0 };
const dolly = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1 };
// Cut state machine: 'idle' → 'out' (veil closing) → 'in' (veil opening, dolly running).
let phase = 'idle';
let phaseT = 0;
let queued = null;

function baseLook(stop) {
  const d = new THREE.Vector3().fromArray(stop.target).sub(new THREE.Vector3().fromArray(stop.position));
  return {
    yaw: Math.atan2(-d.x, -d.z),
    pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
  };
}

function goTo(index) {
  const next = (index + STOPS.length) % STOPS.length;
  if (phase === 'out') { queued = next; return; }
  queued = next;
  phase = 'out';
  phaseT = 0;
  hud.classList.add('switching');
  const leaving = stopMedia[current];
  if (leaving) leaving.target = 0;
}

function arrive(index) {
  current = index;
  const stop = STOPS[index];
  look = baseLook(stop);
  const to = new THREE.Vector3().fromArray(stop.position);
  const back = new THREE.Vector3(Math.sin(look.yaw), 0, Math.cos(look.yaw)).multiplyScalar(DOLLY_DISTANCE);
  dolly.from.copy(to).add(back);
  dolly.to.copy(to);
  dolly.t = 0;
  camera.position.copy(dolly.from);

  titleEl.textContent = stop.title;
  subtitleEl.textContent = stop.subtitle || '';
  dotsEl.querySelectorAll('span').forEach((d, i) => d.classList.toggle('on', i === index));
  hud.classList.remove('switching');
  history.replaceState(null, '', `#${index + 1}`);

  for (const [i, v] of stopMedia.entries()) if (v && i !== index) v.target = 0;
  playStop(index, true);
}

function playStop(index, fromStart) {
  const v = stopMedia[index];
  if (!v) return;
  if (fromStart) v.media.currentTime = 0;
  v.target = 1;
  v.media.play().catch(() => {});
}

function replay() {
  if (current < 0) return;
  playStop(current, true);
}

const ease = (t) => 1 - Math.pow(1 - t, 3);

function updateCamera(dt) {
  if (phase === 'out') {
    phaseT += dt / FADE_OUT;
    veil.material.opacity = Math.min(1, phaseT);
    if (phaseT >= 1) {
      arrive(queued);
      queued = null;
      phase = 'in';
      phaseT = 0;
    }
  } else if (phase === 'in') {
    phaseT += dt / FADE_IN;
    veil.material.opacity = 1 - Math.min(1, ease(phaseT));
    if (phaseT >= 1) phase = 'idle';
  }
  if (dolly.t < 1) {
    dolly.t = Math.min(1, dolly.t + dt / DOLLY_TIME);
    camera.position.lerpVectors(dolly.from, dolly.to, ease(dolly.t));
  }
  camera.rotation.set(look.pitch, look.yaw, 0);
}

// ---- Input ------------------------------------------------------------------

let started = false;
let pendingStart = false;

function begin() {
  if (!world) { pendingStart = true; return; }
  if (started) return;
  started = true;
  world.startLoops();
  ambient.target = 1;
  ambient.media.play().catch(() => {});
  const fromHash = parseInt(location.hash.slice(1), 10);
  goTo(fromHash >= 1 && fromHash <= STOPS.length ? fromHash - 1 : 0);
}

// Pointer lock is the normal mode: the scene only shows once the cursor is captured.
// Chrome refuses a lock for about a second after Esc, and also while the window is
// unfocused, so a refusal keeps the pause screen up for another click. Drag-to-look
// is the fallback only for browsers that refuse twice in a row without ever granting
// it (embedded frames, some kiosks).
let lockGrantedOnce = false;
let lockFailures = 0;
const isLocked = () => document.pointerLockElement === renderer.domElement;

function requestLock() {
  try {
    const req = renderer.domElement.requestPointerLock();
    req?.catch?.(() => {});
  } catch { /* reported through pointerlockerror */ }
}

overlay.addEventListener('click', () => {
  begin();
  requestLock();
});

document.addEventListener('pointerlockchange', () => {
  if (isLocked()) {
    lockGrantedOnce = true;
    lockFailures = 0;
    overlay.querySelector('.start').textContent = 'Click to continue';
    document.body.classList.remove('drag-mode');
    document.body.classList.add('playing');
  } else if (!document.body.classList.contains('drag-mode')) {
    document.body.classList.remove('playing');
  }
});
document.addEventListener('pointerlockerror', () => {
  lockFailures += 1;
  if (lockGrantedOnce || lockFailures < 2) {
    overlay.querySelector('.start').textContent = 'Click again to continue';
    return;
  }
  document.body.classList.add('playing', 'drag-mode');
});

function turn(dx, dy) {
  look.yaw -= dx * LOOK_SPEED;
  look.pitch = THREE.MathUtils.clamp(look.pitch - dy * LOOK_SPEED, -1.4, 1.4);
}

document.addEventListener('mousemove', (e) => {
  if (isLocked()) turn(e.movementX, e.movementY);
});

document.addEventListener('mousedown', (e) => {
  if (!isLocked()) return;
  if (e.button === 0) goTo(current + 1);
  else if (e.button === 2) goTo(current - 1);
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

let dragging = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (isLocked()) return;
  requestLock();
  dragging = { x: e.clientX, y: e.clientY, moved: false, button: e.button };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
  dragging.x = e.clientX; dragging.y = e.clientY;
  // Dragging grabs the world, so the view turns against the pointer.
  turn(-dx * 1.8, -dy * 1.8);
});
renderer.domElement.addEventListener('pointerup', () => {
  if (dragging && !dragging.moved && document.body.classList.contains('drag-mode')) {
    goTo(current + (dragging.button === 2 ? -1 : 1));
  }
  dragging = null;
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !isLocked()) document.body.classList.remove('playing', 'drag-mode');
  if (!started || !document.body.classList.contains('playing')) return;
  if (['ArrowRight', 'Space', 'Enter', 'KeyD', 'PageDown'].includes(e.code)) goTo(current + 1);
  else if (['ArrowLeft', 'Backspace', 'KeyA', 'PageUp'].includes(e.code)) goTo(current - 1);
  else if (e.code === 'KeyR') replay();
  else if (e.code === 'Home') goTo(0);
  else if (/^Digit[1-9]$/.test(e.code)) {
    const n = Number(e.code.slice(5)) - 1;
    if (n < STOPS.length) goTo(n);
  } else return;
  e.preventDefault();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') setMasterVolume(masterVolume - 0.05);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') setMasterVolume(masterVolume + 0.05);
});
volumeInput.addEventListener('input', () => setMasterVolume(volumeInput.value / 100));
volumeInput.addEventListener('pointerdown', (e) => e.stopPropagation());

// ---- Loop -------------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Before the tour starts, show the first stop behind the start screen.
{
  const first = STOPS[0];
  camera.position.fromArray(first.position);
  look = baseLook(first);
}

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  updateCamera(dt);
  fadeVoices(dt);
  renderer.render(scene, camera);
});

build();

// Exposed for debugging from the browser console.
window.__tour = { scene, camera, renderer, veil, goTo, get current() { return current; }, look: () => look, STOPS };
