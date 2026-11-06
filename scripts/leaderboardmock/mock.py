#!/usr/bin/env python3
"""Explicit local-only summary fixtures and EXPLAIN harness. Never reads prod env."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import subprocess
import time
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[2]
TENANT = "00000000-0000-4000-8000-000000000001"
REALM = "00000000-0000-4000-8000-000000000002"
DATASET = "00000000-0000-4000-8000-000000000003"
SERVER = "00000000-0000-4000-8000-000000000004"

def validate_target(url):
    u = urlsplit(url)
    if u.scheme not in ("postgres", "postgresql") or u.hostname not in ("127.0.0.1", "::1"):
        raise ValueError("Only explicit numeric loopback PostgreSQL targets are allowed")
    if not u.port or not u.username or u.query or u.fragment:
        raise ValueError("Specify user and port; connection query parameters/fragments are forbidden")
    name = unquote(u.path.lstrip("/"))
    if not re.fullmatch(r"chronicle_lbmock_[a-z0-9_]+", name):
        raise ValueError("Database name must start chronicle_lbmock_ and contain only lowercase letters/digits/_")
    return name

def literal(value):
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, (int, float)): return str(value)
    if isinstance(value, list): return "ARRAY[" + ",".join(literal(v) for v in value) + "]"
    return "'" + str(value).replace("'", "''") + "'"

def query_sql(params):
    sql = (ROOT / "database/queries/leaderboard_read.sql").read_text().split("-- name: ListLeaderboardV2Cohorts")[0]
    return re.sub(r"@(\w+)", lambda m: literal(params[m[1]]), sql)

class Database:
    def __init__(self, url):
        self.name = validate_target(url)
        self.url = url
        # No libpq service/default variables can redirect an explicit target.
        self.env = {k:v for k,v in os.environ.items() if not k.startswith("PG")}
    def run(self, sql):
        p = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", self.url], input=sql, text=True, capture_output=True, env=self.env)
        if p.returncode: raise RuntimeError(p.stderr)
        return p.stdout.strip()
    def check_marker(self):
        marker = self.run("SELECT value FROM leaderboard_mock_marker WHERE key='purpose';")
        if marker != "synthetic-only": raise ValueError("Missing synthetic-only marker; refusing target")

def initialize(db):
    if db.run("SELECT count(*) FROM information_schema.tables WHERE table_schema='public';") != "0":
        raise ValueError("--init requires an empty, explicitly named mock database")
    db.run((ROOT / "database/dump.sql").read_text())
    for n in (342,343):
        path = next((ROOT / "database/migrations").glob(f"{n:06d}_*.up.sql"))
        db.run(path.read_text())
    db.run("CREATE TABLE leaderboard_mock_marker(key text PRIMARY KEY, value text NOT NULL); INSERT INTO leaderboard_mock_marker VALUES ('purpose','synthetic-only');")

def seed(db, args):
    db.check_marker()
    # Fixed namespace, additive only. Reruns must use a fresh database. Never delete
    # production-like history or truncate existing tables to make a fixture fit.
    metadata = f"""
    BEGIN;
    SET LOCAL app.tenant_bypass='true';
    INSERT INTO datasets(id,name,slug,wow_version,default_flavor) VALUES ('{DATASET}','Synthetic Vanilla','lbmock-vanilla','1.12.1',ARRAY['vanilla']);
    INSERT INTO tenants(id,slug,name,discoverable,default_dataset_id) VALUES ('{TENANT}','lbmock','Synthetic leaderboard preview',true,'{DATASET}');
    INSERT INTO wow_servers(id,name,tenant_id) VALUES ('{SERVER}','Synthetic server','{TENANT}');
    INSERT INTO wow_server_realms(id,server_id,name) VALUES ('{REALM}','{SERVER}','Synthetic realm');
    COMMIT;
    """
    db.run(metadata)
    db.run(f"""BEGIN; SET LOCAL app.tenant_bypass='true';
    INSERT INTO game_players(id,realm_id,name,class,gender,race)
    SELECT '0x'||lpad(to_hex(n),16,'0'),'{REALM}','Synthetic player '||lpad(n::text,7,'0'),'MAGE','Male','Human' FROM generate_series(1,{args.subjects}) n;
    INSERT INTO guilds(id,realm_id,name)
    SELECT md5('guild-'||n)::uuid,'{REALM}','Synthetic guild '||lpad(n::text,7,'0') FROM generate_series(1,{max(1,args.subjects//40)}) n;
    COMMIT;""")
    # Run mix informs only the choice of several hot instances, not subject or
    # history cardinality. These numbers are independently configurable fiction.
    names = [args.instance]
    if args.profile == "mixed": names += ["Onyxia's Lair", "Blackwing Lair", "Naxxramas", "Zul'Gurub"]
    for index, instance in enumerate(dict.fromkeys(names)):
        count = max(1, int(args.subjects / (1 + index * args.skew)))
        boss_rows = db.run("SELECT encounter_name FROM leaderboard_bosses WHERE instance_name=" + literal(instance) + " ORDER BY encounter_name;").splitlines()
        if not boss_rows: raise ValueError("Unknown fixture instance: " + instance)
        for cohort in range(args.cohorts):
            spec = "Synthetic" + str(cohort)
            for boss_index, boss in enumerate(boss_rows):
                common = f"'{TENANT}',{literal(instance)},'',0,{literal(boss)},'MAGE',{literal(spec)},'','dps'"
                # Peak remains <= the shared benchmark. Coverage is deterministic
                # per boss/subject, so selected missing bosses genuinely contribute zero.
                db.run(f"""BEGIN; SET LOCAL app.tenant_bypass='true';
                INSERT INTO leaderboard_player_boss_benchmarks(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,best_metric,projection_version,algorithm_version)
                VALUES ({common},10000,1,1);
                INSERT INTO leaderboard_player_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,player_class,player_spec,player_sub_spec,metric,realm_id,player_guid,observation_count,raw_peak,raw_form,raw_floor,projection_version,algorithm_version)
                SELECT {common},'{REALM}',('0x'||lpad(to_hex(n),16,'0')),{args.history},
                 10000 * power(n::float8/{count},{args.skew}),
                 CASE WHEN {args.history}>1 THEN 8000 * power(n::float8/{count},{args.skew}) ELSE 0 END,
                 CASE WHEN {args.history}>2 THEN 5000 * power(n::float8/{count},{args.skew}) ELSE 0 END,1,1
                FROM generate_series(1,{count}) n WHERE (n * 37 + {boss_index} * 17) % 100 < {args.coverage};
                COMMIT;""")
                if cohort == 0:
                    db.run(f"""BEGIN; SET LOCAL app.tenant_bypass='true';
                    INSERT INTO leaderboard_player_renown_counts(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,player_guid,kill_count,projection_version,algorithm_version)
                    SELECT '{TENANT}',{literal(instance)},'',0,{literal(boss)},'{REALM}',('0x'||lpad(to_hex(n),16,'0')),{args.history},1,1
                    FROM generate_series(1,{count}) n WHERE (n*37+{boss_index}*17)%100 < {args.coverage}; COMMIT;""")
            # Guild data uses the same configurable synthetic distribution and
            # reciprocal means, not reciprocal arithmetic-mean durations.
        for boss in boss_rows:
            db.run(f"""BEGIN; SET LOCAL app.tenant_bypass='true';
            INSERT INTO leaderboard_guild_boss_benchmarks(tenant_id,instance_name,difficulty_name,max_players,encounter_name,best_duration_ms,projection_version,algorithm_version)
            VALUES ('{TENANT}',{literal(instance)},'',0,{literal(boss)},100000,1,1);
            INSERT INTO leaderboard_guild_boss_subjects(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,guild_id,observation_count,fastest_duration_ms,form_mean_inverse_ms,floor_mean_inverse_ms,projection_version,algorithm_version)
            SELECT '{TENANT}',{literal(instance)},'',0,{literal(boss)},'{REALM}',md5('guild-'||n)::uuid,{args.history},100000+n*100,CASE WHEN {args.history}>1 THEN .8/(100000+n*100) ELSE 0 END,CASE WHEN {args.history}>2 THEN .5/(100000+n*100) ELSE 0 END,1,1
            FROM generate_series(1,{max(1,count//40)}) n;
            INSERT INTO leaderboard_guild_renown_counts(tenant_id,instance_name,difficulty_name,max_players,encounter_name,realm_id,guild_id,kill_count,projection_version,algorithm_version)
            SELECT '{TENANT}',{literal(instance)},'',0,{literal(boss)},'{REALM}',md5('guild-'||n)::uuid,{args.history},1,1 FROM generate_series(1,{max(1,count//40)}) n; COMMIT;""")
        db.run(f"""BEGIN; SET LOCAL app.tenant_bypass='true';
        INSERT INTO leaderboard_guild_clear_benchmarks(tenant_id,instance_name,difficulty_name,max_players,best_duration_ms,projection_version,algorithm_version) VALUES ('{TENANT}',{literal(instance)},'',0,1000000,1,1);
        INSERT INTO leaderboard_guild_clear_subjects(tenant_id,instance_name,difficulty_name,max_players,realm_id,guild_id,observation_count,fastest_duration_ms,form_mean_inverse_ms,floor_mean_inverse_ms,projection_version,algorithm_version)
        SELECT '{TENANT}',{literal(instance)},'',0,'{REALM}',md5('guild-'||n)::uuid,{args.history},1000000+n*1000,CASE WHEN {args.history}>1 THEN .8/(1000000+n*1000) ELSE 0 END,CASE WHEN {args.history}>2 THEN .5/(1000000+n*1000) ELSE 0 END,1,1 FROM generate_series(1,{max(1,count//40)}) n; COMMIT;""")
    db.run("ANALYZE;")
    actual = db.run(f"SET app.tenant_bypass='true'; SELECT count(*),sum(observation_count) FROM leaderboard_player_boss_subjects WHERE tenant_id='{TENANT}';")
    print(json.dumps({"synthetic":True,"target":db.name,"summary_rows_and_represented_history":actual,"source_scale_reference":args.source_scale,"parameters":{k:v for k,v in vars(args).items() if k!='database_url'}}, indent=2))

def bench(db, args):
    db.check_marker()
    # Benchmark the same enabled policy selection as the API, not disabled
    # catalog bosses. Synthetic tenant dataset is explicitly Vanilla.
    resolution = (ROOT / "database/queries/leaderboard_resolution.sql").read_text().strip().rstrip(';').replace('@flavors::text[]', "ARRAY['vanilla']::text[]")
    predicate = "kind='boss'" if args.kind=='renown' or args.boss else "kind='member' AND set_key='default'"
    bosses = db.run("WITH resolved AS ("+resolution+") SELECT encounter_name FROM resolved WHERE "+predicate+" AND instance_name="+literal(args.instance)+" ORDER BY encounter_name;").splitlines()
    if args.boss and args.boss not in bosses and args.instance != "Test raid": raise ValueError("Boss is not enabled by the resolved fixture policy")
    if args.boss: bosses = [args.boss]
    if args.instance == "Test raid" and not args.boss: bosses = ["Boss A", "Boss B"]
    # Harness awards are explicit synthetic values. API reads instead use the real
    # resolver. This isolates SQL plan measurement from configuration latency.
    params = dict(has_cursor=False, after_score=0, after_realm="00000000-0000-0000-0000-000000000000", after_subject="", after_class="", after_spec="", after_sub_spec="", page_size=51,
        subject_kind=args.subject,board_kind=args.kind,tenant_id=TENANT,instance_name=args.instance,
        difficulty_name="",max_players=0,realm_filter="00000000-0000-0000-0000-000000000000",search=args.search,bosses=bosses,
        player_class=args.player_class,player_spec=args.spec,player_sub_spec="",filter_sub_spec=False,metric="dps",awards=[100]*len(bosses),denominator=len(bosses) if args.kind=='boss' else 1,score_metric=args.score)
    if args.cursor_subject:
        params.update(has_cursor=True,after_score=args.cursor_score,after_realm=REALM,after_subject=args.cursor_subject,after_class=args.cursor_class,after_spec=args.cursor_spec,after_sub_spec=args.cursor_sub_spec)
    sql = query_sql(params)
    runs=[]
    for _ in range(args.repeats):
        start=time.perf_counter()
        plan=json.loads(db.run(f"SET app.tenant_id='{TENANT}'; EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql))[0]
        runs.append({"wall_ms":(time.perf_counter()-start)*1000,"execution_ms":plan['Execution Time'],"plan":plan})
    sizes=db.run("SELECT relname,pg_total_relation_size(relid),pg_relation_size(relid),pg_indexes_size(relid) FROM pg_catalog.pg_statio_user_tables WHERE relname LIKE 'leaderboard_%' ORDER BY relname;")
    output={"synthetic":True,"target":db.name,"query_parameters":params,"query_sha256":hashlib.sha256(sql.encode()).hexdigest(),"first_ms":runs[0]['execution_ms'],"warm_median_ms":statistics.median(r['execution_ms'] for r in runs[1:] or runs),"under_200ms":all(r['execution_ms']<200 for r in runs),"cache_note":"First run is not guaranteed cold; no shared-cache eviction. psql wall includes process and connection overhead, not API latency.","sizes_table_total_heap_indexes":sizes,"runs":runs}
    Path(args.output).write_text(json.dumps(output,indent=2))
    print(json.dumps({k:v for k,v in output.items() if k not in ('runs','sizes_table_total_heap_indexes')},indent=2))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database-url',required=True)
    p.add_argument('--allow-local-writes',action='store_true',help='Required for initialization/seeding; never inferred from environment')
    p.add_argument('--prepare-migrated',action='store_true',help='Mark an already migrated dedicated mock dev database; requires write approval')
    p.add_argument('--init',action='store_true',help='Initialize EMPTY mock database from dump and configuration seeds')
    p.add_argument('action',choices=['seed','fixture','bench'])
    p.add_argument('--subjects',type=int,default=10000)
    p.add_argument('--cohorts',type=int,default=4)
    p.add_argument('--history',type=int,default=44)
    p.add_argument('--coverage',type=int,default=80)
    p.add_argument('--skew',type=float,default=1.5)
    p.add_argument('--source-scale',type=int,default=2200000,help='Reported source-row reference, NOT a claimed count of seeded observations')
    p.add_argument('--profile',choices=['hot','mixed'],default='hot')
    p.add_argument('--instance',default='Molten Core')
    p.add_argument('--subject',choices=['player','guild'],default='player')
    p.add_argument('--kind',choices=['boss','clear','renown'],default='boss')
    p.add_argument('--score',choices=['peak','mastery','renown'],default='mastery')
    p.add_argument('--boss',default='')
    p.add_argument('--search',default='')
    p.add_argument('--spec',default='',help='Optional exact spec; default ranks all independently normalized cohorts')
    p.add_argument('--class',dest='player_class',default='')
    p.add_argument('--cursor-class',default='')
    p.add_argument('--cursor-spec',default='')
    p.add_argument('--cursor-sub-spec',default='')
    p.add_argument('--cursor-subject',default='')
    p.add_argument('--cursor-score',type=float,default=50)
    p.add_argument('--repeats',type=int,default=6)
    p.add_argument('--output',default='/tmp/leaderboard-benchmark.json')
    args=p.parse_args()
    if min(args.subjects,args.cohorts,args.history,args.repeats)<1 or not 0<=args.coverage<=100 or not 0<args.skew<=10: p.error('Invalid synthetic distribution bounds')
    if (args.init or args.prepare_migrated or args.action in ('seed','fixture')) and not args.allow_local_writes: p.error('Explicit --allow-local-writes required')
    if args.action=='bench' and ((args.kind=='renown') != (args.score=='renown') or (args.kind=='clear' and args.subject!='guild')): p.error('Invalid benchmark board/score combination')
    db=Database(args.database_url)
    if args.init and args.prepare_migrated: p.error('Choose init OR prepare-migrated')
    if args.init: initialize(db)
    if args.prepare_migrated:
        db.run("SELECT 1 FROM leaderboard_player_boss_subjects LIMIT 0; CREATE TABLE leaderboard_mock_marker(key text PRIMARY KEY, value text NOT NULL); INSERT INTO leaderboard_mock_marker VALUES ('purpose','synthetic-only');")
    if args.action=='seed': seed(db,args)
    elif args.action=='fixture':
        db.check_marker()
        db.run("BEGIN;" + (ROOT / "internal/leaderboardread/testdata/read_fixture.sql").read_text() + "COMMIT;")
        print("Hand-check fixture loaded. Player Test raid/Frost/DPS, Boss A+B: Bob Peak90 Mastery71; Alice Peak50 Mastery40 in each of two realms. Renown awards10/0: Alice30. Guild boss Mastery19.5 across two bosses; clear39.")
    else: bench(db,args)

if __name__=='__main__': main()
