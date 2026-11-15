#!/usr/bin/env python3
"""SQL protocol smoke test. Uses only a disposable local PostgreSQL cluster.

Requires initdb, pg_ctl, psql on PATH. Never connects to an existing database.
The parent FK fixture is deliberately minimal; sqlc checks against dump.sql
separately validate the real schema identifiers/types.
"""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid

DATABASE = Path(__file__).resolve().parents[1]
QUERIES = dict(re.findall(
    r"-- name: (\w+) :\w+\n(.*?;)",
    (DATABASE / "queries/parser_handoff.sql").read_text(), re.S,
))


def main():
    with tempfile.TemporaryDirectory(prefix="parser-handoff-") as directory:
        root = Path(directory)
        data = root / "data"
        env = {**os.environ, "PGHOST": directory, "PGPORT": "5432",
               "PGDATABASE": "postgres", "PGUSER": "handoff_test"}
        subprocess.run(["initdb", "-D", str(data), "-U", "handoff_test", "-A", "trust"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run(["pg_ctl", "-D", str(data), "-l", str(root / "server.log"),
                        "-o", f"-k {directory} -c listen_addresses=''", "-w", "start"],
                       check=True, stdout=subprocess.DEVNULL)
        try:
            def sql(text):
                result = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
                                        input=text, text=True, capture_output=True, env=env,
                                        check=True)
                return result.stdout.strip().splitlines()

            def literal(value):
                if value is None:
                    return "NULL"
                if isinstance(value, int):
                    return str(value)
                return "'" + str(value).replace("'", "''") + "'"

            params = dict(log_group_id=str(uuid.uuid4()), generation=1,
                          initial_generation=1, lease_token=str(uuid.uuid4()), lease_duration="1 hour",
                          predecessor_iteration=0, predecessor_attempt_id=None,
                          producing_binary="sha256:binary", dataset_identity='{"revision":1}',
                          input_identity='{"parts":[1]}', parser_engine="test",
                          object_key="checkpoint/1", object_digest="sha256:checkpoint")

            def query(name, **overrides):
                values = params | overrides
                text = re.sub(r"sqlc.narg\((\w+)\)", lambda m: literal(values[m[1]]), QUERIES[name])
                return re.sub(r"@(\w+)", lambda m: literal(values[m[1]]), text)

            def run(name, count=1, **overrides):
                rows = sql(query(name, **overrides))
                assert len(rows) == count, (name, count, rows)

            sql("CREATE TABLE wow_log_groups (id uuid PRIMARY KEY);")
            sql((DATABASE / "migrations/000389_parser_handoff.up.sql").read_text())
            sql(f"INSERT INTO wow_log_groups VALUES ('{params['log_group_id']}');")
            run("EnsureParserHandoff", 0)
            run("EnsureParserHandoff", 0)
            assert sql("SELECT native_enabled FROM parser_handoffs;") == ["t"]
            run("SetParserHandoffNativeEnabled", 0, native_enabled="false")
            run("EnsureParserHandoff", 0)
            assert sql("SELECT native_enabled FROM parser_handoffs;") == ["f"]
            run("SetParserHandoffNativeEnabled", 0, native_enabled="true")
            assert sql("SELECT native_enabled FROM parser_handoffs;") == ["t"]
            # Existing logs can adopt a generation above one directly.
            adopted_log = str(uuid.uuid4())
            sql(f"INSERT INTO wow_log_groups VALUES ('{adopted_log}');")
            run("EnsureParserHandoff", 0, log_group_id=adopted_log, initial_generation=7)
            assert sql(f"SELECT generation FROM parser_handoffs WHERE log_group_id = '{adopted_log}';") == ["7"]
            run("EnsureParserHandoff", 0, log_group_id=adopted_log, initial_generation=8)
            assert sql(f"SELECT generation FROM parser_handoffs WHERE log_group_id = '{adopted_log}';") == ["7"]
            sql(f"DELETE FROM wow_log_groups WHERE id = '{adopted_log}';")
            run("ClaimParserHandoffLease")
            run("ClaimParserHandoffLease", 0, lease_token=str(uuid.uuid4()))
            run("RenewParserHandoffLease")
            run("RenewParserHandoffLease", 0, lease_token=str(uuid.uuid4()))

            def accept():
                attempt = str(uuid.uuid4())
                params["attempt_id"] = attempt
                statements = [query(name) for name in (
                    "LockParserHandoffForAcceptance", "InsertParserCheckpointAttempt",
                    "AdvanceParserHandoffHead")]
                assert len(sql("BEGIN;" + "\n".join(statements) + "COMMIT;")) == 3
                params["predecessor_iteration"] += 1
                params["predecessor_attempt_id"] = attempt
                return attempt

            first = accept()
            run("LockParserHandoffForAcceptance", 0, predecessor_iteration=0,
                predecessor_attempt_id=None)
            token = str(uuid.uuid4())
            run("ClaimParserPublication", attempt_id=first, publication_token=token)
            second = accept()
            # A newer durable head in the same generation does not revoke it.
            run("LockParserPublication", iteration=1, publication_token=token)
            run("ClaimParserPublication", 0, attempt_id=second,
                publication_token=str(uuid.uuid4()))
            for name in ("LockParserPublication", "CheckParserPublication",
                         "RenewParserPublication", "CompleteParserPublication",
                         "ReleaseParserPublication"):
                run(name, 0, generation=2, iteration=1, publication_token=token)
            run("RenewParserPublication", iteration=1, publication_token=token)
            run("CheckParserPublication", iteration=1, publication_token=token)
            run("CompleteParserPublication", iteration=1, publication_token=token)
            run("ClaimParserPublication", 0, attempt_id=first, publication_token=token)
            newer_token = str(uuid.uuid4())
            run("ClaimParserPublication", attempt_id=second, publication_token=newer_token)
            # Force expiry without sleeps or dependence on machine speed.
            sql("UPDATE parser_handoffs SET publication_expires_at = '-infinity';")
            run("RenewParserPublication", 0, iteration=2, publication_token=newer_token)
            run("CompleteParserPublication", 0, iteration=2, publication_token=newer_token)
            run("ClaimParserPublication", 0, attempt_id=first, publication_token=token)
            replacement = str(uuid.uuid4())
            run("ClaimParserPublication", attempt_id=second, publication_token=replacement)
            run("ReleaseParserPublication", 0, iteration=2, publication_token=newer_token)
            run("LockParserPublication", 0, iteration=2, publication_token=newer_token)
            run("ReleaseParserPublication", iteration=2, publication_token=replacement)
            assert sql("SELECT publication_iteration FROM parser_handoffs;") == ["2"]
            run("ClaimParserPublication", 0, attempt_id=first, publication_token=token)
            run("ClaimParserPublication", attempt_id=second, publication_token=replacement)
            # Explicit reparse generation revokes old attempts and active tokens.
            run("AdvanceParserHandoffGeneration", expected_generation=1)
            run("RenewParserHandoffLease", 0)
            run("ClaimParserPublication", 0, attempt_id=second, publication_token=str(uuid.uuid4()))
            for name in ("LockParserPublication", "CheckParserPublication",
                         "RenewParserPublication", "CompleteParserPublication",
                         "ReleaseParserPublication"):
                run(name, 0, iteration=2, publication_token=replacement)
            assert sql("SELECT publication_token IS NULL, publication_expires_at IS NULL, publication_iteration FROM parser_handoffs;") == ["t|t|2"]
            params["generation"] = 2
            params["lease_token"] = str(uuid.uuid4())
            run("ClaimParserHandoffLease")
            sql("UPDATE parser_handoffs SET parse_lease_expires_at = '-infinity';")
            run("LockParserHandoffForAcceptance", 0)
            run("InsertParserCheckpointAttempt", 0, attempt_id=str(uuid.uuid4()))
            run("RenewParserHandoffLease", 0)
            old_token = params["lease_token"]
            params["lease_token"] = str(uuid.uuid4())
            run("ClaimParserHandoffLease")
            run("ReleaseParserHandoffLease", 0, lease_token=old_token)
            third = accept()
            fourth = accept()
            third_token = str(uuid.uuid4())
            run("ClaimParserPublication", attempt_id=fourth, publication_token=third_token)
            sql("UPDATE parser_handoffs SET publication_expires_at = '-infinity';")
            # Third is newer than published (1), but older than reserved (4).
            run("ClaimParserPublication", 0, attempt_id=third, publication_token=str(uuid.uuid4()))
            run("ReleaseParserPublication", iteration=4, publication_token=third_token)
            run("ClaimParserPublication", 0, attempt_id=third, publication_token=str(uuid.uuid4()))
            assert sql("SELECT published_iteration, publication_iteration FROM parser_handoffs;") == ["1|4"]
            run("ReleaseParserHandoffLease")
            sql(f"DELETE FROM wow_log_groups WHERE id = '{params['log_group_id']}';")
            assert sql("SELECT count(*) FROM parser_checkpoint_attempts;") == ["0"]
            sql((DATABASE / "migrations/000389_parser_handoff.down.sql").read_text())
            print("PASS: parser handoff acceptance, lease, publication, expiry, cascade, down migration")
        finally:
            subprocess.run(["pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop"],
                           check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    main()
