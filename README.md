# VÄLI

A standalone copy of the VR art space **VÄLI** by Marina Gavrilova, moved from
the Wonda Spaces platform to plain three.js. It needs no internet connection.

- Free walk (the original space): https://mekedron.github.io/vali/
- Guided tour: https://mekedron.github.io/vali/tour/

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

## Guided tour (`/tour/`)

A presentation mode for visitors who have never used VR: no walking at all. The
tour cuts between nine fixed viewpoints, one per installation, with a short fade
and a slow dolly-in, and each installation's sound starts by itself.

Each stop is staged as its own world instead of a corner of the building: only
that installation's pieces are shown, either in black space or in the open under
the sky, on a floor that fades into the dark, with a soft glow and floating dust
in the piece's colour.

- left click / `→` / `Space` — next stop, right click / `←` — previous stop
- mouse — look around
- `R` — replay the current sound or the Intro video
- `1`–`9` — jump to a stop, `Home` — back to the start
- `#N` in the URL (e.g. `tour/#5`) starts the tour at stop N

Viewpoints, titles, sound, setting (`void` / `sky`) and accent colour of each
stop are defined in `tour/stops.js`.

## Layout

- `scene.json` — every scene element: type, file, world matrix (read from the
  running Wonda player, so placement matches the original exactly), tile size,
  sounds and video settings.
- `shared/world.js` — builds the space from `scene.json` (sky, GLB models,
  images and videos on planes); used by both versions.
- `main.js` — the free-walk viewer: sound buttons, walking with collision.
- `tour/` — the guided tour.
- `assets/` — models, images, videos, sounds, sky panorama.
- `vendor/three/` — three.js (version in `VERSION`), served locally.
- `tools/fetch_assets.py` — the script that downloaded the assets and built
  `scene.json` (it reads dumps from `.raw/`, which are not in the repository).

## GitHub Pages

Everything lives in the repository root: Settings → Pages → Deploy from branch → `main` / root.
