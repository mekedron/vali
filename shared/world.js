import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Builds the VÄLI space from scene.json. Every transform there is a column-major
// world matrix read out of the original Wonda player, so objects are placed with
// matrixAutoUpdate disabled. Asset paths in scene.json are relative to its own URL.

export async function createWorld({ renderer, scene, manager, sceneUrl }) {
  const baseUrl = new URL(sceneUrl, window.location.href);
  const url = (src) => new URL(src, baseUrl).href;
  const data = await (await fetch(baseUrl)).json();

  const textureLoader = new THREE.TextureLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const colliders = [];
  const models = [];
  const tiles = [];
  const videoSources = new Map();

  function place(object, matrix) {
    object.matrixAutoUpdate = false;
    object.matrix.fromArray(matrix);
    object.matrixWorldNeedsUpdate = true;
    scene.add(object);
    return object;
  }

  function loadTexture(src) {
    const tex = textureLoader.load(url(src));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    return tex;
  }

  function buildModel(src, matrix, el = null) {
    const root = place(new THREE.Group(), matrix);
    root.userData.el = el;
    const ready = new Promise((resolve) => {
      gltfLoader.load(url(src), (gltf) => {
        root.add(gltf.scene);
        if (el) gltf.scene.traverse((o) => { if (o.isMesh) colliders.push(o); });
        resolve(root);
      }, undefined, () => resolve(root));
    });
    if (el) models.push({ el, root, ready });
    return root;
  }

  // One decoder per clip: decor tiles that show the same file share a video and
  // texture. A clip with player controls gets its own so pausing it leaves the
  // decor running.
  function videoSource(el) {
    const key = el.controls ? `${el.src}#${el.id}` : el.src;
    if (videoSources.has(key)) return videoSources.get(key);
    const video = document.createElement('video');
    video.src = url(el.src);
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.loop = el.loop;
    video.preload = 'auto';
    // Looping decor clips carry silent audio tracks; only clips with player controls are heard.
    video.muted = !el.controls || el.volume === 0;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Mipmaps keep 1080p frames from shimmering when a tile is seen small or at an angle.
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = maxAniso;
    const source = { video, tex, el, baseVolume: el.volume };
    videoSources.set(key, source);
    return source;
  }

  function buildTile(el) {
    const map = el.type === 'image' ? loadTexture(el.src) : videoSource(el).tex;
    const geo = new THREE.PlaneGeometry(el.width, el.height);
    const mat = new THREE.MeshBasicMaterial({
      map, transparent: true, alphaTest: el.type === 'image' ? 0.005 : 0, side: THREE.FrontSide,
    });
    const mesh = place(new THREE.Mesh(geo, mat), el.matrix);
    mesh.userData.el = el;
    tiles.push({ el, mesh, video: el.type === 'video' ? videoSource(el).video : null });
    return mesh;
  }

  for (const l of data.lights) {
    if (l.type === 'AmbientLight') scene.add(new THREE.AmbientLight(l.color, l.intensity));
  }

  const skyGeo = new THREE.SphereGeometry(data.skybox.radius, 128, 54);
  const skyMat = new THREE.MeshBasicMaterial({ map: loadTexture(data.skybox.src), side: THREE.BackSide, depthWrite: false });
  place(new THREE.Mesh(skyGeo, skyMat), data.skybox.matrix).renderOrder = -1;

  buildModel(data.environment.src, data.environment.matrix);

  for (const el of data.elements) {
    if (el.type === 'object3D') buildModel(el.src, el.matrix, el);
    else if (el.type === 'image' || el.type === 'video') buildTile(el);
  }

  return {
    data, url, colliders, models, tiles, videoSources,
    // Starts every autoplaying decor clip; call from a user gesture.
    startLoops() {
      for (const { video, el } of videoSources.values()) {
        if (el.autoplay && !el.controls) video.play().catch(() => {});
        else video.load();
      }
    },
  };
}
