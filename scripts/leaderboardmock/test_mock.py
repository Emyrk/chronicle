import unittest
import subprocess
import sys
from pathlib import Path
from mock import validate_target, query_sql

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

    def test_benchmark_uses_application_query(self):
        class Values(dict):
            def __missing__(self, key): return "synthetic'value"
        sql = query_sql(Values())
        self.assertIn("synthetic''value",sql)
        self.assertNotIn('@tenant_id',sql)
        self.assertIn('leaderboard_player_boss_subjects',sql)
        self.assertNotIn('leaderboard_player_observations',sql)

if __name__=='__main__': unittest.main()
