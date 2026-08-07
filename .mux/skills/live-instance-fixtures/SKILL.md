---
name: live-instance-fixtures
description: Fetches, inspects, and promotes Chronicle combat-log fixtures from live instance slugs or URLs. Use when debugging an EventsPanel with real instance data, building regression fixtures, updating shared Go and TypeScript role-inference cases, or handling files under scripts/fetch-fixtures and EventsPanels/__fixtures__.
metadata:
  type: workflow
  binding: advisory
---

# Live instance fixtures

Use live Chronicle data for local diagnosis without committing private raid data. Promote only the smallest deterministic case needed for a permanent regression test.

## Quick start

```bash
# One instance, damage stream only.
./scripts/fetch-fixtures/fetch-fixtures.sh INSTANCE_SLUG

# Several instances listed one per line. Blank lines and # comments are allowed.
./scripts/fetch-fixtures/fetch-fixtures.sh -f instance-slugs.txt

# Fetch the streams needed by the processor under investigation.
./scripts/fetch-fixtures/fetch-fixtures.sh \
  -s damage,heal,cast,aura \
  INSTANCE_SLUG

# Fetch from a local Chronicle server.
./scripts/fetch-fixtures/fetch-fixtures.sh \
  -b http://localhost:4000 \
  INSTANCE_SLUG
```

The command accepts a bare slug, an `/instances/{slug}` URL, or an instance API URL. Read `scripts/fetch-fixtures/README.md` for all flags and accepted forms.

## Workflow

### 1. Define the question

Write the expected behavior before fetching data. Include:

- Instance and encounter
- Player or entity involved
- Panel or algorithm under test
- Expected result
- Current incorrect result

For role inference, record the expected tanks and whether each tank handled the boss, adds, or a swap interval.

### 2. Fetch only required streams

Start with the streams declared by the processor. Do not fetch every stream by default.

Common mappings:

| Investigation | Streams |
|---|---|
| Tank role inference | `damage` |
| Healing role inference | `heal`, plus any stream used for absorbs |
| Death attribution | `damage,heal,slain` |
| Rotations | `cast,aura` |

Fetched files live under:

```text
scripts/fetch-fixtures/data/{slug}/
├── instance.json
├── {stream}.bin
└── manifest.json
```

This directory is gitignored. Never remove that ignore rule or force-add its contents.

### 3. Reproduce in the site

Open the same slug against the environment being tested:

```text
/instances/{slug}?panels=roles
```

Select the relevant encounter before reading panel evidence. For the Roles panel, expand **Detection thresholds** and **Tank evidence**. Capture the score, strongest hostile source, attempts, source maximum, and final classification.

Do not infer a parser bug from the UI alone. Confirm whether the raw event stream contains the expected event type and normalized fields.

### 4. Locate the failing layer

Check layers in this order:

1. **Raw parser message**: did the log line become the expected Go message?
2. **Serialized event**: did protobuf conversion preserve source, target, spell ID, hit type, and amount?
3. **Frontend decoder**: did the binary stream decode to the same fields?
4. **Processor extraction**: did the worker include or reject the event correctly?
5. **Pure inference**: did identical counts produce identical Go and TypeScript results?
6. **Presentation**: did the panel display the returned evidence correctly?

For tank inference, `docs/tank-role-inference.md` is the algorithm contract.

### 5. Choose the fixture level

Use the narrowest fixture that reproduces the defect:

| Fixture type | Location | Use |
|---|---|---|
| Shared pure-algorithm JSON | `testdata/roleinfer/cases.json` | Go and TypeScript scoring parity |
| Frontend processor unit event | Adjacent `*.processor.test.ts` | Filtering and event aggregation |
| Frontend binary panel fixture | `EventsPanels/__fixtures__/` | Decoder, worker, or rendered panel behavior |
| Raw Go combat log | Package-local `testdata/` | Parser or tracker behavior |

Do not copy an entire live instance into committed test data when a small synthetic event or count map proves the behavior.

### 6. Sanitize before promotion

Before committing a fixture derived from live data:

- Replace player names and GUIDs with stable synthetic values.
- Remove guild names, realm-specific metadata, timestamps, and unrelated encounters.
- Keep only events required to reproduce the failure.
- Preserve semantic fields such as event ordering, source identity, hit type, amount, and encounter boundaries.
- Document what was transformed and what behavior the fixture protects.

If faithful anonymization would invalidate the case, stop and ask before committing live data.

### 7. Add the regression test

For tank inference changes:

1. Add or update a case in `testdata/roleinfer/cases.json` when the scoring contract changes.
2. Ensure both `internal/roleinfer/roleinfer_test.go` and `tankInference.test.ts` consume the case.
3. Add extraction tests separately when the bug is in Go tracking or the TypeScript processor.
4. Increment `AlgorithmVersion` in Go and TypeScript when formula, constants, aggregation, or accepted event semantics change.

Do not put raw binary data into the shared pure-algorithm fixture.

### 8. Validate

Run the narrow checks first, then the affected build:

```bash
bash scripts/fetch-fixtures/fetch-fixtures_test.sh

go test ./internal/roleinfer \
  ./internal/wowspec \
  ./combatlog/parser/common/instances/rankings

cd frontend/chronicle
pnpm test -- tankInference.test.ts tankAttempts.processor.test.ts
pnpm exec tsc --noEmit --project tsconfig.app.json
pnpm build
```

If parser or API behavior changed, run `go test ./...`. If a panel fixture changed, run its component tests as well.

## Gotchas

- The event endpoint accepts an instance UUID or slug through the same route.
- Event files are gzip-compressed protobuf streams, not JSON.
- Go must count zero-damage Auto Attack attempts before effective-damage filtering.
- Frontend Auto Attacks are identified by spell ID `6603` or normalized source name `Auto Attack`.
- A fetched fixture is exploratory evidence, not automatically a safe committed fixture.
- Do not edit generated protobuf or generated API type files by hand.
- Re-fetching overwrites the local slug directory. Preserve analysis notes elsewhere before re-fetching.

## Self-check

- [ ] The expected behavior was written before changing code.
- [ ] Only necessary streams were fetched.
- [ ] The failure was located at a specific parser, serialization, decoder, processor, inference, or UI layer.
- [ ] No live fixture data is staged by Git.
- [ ] The committed fixture is minimal and anonymized.
- [ ] Go and TypeScript parity fixtures agree when the algorithm changed.
- [ ] Targeted tests, typecheck, and affected builds pass.
