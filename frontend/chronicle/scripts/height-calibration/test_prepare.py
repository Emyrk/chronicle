"""Deterministic extractor checks using synthetic records, never private log data."""
import csv
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('height_prepare', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)


class ExtractTest(unittest.TestCase):
    def test_school_bitmask_conversion(self):
        for raw, enum in [('0x1', 2), ('0x2', 3), ('0x4', 4), ('0x8', 5),
                          ('0x10', 6), ('0x20', 7), ('0x40', 8), ('64', 8), ('0x14', 4), ('0', 0)]:
            self.assertEqual(prepare.school(raw), enum)

    def extract(self, raw_map=1416, end=True):
        calibration = dict(encounterID=3311, mapID=2959, encounterName='Test Boss', enemyEntry=42)
        source, target = 'Player-1-TEST', 'Creature-0-1-2959-1-42-TEST'
        lines = ['01/01/2026 00:00:00.0000  ENCOUNTER_START,3311,"Test Boss",1,1,2959']
        for x, facing in [(1, 0), (2, 1.5)]:
            # Same unit and millisecond, last advanced snapshot must win.
            snapshot = [target, '0000000000000000', 90, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, x, 3, 1416, facing, 1]
            fields = ['SPELL_DAMAGE', source, 'Private player', '0x1', '0', target, 'Test Boss', '0x1', '0', 123, 'Test spell', '0x10', *snapshot, 5, 0, 0, 16]
            stream = io.StringIO()
            csv.writer(stream, lineterminator='').writerow(fields)
            lines.append('01/01/2026 00:00:00.1000  ' + stream.getvalue())
        if end:
            lines.append('01/01/2026 00:00:01.0000  ENCOUNTER_END,3311,"Test Boss",1,1,1,1000')
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'synthetic.log'
            path.write_text('\n'.join(lines))
            return prepare.extract(path, calibration, raw_map, 1)

    def test_explicit_mapping_dedup_facing_and_school(self):
        fixture, raw_maps = self.extract()
        self.assertEqual(raw_maps, [1416])
        positions = [row for row in fixture['events'] if row[0] == 'p']
        self.assertEqual(len(positions), 1)
        self.assertEqual(positions[0][1], 100)
        self.assertEqual(positions[0][3:], [2.0, 3.0, None, 2959, 1.5])
        self.assertEqual(len([row for row in fixture['events'] if row[0] == 'r']), 1)
        self.assertEqual([row[6] for row in fixture['events'] if row[0] == 'd'], [6, 6])
        self.assertEqual(next(iter(fixture['players'].values()))['name'], 'Player 1')
        self.assertNotIn('Private player', str(fixture))
        self.assertEqual(fixture, self.extract()[0])

    def test_wrong_raw_map_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'raw-map'):
            self.extract(raw_map=2959)

    def test_incomplete_encounter_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'incomplete'):
            self.extract(end=False)


if __name__ == '__main__':
    unittest.main()
