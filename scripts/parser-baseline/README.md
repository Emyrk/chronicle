# Published parser output baseline exporter

Local-only, export-only regression tooling. This command reads already-published
output; it does not parse logs, select an engine, start workers, or access object
storage. Compare outputs from separate, identically seeded fixture databases.
Matching artifacts prove equality only for their explicit field allowlists, not
arbitrary production behavior or snapshot correctness.

## Safety and prerequisites

- Use disposable, exclusively owned local PostgreSQL databases named
  `parser_baseline_*`, with this revision's schema. No production connections,
  including through loopback tunnels. Host and fallback validation permits only
  localhost, loopback addresses, and local Unix sockets.
- Explicitly set `BASELINE_DATABASE_URL`; there is no default or `DATABASE_URL`
  fallback. Nothing creates, migrates, seeds, resets, or parses your database.
- Each fixture must have been parsed with empty shared guild/player/gear tables.
  `--fresh-armory-seed` attests this historical condition; the exporter cannot
  prove it. Export rejects shared-armory rows outside the selected fixture but
  cannot establish historical provenance of all guild rows within its realm.
- Use identical input bytes, metadata, reference data, IDs, and parse flags for
  both candidates. Keep other servers/workers away from the fixture databases.
- Export requires a public, current finalized generation, the exact positive
  instance count, at least one encounter per instance, all supported event
  streams, and overview output. Empty/encounter-free and unlisted logs fail.
- Artifacts contain player names and combat data. Keep them private.

## Usage

Build from the candidate revision. For archive builds without Go VCS metadata,
set the exporter revision explicitly:

```sh
go build -ldflags "-X github.com/Emyrk/chronicle/internal/version.GitCommit=<revision>" \
  -o /tmp/parser-baseline ./scripts/parser-baseline
```

`args.json` contains exactly one JSON object with these fields:

```json
{"log_group_id":"11111111-1111-1111-1111-111111111111","parse_generation":1}
```

```sh
export BASELINE_DATABASE_URL='postgres://localhost/parser_baseline_before?sslmode=disable'
/tmp/parser-baseline export --isolated-db --fresh-armory-seed \
  --args args.json --expect-instances 1 --provenance before.export.json \
  > before.json.tmp && mv before.json.tmp before.json
# Repeat against a separately prepared candidate fixture, then:
diff -u before.json after.json
```

Always check both export exit statuses. Partial output is not evidence. Provenance
is optional, exclusive-create, and separate from comparable output. It identifies
the **exporter build and request**, not the parser build that produced the rows;
its existence records an attempt, not success. Record producing parser revisions
and fixture provenance separately. A non-Git archive reports dirty status unknown.

## Comparison contract

Export runs in one read-only, repeatable-read transaction. The artifact includes
explicit field allowlists for instances, encounters, difficulties, all 22 current
event streams, combat structure, rankings/memberships, talents, loot, overview,
speedruns, and scoped armory publication. Tables outside those allowlists are not
covered, including downstream asynchronous scoring and notification effects.

Generated identities become stable natural keys; ambiguous identities fail.
Semantic timestamps, exact numerical values, gameplay fields, event order, and
array order are preserved. Gzip streams are decoded to protobuf semantics;
malformed payloads, unknown fields, and unsupported stream types fail closed.
Generated IDs, slugs, publication wall-clock bookkeeping and explicitly omitted
fields are not compared. Complete coverage lives in the field allowlists in the
source and generated artifact, not in a general-purpose scrubber.

This exporter materializes output in memory; it is not a large-log streaming or
performance harness. Review artifact schema/allowlist changes across revisions
rather than treating an unexplained diff as a parser regression.

## Validation

With local test PostgreSQL configured using the repository's dbtestutil setup:

```sh
go test ./scripts/parser-baseline -count=1
go test -race ./scripts/parser-baseline -count=1
go build ./scripts/parser-baseline
```
