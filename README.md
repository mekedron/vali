# VÄLI

A standalone copy of the VR art space **VÄLI** by Marina Gavrilova, moved from
the Wonda Spaces platform to plain three.js. It needs no internet connection.

Live: https://mekedron.github.io/vali/

## Running locally

Any static file server works (browsers will not load modules and videos from `file://`):

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

## Controls

- `W A S D` / arrow keys — walk, `Shift` — run
- mouse — look around (if the cursor cannot be captured, drag with the button held)
- click a button on the floor — play / stop that installation's sound
  (only one sound plays at a time: a new one stops the previous one and pauses Intro)
- click the Intro screen — play / pause
- slider in the top right corner or `−` / `+` — master volume (starts at 5 %)
- `Esc` — pause

## Layout

- `scene.json` — every scene element: type, file, world matrix (read from the
  running Wonda player, so placement matches the original exactly), tile size,
  sounds and video settings.
- `main.js` — the viewer: sky, GLB models, images and videos on planes, sound
  buttons, walking with collision.
- `assets/` — models, images, videos, sounds, sky panorama.
- `vendor/three/` — three.js (version in `VERSION`), served locally.
- `tools/fetch_assets.py` — the script that downloaded the assets and built
  `scene.json` (it reads dumps from `.raw/`, which are not in the repository).

## GitHub Pages

Everything lives in the repository root: Settings → Pages → Deploy from branch → `main` / root.
