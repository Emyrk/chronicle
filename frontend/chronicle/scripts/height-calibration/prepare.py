#!/usr/bin/env python3
"""Build a private replay height lab from an advanced combat log and pinned GLB."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
MAP = HERE.parent.parent / 'src/pages/Instance/EventsPanels/Map'
PREFIXES = ('Player-', 'Creature-', 'Pet-', 'Vehicle-')
SCHOOLS = {1: 2, 2: 3, 4: 4, 8: 5, 16: 6, 32: 7, 64: 8}


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path, value):
    Path(path).write_text(json.dumps(value, sort_keys=True, allow_nan=False, separators=(',', ':')))


def school(value):
    """Raw bitmask -> Chronicle School enum. Composite schools use first bit."""
    mask = int(value, 0) if value.lower().startswith('0x') else int(value)
    return next((enum for bit, enum in SCHOOLS.items() if mask & bit), 0)


def timestamp(value):
    # Raw logs have local wall time, no timezone. UTC here is a synthetic clock,
    # not a claim about the player's location. Only relative offsets matter.
    return dt.datetime.strptime(value, '%m/%d/%Y %H:%M:%S.%f').replace(tzinfo=dt.timezone.utc)


def extract(path, calibration, raw_map, attempt):
    players, units, guids, indexes = {}, {}, [], {}
    rows, positions, health = [], {}, {}
    start = end = None
    count = 0
    success = False
    raw_maps = set()

    def guid(value):
        if value not in indexes:
            indexes[value] = len(guids)
            guids.append(value)
            if value.startswith('Player-'):
                players[value] = {'name': f'Player {len(players) + 1}', 'class': 'UNKNOWN'}
            elif value.startswith(('Creature-', 'Pet-', 'Vehicle-')):
                entry = int(value.split('-')[-2])
                name = calibration['encounterName'] if entry == calibration.get('enemyEntry') else f'Unit {len(units) + 1}'
                units[value] = {'name': name, 'entry': entry}
        return indexes[value]

    with path.open(encoding='utf-8-sig') as stream:
        for line_number, line in enumerate(stream, 1):
            if '  ' not in line:
                continue
            clock, body = line.rstrip().split('  ', 1)
            fields = next(csv.reader([body]))
            if not fields:
                continue
            event, a = fields[0], fields[1:]
            if event == 'ENCOUNTER_START':
                if start is not None:
                    raise ValueError('Encounter started before selected encounter ended')
                if a and int(a[0]) == calibration['encounterID']:
                    count += 1
                    if count == attempt:
                        if len(a) < 5 or int(a[4]) != calibration['mapID']:
                            raise ValueError('Encounter-start map does not match calibration')
                        start = timestamp(clock)
                continue
            if start is None:
                continue
            if event == 'ENCOUNTER_END':
                if int(a[0]) != calibration['encounterID']:
                    raise ValueError('Mismatched encounter end')
                end = timestamp(clock)
                success = len(a) > 4 and a[4] == '1'
                break
            if len(a) < 8 or not (a[0].startswith(PREFIXES) or a[4].startswith(PREFIXES)):
                continue
            try:
                delta = timestamp(clock) - start
                offset = (delta.days * 86400 + delta.seconds) * 1000 + delta.microseconds // 1000
                if offset < 0:
                    raise ValueError('Negative encounter offset')
                source, target = guid(a[0]), guid(a[4])
                spell = event.startswith(('SPELL_', 'RANGE_', 'DAMAGE_SHIELD', 'DAMAGE_SPLIT'))
                index = 11 if spell else 8
                block = a[index:index + 19]
                advanced = len(block) == 19 and block[0].startswith(PREFIXES) and block[0] in (a[0], a[4])
                if advanced:
                    x, y, facing = float(block[14]), float(block[15]), float(block[17])
                    observed_map = int(block[16])
                    raw_maps.add(observed_map)
                    if observed_map != raw_map:
                        raise ValueError('Snapshot map differs from explicit --raw-map; review mapping')
                    if not all(map(math.isfinite, (x, y, facing))):
                        raise ValueError('Nonfinite position')
                    unit = guid(block[0])
                    # Last snapshot wins at an identical unit/offset; facing is retained.
                    positions[offset, unit] = ['p', offset, unit, x, y, None, calibration['mapID'], facing]
                    health[offset, unit] = ['r', offset, unit, int(block[2]), int(block[3]), 0]
                    suffix = a[index + 19:]
                    if event in ('SPELL_DAMAGE', 'SPELL_PERIODIC_DAMAGE', 'RANGE_DAMAGE', 'SWING_DAMAGE') and suffix:
                        rows.append(['d', offset, source, target, int(suffix[0]), 0,
                                     school(a[10] if spell else suffix[3]),
                                     int(a[8]) if spell else 6603, a[9] if spell else 'Auto Attack'])
                    elif event in ('SPELL_HEAL', 'SPELL_PERIODIC_HEAL') and suffix:
                        rows.append(['h', offset, source, target, int(suffix[0]), 0, school(a[10]), int(a[8]), a[9]])
                if event == 'SPELL_CAST_SUCCESS':
                    rows.append(['g', offset, source, target, 1, int(a[8]), a[9]])
                elif event == 'UNIT_DIED':
                    rows.append(['k', offset, source, target])
            except (ValueError, IndexError) as error:
                raise ValueError(f'Unsupported advanced log row at line {line_number}: {error}') from error
    if start is None or end is None or end <= start or not positions:
        raise ValueError('Selected encounter is missing, incomplete, or has no advanced snapshots')
    encounter_id = f"local-{calibration['encounterID']}-{attempt}"
    fixture = {
        'source': {'host': 'local-log', 'instanceId': 'local-height-calibration', 'encounterId': encounter_id},
        'instance': {'name': 'Local height calibration', 'iconBaseUrl': '/dalaran-demo',
                     **({'datasetId': calibration['datasetId']} if calibration.get('datasetId') else {}),
                     'positionCoordinateSpace': 'world', 'capabilities': ['unit-position', 'unit-resources']},
        'encounter': {'id': encounter_id, 'name': calibration['encounterName'], 'boss': True,
                      'mapId': calibration['mapID'], 'killType': 'clean' if success else 'wipe',
                      'startTime': start.isoformat(), 'endTime': end.isoformat(),
                      'enemies': [{'id': value, 'name': unit['name'], 'boss': True} for value, unit in units.items()
                                  if unit['entry'] == calibration.get('enemyEntry')]},
        'firstTimestamp': start.isoformat(), 'players': players, 'units': units, 'guids': guids,
        'events': sorted([*rows, *positions.values(), *health.values()], key=lambda row: row[1]),
    }
    return fixture, sorted(raw_maps)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('log', 'mesh', 'calibration', 'out', 'blender'):
        parser.add_argument('--' + flag, required=True, type=Path)
    parser.add_argument('--raw-map', type=int, help='Explicit snapshot map ID, defaults to reviewed mapID. Does not change the raw log.')
    parser.add_argument('--attempt', type=int, default=1, help='1-based matching encounter occurrence (default 1)')
    parser.add_argument('--image', type=Path, help='Optional registered PNG, requires --height-json')
    parser.add_argument('--height-json', type=Path, help='Renderer height.json declaring exact image frame_world bounds')
    args = parser.parse_args()
    calibration = json.loads(args.calibration.read_text())
    if (calibration.get('version') != 1 or calibration.get('frame') != 'wow-yup-mirrored-x'
            or calibration.get('review', {}).get('status') != 'operator-reviewed'
            or not calibration.get('review', {}).get('note') or not calibration.get('id')
            or not calibration.get('dataset') or not isinstance(calibration.get('mapID'), int)
            or not isinstance(calibration.get('encounterID'), int) or not calibration.get('encounterName')
            or not isinstance(calibration.get('referenceZ'), (int, float))
            or not math.isfinite(calibration['referenceZ'])):
        parser.error('Expected a reviewed version-1 calibration in wow-yup-mirrored-x frame')
    if sha(args.mesh) != calibration.get('meshSHA256'):
        parser.error('GLB SHA-256 does not match reviewed calibration; recalibration required')
    if args.attempt < 1:
        parser.error('--attempt must be positive')
    out = args.out.resolve()
    if any((parent / '.git').exists() for parent in [out, *out.parents]):
        parser.error('--out must be outside a Git checkout')
    if out.exists() and any(out.iterdir()):
        parser.error('--out must be absent or empty; use a new output directory')
    if bool(args.image) != bool(args.height_json):
        parser.error('--image and --height-json must be supplied together')
    raw_map = calibration['mapID'] if args.raw_map is None else args.raw_map
    fixture, raw_maps = extract(args.log, calibration, raw_map, args.attempt)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='height-calibration-', dir=out.parent) as temporary:
        work = Path(temporary)
        write(work / 'fixture.json', fixture)
        subprocess.run(['node', '--experimental-strip-types', str(HERE / 'tracks.mjs'), 'queries',
                        str(work / 'fixture.json'), str(work / 'queries.json')], check=True)
        subprocess.run([str(args.blender.resolve()), '--background', '--factory-startup', '--python-exit-code', '1',
                        '--python', str(HERE / 'cast.py'), '--', '--mesh', str(args.mesh.resolve()),
                        '--queries', str(work / 'queries.json'), '--out', str(work / 'candidates.json'),
                        '--metadata', str(work / 'geometry.json')], check=True)
        geometry = json.loads((work / 'geometry.json').read_text())
        bounds = geometry['bounds']
        mesh = {'path': 'map.glb', 'bounds': bounds, 'zMin': geometry['zMin'], 'zMax': geometry['zMax'], 'frame': calibration['frame']}
        instance = {'mapID': calibration['mapID'], 'name': fixture['instance']['name'], 'directory': str(calibration['mapID']),
                    'instanceType': 1, 'floors': [], 'mesh': mesh}
        if args.image:
            height = json.loads(args.height_json.read_text())
            lo, hi = height['frame_world']['min'], height['frame_world']['max']
            registered = dict(minX=lo[0], maxX=hi[0], minY=lo[1], maxY=hi[1])
            if any(abs(bounds[key] - registered[key]) > 0.01 for key in bounds):
                raise ValueError('Image frame bounds differ from GLB extent; review registration')
            with args.image.open('rb') as stream:
                header = stream.read(24)
            if header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
                raise ValueError('--image must be a PNG')
            width, height_px = struct.unpack('>II', header[16:24])
            instance['renders'] = {'path': 'map.png', 'width': width, 'height': height_px, 'bounds': bounds}
        fixture['manifest'] = {'format': 'chronicle-wow-map-art-v2',
                               'target': {'product': 'local-calibration', 'build': calibration['id'], 'region': 'local', 'locale': 'enUS'},
                               'maps': [], 'instances': [instance]}
        write(work / 'fixture.json', fixture)
        subprocess.run(['node', '--experimental-strip-types', str(HERE / 'tracks.mjs'), 'solve',
                        str(work / 'fixture.json'), str(work / 'candidates.json'), str(args.calibration.resolve()),
                        str(work / 'tracks.json')], check=True)
        provenance = {
            'version': 1, 'calibration': calibration, 'sourceSHA256': sha(args.log), 'meshSHA256': sha(args.mesh),
            'rawMapIDs': raw_maps, 'normalizedMapID': calibration['mapID'], 'attempt': args.attempt,
            'mapping': 'explicit --raw-map to reviewed mapID; raw source unchanged',
            'geometry': geometry,
            'trackDiagnostics': json.loads((work / 'tracks.json').read_text())['diagnostics'],
            'tools': {path.name: sha(path) for path in [HERE / 'prepare.py', HERE / 'cast.py', HERE / 'tracks.mjs', MAP / 'walkableFloors.ts']},
            'node': subprocess.check_output(['node', '--version'], text=True).strip(),
            'blender': subprocess.check_output([str(args.blender.resolve()), '--version'], text=True).splitlines()[0],
            'limitations': 'Private demo subset, not full parser. No logged Z; tracks are inferred, not ground truth. Player names anonymized, classes unknown, raw GUIDs retained. Cast successes, advanced damage/heal amounts, health, positions, deaths only. Crits, overheal, absorbs, cast durations and ownership omitted. Composite school masks use first matching bit. Local timestamps use synthetic UTC clock. Blender candidate probes merge surfaces within 0.00001 yard; no production BVH parity claim.',
        }
        if args.image:
            provenance.update(imageSHA256=sha(args.image), heightJSONSHA256=sha(args.height_json))
        write(work / 'provenance.json', provenance)
        out.mkdir(exist_ok=True)
        (out / 'maps').mkdir()
        for name in ('fixture.json', 'tracks.json', 'provenance.json'):
            shutil.copyfile(work / name, out / name)
        shutil.copyfile(args.mesh, out / 'maps/map.glb')
        if args.image:
            shutil.copyfile(args.image, out / 'maps/map.png')
    print('Local calibration ready:', len(fixture['events']), 'events;', geometry['queries'], 'candidate queries')


if __name__ == '__main__':
    main()
