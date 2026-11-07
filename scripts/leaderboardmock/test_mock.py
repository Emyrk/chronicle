import unittest
import subprocess
import sys
from pathlib import Path
from mock import validate_target, query_sql, history_bands, varied_number

class SafetyTests(unittest.TestCase):
    def test_explicit_mock_target(self):
        self.assertEqual(validate_target('postgresql://test:local@127.0.0.1:55439/chronicle_lbmock_fixture'),'chronicle_lbmock_fixture')

    def test_reject_remote_implicit_or_redirectable_targets(self):
        for value in [
            'postgresql://test@production:5432/chronicle_lbmock_fixture',
            'postgresql://test@localhost:5432/chronicle_lbmock_fixture',
            'postgresql://test@127.0.0.1/chronicle_lbmock_fixture',
            'postgresql://test@127.0.0.1:5432/chronicle',
            'postgresql://test@127.0.0.1:5432/chronicle_lbmock_fixture?host=production',
            'postgresql://test@127.0.0.1:5432/chronicle_lbmock_fixture?service=prod',
            'postgresql:///chronicle_lbmock_fixture',
        ]:
            with self.subTest(value=value), self.assertRaises(ValueError): validate_target(value)

    def test_peak_examples_require_explicit_write_approval(self):
        result = subprocess.run([sys.executable, str(Path(__file__).with_name("mock.py")), "peak-examples", "--database-url", "postgresql://test:local@127.0.0.1:55439/chronicle_lbmock_fixture"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Explicit --allow-local-writes required", result.stderr)

    def test_exact_history_bands(self):
        self.assertEqual(history_bands([]), (0, 0, 0))
        self.assertEqual(history_bands([100]), (100, 0, 0))
        self.assertEqual(history_bands([100, 100]), (100, 100, 0))
        self.assertEqual(history_bands([100, 100, 100]), (100, 100, 100))
        self.assertEqual(history_bands([50, 10, 40, 20, 30]), (50, 35, 20))

    def test_varied_seed_is_stable_and_boss_specific(self):
        self.assertEqual(varied_number(7, "A", 1), varied_number(7, "A", 1))
        self.assertNotEqual(varied_number(7, "A", 1), varied_number(7, "B", 1))
        self.assertNotEqual(varied_number(7, "A", 1), varied_number(8, "A", 1))

    def test_benchmark_uses_application_query(self):
        class Values(dict):
            def __missing__(self, key): return "synthetic'value"
        sql = query_sql(Values())
        self.assertIn("synthetic''value",sql)
        self.assertNotIn('@tenant_id',sql)
        self.assertIn('leaderboard_player_boss_subjects',sql)
        self.assertNotIn('leaderboard_player_observations',sql)

if __name__=='__main__': unittest.main()
