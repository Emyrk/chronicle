# Local leaderboard read fixtures

This is a **synthetic, local-only** tool. It does not connect to production, read
production environment variables, populate production evidence, or implement
D1/D2 workers. It seeds summaries directly so read experiments do not require
millions of raw observations.

## Target safeguards

Every invocation requires `--database-url`. Only numeric loopback hosts
`127.0.0.1` and `::1`, an explicit port/user, and a database named
`chronicle_lbmock_<suffix>` are accepted. Connection query parameters and libpq
environment defaults are rejected/removed. Writes additionally require
`--allow-local-writes`. Seeding and benchmarking require a `synthetic-only`
marker. No cleanup, truncate, database drop, or overwrite operation is provided.
Use a fresh dedicated database for each distribution. Never point this tool at a
port forwarding production, even if a database has an allowed name.

Create a disposable PostgreSQL 17 database, for example:

```sh
docker run --name chronicle-lbmock --rm -d \
  -e POSTGRES_PASSWORD=local-only -e POSTGRES_DB=chronicle_lbmock_hot \
  -p 127.0.0.1:55439:5432 postgres:17

python3 scripts/leaderboardmock/mock.py \
  --database-url postgresql://postgres:local-only@127.0.0.1:55439/chronicle_lbmock_hot \
  --init --allow-local-writes seed \
  --subjects 10000 --cohorts 4 --history 44 --coverage 80 --skew 1.5
```

`--init` requires an empty database and installs the checked-in schema dump plus
configuration seeds 342/343. This is for standalone SQL benchmarks, not a full
application bootstrap. For UI experiments, first initialize a **dedicated mock
application database** with Chronicle's normal migrations, then use
`--prepare-migrated --allow-local-writes seed` instead. Configure the dev server
explicitly to use that same database and visit its `lbmock` tenant host at
`/leaderboards-v2`. The fixture creates that tenant, a Vanilla dataset, realm,
players, guilds, summaries, and benchmarks. Authentication and other dev services
remain the normal application setup; this script does not configure them.

## Distribution controls

- `--subjects`: unique players in the hottest instance, independently tunable.
- `--cohorts`: exact synthetic MAGE specs, each independently scored.
- `--history`: positive observation/kill count per summary. Bands are deterministic
  plausible raw sufficient statistics; no claim of replayed evidence is made.
- `--coverage`: deterministic percentage of subject/boss pairs populated.
- `--skew`: score distribution exponent and instance falloff.
- `--profile hot|mixed`: one hot instance or multiple qualitatively skewed
  Vanilla instances. `--instance` chooses the hottest instance.
- `--source-scale`: a reported reference only (default 2.2m). It **does not**
  silently choose subjects or create that many observations.

The measured production source context supplied during development was roughly
2.1m estimated source rows (a separately supplied exact count was 2,194,669),
9,770 canonical runs, and a Vanilla-heavy run mix. The small sampled source groups
are not full histories or cohort sizes. Therefore **subjects, histories,
coverage, cohorts, and score distributions remain synthetic parameters**.
Mixed-profile weights are qualitative stress choices, not EDR row weights or
statistical estimates from the run mix.

10k subjects × 4 cohorts × 13 catalog bosses × 80% coverage yields 416k player
summary rows. 50k subjects yields 2.08m summary rows. These summaries represent
many more historical observations when multiplied by `--history`. They are not
intended as an estimate of production summary cardinality.

## Hand-check fixture

On a fresh marked mock database:

```sh
python3 scripts/leaderboardmock/mock.py --database-url "$MOCK_DB" \
  --init --allow-local-writes fixture
```

The same SQL fixture is exercised by `go test ./internal/leaderboardread`:

- Player Boss A+B: Bob Peak 90, Mastery 71.
- Alice has only Boss A, so Peak 50, Mastery 40, separately in two realms.
- Awards 10/0 and counts 3/7 produce Renown 30, not 100; another variant's 100
  kills never contribute.
- Guild reciprocal statistics produce boss-group Mastery 19.5 and clear Mastery
  39. Reciprocal means are not reciprocal mean durations.
- Changing only player benchmarks from 100 to 200 halves all derived bands.

The hand-check instance is a SQL fixture, not a new production catalog entry.

## Benchmark the actual application SQL

```sh
python3 scripts/leaderboardmock/mock.py --database-url "$MOCK_DB" bench \
  --instance 'Molten Core' --subject player --kind boss --score mastery \
  --repeats 6 --output /tmp/leaderboard-benchmark.json
```

Use `--boss`, `--search`, `--spec`, `--cursor-subject`, and `--cursor-score` to
change query shape. `--subject guild --kind clear --score peak` exercises clear
reads; `--kind renown --score renown` exercises count/award reads. The harness
uses synthetic awards of 100 to measure SQL. The API uses the actual shared
configuration resolver and never the harness award values.

Output includes exact SQL parameters, every JSON `EXPLAIN (ANALYZE, BUFFERS)`,
execution and wall latency, and heap/index/total relation sizes. The first read
is **not guaranteed cold**: initialization and prior reads warm caches. No OS or
shared-buffer cache eviction is performed. `psql` wall time includes process and
connection startup, not API/configuration/network latency. Index-only results
also depend on vacuum/visibility-map state; do not extrapolate them to recently
mutated tables without remeasurement.

Safety tests: `python3 -m unittest discover -s scripts/leaderboardmock -p 'test_*.py'`.
