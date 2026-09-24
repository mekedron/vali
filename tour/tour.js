import * as THREE from 'three';
import { createWorld } from '../shared/world.js';
import { STOPS, ASSIGN, HIDDEN } from './stops.js';

// Guided presentation of VÄLI: the visitor never walks. Each stop is a fixed
// viewpoint staged as its own world (only its pieces, in black space or under
// the sky); the camera cuts between them through a fade to black, never moving
// on its own, since any camera motion the visitor did not make can cause motion
// sickness in a headset. The installation's sound starts on its own. The visitor
// only looks around and steps forward or back.

const FADE_OUT = 0.45;
const FADE_IN = 0.9;
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

  assignStages();
  showStage(Math.max(current, 0));

  for (let i = 0; i < STOPS.length; i++) {
    const dot = document.createElement('span');
    dotsEl.appendChild(dot);
  }
  if (pendingStart) begin();
}

// ---- Stages -----------------------------------------------------------------

const VOID_FOG = 0.045;
const SKY_FOG = 0.02;
const SKY_FOG_COLOR = 0x26272e;
const DUST_COUNT = 420;
const DUST_RADIUS = 7;
const DUST_HEIGHT = 6;

const stageMembers = STOPS.map(() => []);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A floor that exists only around the installation and fades into the dark, so
// each stop reads as an island rather than a corner of a building.
const stageFloor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 96),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(20,20,26,1)'], [0.55, 'rgba(14,14,18,0.95)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false,
  }),
);
stageFloor.rotation.x = -Math.PI / 2;
stageFloor.position.y = 0.002;
// Floor and glow are transparent layers at nearly the same spot, so the per-frame
// depth sort could flip them as the view tilts and let the floor cover the glow.
// They are drawn first among transparent objects, floor then glow, so images
// lying on the floor and the dust always land on top of them.
stageFloor.renderOrder = -2;
scene.add(stageFloor);

const stageGlow = new THREE.Mesh(
  new THREE.CircleGeometry(4.5, 96),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(255,255,255,0.55)'], [0.4, 'rgba(255,255,255,0.2)'], [1, 'rgba(255,255,255,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
stageGlow.rotation.x = -Math.PI / 2;
stageGlow.position.y = 0.004;
stageGlow.renderOrder = -1;
scene.add(stageGlow);

// Slowly rising dust around the piece, tinted with the stop's accent colour.
const dustGeo = new THREE.BufferGeometry();
const dustPos = new Float32Array(DUST_COUNT * 3);
const dustSeed = new Float32Array(DUST_COUNT * 3);
for (let i = 0; i < DUST_COUNT; i++) {
  const r = DUST_RADIUS * Math.sqrt(Math.random());
  const a = Math.random() * Math.PI * 2;
  dustSeed.set([Math.cos(a) * r, Math.random() * DUST_HEIGHT, Math.sin(a) * r], i * 3);
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.085,
  map: radialTexture([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]),
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9,
}));
dust.frustumCulled = false;
scene.add(dust);

function updateDust(time) {
  for (let i = 0; i < DUST_COUNT; i++) {
    const sx = dustSeed[i * 3], sy = dustSeed[i * 3 + 1], sz = dustSeed[i * 3 + 2];
    const phase = i * 12.9898;
    dustPos[i * 3] = sx + Math.sin(time * 0.21 + phase) * 0.25;
    dustPos[i * 3 + 1] = (sy + time * 0.08) % DUST_HEIGHT;
    dustPos[i * 3 + 2] = sz + Math.cos(time * 0.17 + phase) * 0.25;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

function assignStages() {
  const targets = STOPS.map((s) => s.target);
  const items = [
    ...world.tiles.map((t) => ({ el: t.el, obj: t.mesh })),
    ...world.models.map((m) => ({ el: m.el, obj: m.root })),
  ];
  for (const { el, obj } of items) {
    if (HIDDEN(el)) { obj.visible = false; continue; }
    let index = STOPS.findIndex((s) => s.title === ASSIGN[el.label]);
    if (index < 0) {
      const x = el.matrix[12], z = el.matrix[14];
      let best = Infinity;
      targets.forEach((t, i) => {
        const d = Math.hypot(x - t[0], z - t[2]);
        if (d < best) { best = d; index = i; }
      });
    }
    stageMembers[index].push(obj);
  }
  // The shared floor plane and the panorama are replaced per stage.
  world.environment.visible = false;
  world.sky.material.fog = false;
}

function showStage(index) {
  const stop = STOPS[index];
  stageMembers.forEach((objs, i) => { for (const o of objs) o.visible = i === index; });

  const outside = stop.env === 'sky';
  world.sky.visible = outside;
  scene.fog = outside ? new THREE.FogExp2(SKY_FOG_COLOR, SKY_FOG) : new THREE.FogExp2(0x000000, VOID_FOG);

  const [x, , z] = stop.target;
  stageFloor.position.set(x, stageFloor.position.y, z);
  stageGlow.position.set(x, stageGlow.position.y, z);
  stageGlow.material.color.set(stop.accent);
  dust.position.set(x, 0, z);
  dust.material.color.set(stop.accent);
}

// ---- Camera -----------------------------------------------------------------

let current = -1;
let look = { yaw: 0, pitch: 0 };
// Cut state machine: 'idle' → 'out' (veil closing) → 'in' (veil opening).
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
  camera.position.fromArray(stop.position);

  showStage(index);
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
  updateDust(timer.getElapsed());
  renderer.render(scene, camera);
});

build();

// Exposed for debugging from the browser console.
window.__tour = { scene, camera, renderer, veil, goTo, showStage, updateDust, get current() { return current; }, look: () => look, STOPS };
