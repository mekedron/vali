"""Downloads every asset of the Wonda course and writes scene.json.

Transforms come from .raw/live_dump.json / .raw/live_models.json: world matrices
read out of the running Wonda player, so placement matches the original exactly.
"""
import json, os, re, sys, urllib.request, urllib.parse, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '.raw')
PUB = ROOT

def load(name):
    return json.load(open(os.path.join(RAW, name)))

def fetch(url, rel):
    dst = os.path.join(PUB, rel)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return rel
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    print('GET', url, '->', rel, flush=True)
    u = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit(u._replace(path=urllib.parse.quote(urllib.parse.unquote(u.path))))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as r, open(dst + '.part', 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(dst + '.part', dst)
    return rel

TRANSLIT = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','sch','','y','','e','yu','ya']))

def slug(name, media_id):
    base = os.path.splitext(name)[0]
    base = ''.join(TRANSLIT.get(c.lower(), c) for c in base)
    base = re.sub(r'[^A-Za-z0-9\-]+', '_', base).strip('_') or 'file'
    return f'{base}_{media_id[:8]}'

def best_image(media):
    variants = (media.get('properties') or {}).get('variants') or {}
    best = None
    for h, lst in variants.items():
        for v in lst:
            if v['format'] == 'webp' and int(h) <= 2048:
                if best is None or int(h) > best[0]:
                    best = (int(h), v['path'])
    return best[1] if best else media['path']

def main():
    course = load('viewlazy.json')
    scenes = load('scenes.json')
    ann = load('annotations_dynamic.json')['annotations']
    live = {e['id']: e for e in load('live_dump.json')['elements']}
    models = load('live_models.json')
    group_m = load('live_groups.json')
    dump = load('live_dump.json')

    sounds = {}
    def sound(url, name):
        mid = url.split('/content/')[1].split('/')[0]
        if mid not in sounds:
            ext = os.path.splitext(urllib.parse.urlparse(url).path)[1] or '.mp3'
            sounds[mid] = fetch(url, f'assets/audio/{slug(name, mid)}{ext}')
        return sounds[mid]

    out = {'title': course['title'], 'author': course['description'], 'elements': []}

    sky = course['course_skybox']
    out['skybox'] = {
        'src': fetch(best_sky(sky), f'assets/sky/{slug(sky["name"], sky["id"])}.webp'),
        'matrix': dump['skybox']['m'],
        'radius': dump['skybox']['geometry']['radius'],
    }
    env = course['course_model_3D']
    out['environment'] = {
        'src': fetch(env['path'].replace('.bundle.json', '.glb'), f'assets/models/{slug(env["name"], env["id"])}.glb'),
        'matrix': dump['env']['m'],
    }
    sc = scenes[0]
    out['ambient'] = {
        'src': sound(f'https://eu-content.spaces.wondavr.com/content/{sc["sound_id"]}/source.mp3', 'ambient'),
        'volume': sc['properties'].get('volume', 100) / 100,
    }
    out['lights'] = [{'type': l['type'], 'color': '#' + l['color'], 'intensity': l['intensity']} for l in dump['lights']]

    for a in ann:
        t = a['type']
        if t == 'snapZone':
            continue
        p = a['properties']
        m = a['media']
        e = {'id': a['id'], 'type': t, 'label': a['label']}
        if t == 'object3D':
            e['src'] = fetch(m['path'].replace('.bundle.json', '.glb'), f'assets/models/{slug(m["name"], m["id"])}.glb')
            e['matrix'] = group_m[a['id']]
        else:
            L = live[a['id']]
            e['matrix'] = L['m']
            e['width'] = L['geometry']['width']
            e['height'] = L['geometry']['height']
            if t == 'image':
                e['src'] = fetch(best_image(m), f'assets/images/{slug(m["name"], m["id"])}.webp')
            else:
                e['src'] = fetch(m['path'], f'assets/videos/{slug(m["name"], m["id"])}.mp4')
                e['loop'] = bool(p.get('loopVideo'))
                e['autoplay'] = bool(p.get('autoplay'))
                e['controls'] = bool(p.get('displayVideoControls'))
                e['volume'] = p.get('volume', 100) / 100
        fx = [f for f in ((p.get('action') or {}).get('effects') or []) if f.get('type') == 'sound']
        if fx:
            e['sound'] = {'src': sound(fx[0]['sound_url'], fx[0]['sound_name']), 'volume': fx[0].get('volume', 100) / 100, 'name': fx[0]['sound_name']}
        out['elements'].append(e)

    json.dump(out, open(os.path.join(PUB, 'scene.json'), 'w'), ensure_ascii=False, indent=1)
    print('elements:', len(out['elements']))

def best_sky(sky):
    variants = (sky.get('properties') or {}).get('variants') or {}
    hs = sorted((int(h) for h in variants), reverse=True)
    for h in hs:
        for v in variants[str(h)]:
            if v['format'] == 'webp' and h <= 4096:
                return v['path']
    return sky['path']

main()
