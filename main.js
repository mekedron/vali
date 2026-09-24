import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createWorld } from './shared/world.js';

const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.2;
const RUN_SPEED = 4.5;
const PLAYER_RADIUS = 0.35;
const SPAWN = new THREE.Vector3(0, 0, 0);
const INTERACT_DISTANCE = 12;

const overlay = document.getElementById('overlay');
const volumeInput = document.getElementById('volume');

// Master volume scales every sound's authored level. It always starts at 5% so each
// exhibition visitor gets the same level regardless of what the previous one chose.
let masterVolume = 0.05;

function setMasterVolume(v) {
  masterVolume = THREE.MathUtils.clamp(v, 0, 1);
  volumeInput.value = Math.round(masterVolume * 100);
  for (const audio of sounds.values()) audio.volume = audio.dataset.baseVolume * masterVolume;
  for (const { video, baseVolume } of videoSources.values()) video.volume = baseVolume * masterVolume;
}
const crosshair = document.getElementById('crosshair');
const progressEl = document.getElementById('progress');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x000000);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(SPAWN.x, EYE_HEIGHT, SPAWN.z);
scene.add(camera);

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => { progressEl.textContent = `Loading… ${loaded} / ${total}`; };
manager.onLoad = () => document.body.classList.add('loaded');

// Meshes the player cannot walk through, and meshes that react to clicks.
let colliders = [];
const interactives = [];
const videos = [];
const sounds = new Map();
let videoSources = new Map();
let world = null;

function soundFor(src, volume) {
  if (!sounds.has(src)) {
    const audio = new Audio(world.url(src));
    audio.preload = 'auto';
    audio.dataset.baseVolume = volume;
    audio.volume = volume * masterVolume;
    sounds.set(src, audio);
  }
  return sounds.get(src);
}

// Installation sounds and the Intro clip form one group: starting one silences the
// rest so pieces never play over each other. The ambient bed is not part of it.
const exclusive = new Set();

function playExclusive(media) {
  for (const other of exclusive) if (other !== media && !other.paused) other.pause();
  media.play().catch(() => {});
}

// Play glyph over the paused clip and a progress bar along its lower edge.
function addVideoControls(mesh, el, video) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.035, -0.045); shape.lineTo(0.05, 0); shape.lineTo(-0.035, 0.045); shape.closePath();
  const glyphMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const glyph = new THREE.Mesh(new THREE.ShapeGeometry(shape), glyphMat);
  glyph.position.z = 0.002;
  mesh.add(glyph);

  const barW = el.width * 0.9;
  const barY = -el.height / 2 + 0.02;
  const track = new THREE.Mesh(new THREE.PlaneGeometry(barW, 0.006),
    new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.8, depthWrite: false }));
  track.position.set(0, barY, 0.002);
  mesh.add(track);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(barW, 0.006),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
  fill.position.set(0, barY, 0.003);
  mesh.add(fill);

  mesh.userData.tick = () => {
    const t = video.duration ? video.currentTime / video.duration : 0;
    fill.scale.x = Math.max(t, 1e-4);
    fill.position.x = -barW / 2 + (barW * t) / 2;
    glyph.visible = video.paused;
  };
}

async function build() {
  world = await createWorld({ renderer, scene, manager, sceneUrl: './scene.json' });
  ({ colliders, videoSources } = world);
  const { data } = world;
  document.getElementById('title').textContent = data.title;
  document.getElementById('author').textContent = data.author;
  ambient = soundFor(data.ambient.src, data.ambient.volume);
  ambient.loop = true;

  for (const { el, mesh, video } of world.tiles) {
    if (video) {
      videos.push({ el, video, mesh });
      if (el.controls) {
        exclusive.add(video);
        mesh.userData.onClick = () => {
          if (video.paused) { playExclusive(video); } else { video.pause(); }
        };
        interactives.push(mesh);
        addVideoControls(mesh, el, video);
      }
    } else if (el.sound) {
      const audio = soundFor(el.sound.src, el.sound.volume);
      exclusive.add(audio);
      mesh.userData.onClick = () => {
        if (audio.paused) { audio.currentTime = 0; playExclusive(audio); } else { audio.pause(); }
      };
      interactives.push(mesh);
    }
  }
  if (startRequested) startMedia(true);
}

let ambient = null;
let started = false;
let startRequested = false;

function startMedia(force = false) {
  if (!world) { startRequested = true; return; }
  if (started && !force) return;
  started = true;
  ambient?.play().catch(() => {});
  world.startLoops();
}

// ---- Controls -------------------------------------------------------------

const controls = new PointerLockControls(camera, renderer.domElement);
const keys = new Set();

// Pointer lock is the normal mode: the scene only shows once the cursor is captured.
// Chrome refuses a lock for about a second after Esc, and also while the window is
// unfocused, so a refusal keeps the pause screen up for another click. Drag-to-look
// is the fallback only for browsers that refuse twice in a row without ever granting
// it (embedded frames, some kiosks).
let lockGrantedOnce = false;
let lockFailures = 0;

function requestLock() {
  try {
    const req = renderer.domElement.requestPointerLock();
    req?.catch?.(() => {});
  } catch { /* reported through pointerlockerror */ }
}

overlay.addEventListener('click', () => {
  startMedia();
  requestLock();
});
controls.addEventListener('lock', () => {
  lockGrantedOnce = true;
  lockFailures = 0;
  overlay.querySelector('.start').textContent = 'Click to continue';
  document.body.classList.remove('drag-mode');
  document.body.classList.add('playing');
});
controls.addEventListener('unlock', () => {
  keys.clear();
  document.body.classList.remove('playing');
});
document.addEventListener('pointerlockerror', () => {
  lockFailures += 1;
  if (lockGrantedOnce || lockFailures < 2) {
    overlay.querySelector('.start').textContent = 'Click again to continue';
    return;
  }
  document.body.classList.add('playing', 'drag-mode');
});

let dragging = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (controls.isLocked) return;
  requestLock();
  dragging = { x: e.clientX, y: e.clientY, moved: false };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
  dragging.x = e.clientX; dragging.y = e.clientY;
  const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  euler.y += dx * 0.004;
  euler.x = THREE.MathUtils.clamp(euler.x + dy * 0.004, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  camera.quaternion.setFromEuler(euler);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (dragging && !dragging.moved) clickAt(e.clientX, e.clientY);
  dragging = null;
});

document.addEventListener('mousedown', (e) => {
  if (controls.isLocked && e.button === 0) clickAt(window.innerWidth / 2, window.innerHeight / 2);
});

window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Escape' && !controls.isLocked) document.body.classList.remove('playing', 'drag-mode');
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('keydown', (e) => {
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') setMasterVolume(masterVolume - 0.05);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') setMasterVolume(masterVolume + 0.05);
});
volumeInput.addEventListener('input', () => setMasterVolume(volumeInput.value / 100));
volumeInput.addEventListener('pointerdown', (e) => e.stopPropagation());
window.addEventListener('blur', () => keys.clear());

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = INTERACT_DISTANCE;
  const hit = raycaster.intersectObjects(interactives, false)[0];
  if (!hit) return null;
  // Anything opaque in front of the button (a wall, a model) blocks the click.
  const blocker = raycaster.intersectObjects(colliders, false)[0];
  if (blocker && blocker.distance < hit.distance - 0.05) return null;
  return hit.object;
}

function clickAt(x, y) {
  const obj = pick(x, y);
  obj?.userData.onClick?.();
}

let hovered = null;
function updateHover() {
  const obj = document.body.classList.contains('playing')
    ? pick(window.innerWidth / 2, window.innerHeight / 2) : null;
  if (obj === hovered) return;
  if (hovered) hovered.material.color.setScalar(1);
  hovered = obj;
  if (hovered) hovered.material.color.setScalar(1.35);
  crosshair.classList.toggle('hot', !!hovered);
}

// ---- Movement with wall collision -------------------------------------------

const moveRay = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function blocked(from, dir, dist) {
  for (const h of [0.3, 1.0]) {
    moveRay.set(new THREE.Vector3(from.x, h, from.z), dir);
    moveRay.far = dist + PLAYER_RADIUS;
    if (moveRay.intersectObjects(colliders, false).length) return true;
  }
  return false;
}

function move(dt) {
  if (!document.body.classList.contains('playing')) return;
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (!f && !s) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? RUN_SPEED : WALK_SPEED;

  camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  tmpDir.set(0, 0, 0).addScaledVector(forward, f).addScaledVector(right, s).normalize();
  const dist = speed * dt;

  // Resolve each axis separately so the player slides along walls.
  for (const axis of ['x', 'z']) {
    const step = tmpDir[axis] * dist;
    if (!step) continue;
    const dir = new THREE.Vector3(axis === 'x' ? Math.sign(step) : 0, 0, axis === 'z' ? Math.sign(step) : 0);
    if (!blocked(camera.position, dir, Math.abs(step))) camera.position[axis] += step;
  }
}

// ---- Loop -----------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1);
  move(dt);
  updateHover();
  for (const { mesh } of videos) mesh.userData.tick?.();
  renderer.render(scene, camera);
});

build().then(() => setMasterVolume(masterVolume));

// Exposed for debugging from the browser console.
window.__vali = { scene, camera, renderer, get colliders() { return colliders; }, interactives, videos };
