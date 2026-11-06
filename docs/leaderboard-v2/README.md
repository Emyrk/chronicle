# Leaderboard v2

Status: implementation contract

This directory defines Chronicle's replacement rating and leaderboard system.
The [LaTeX specification](spec.tex) is the authoritative mathematical and
physical model. [Behavior](behavior.md) translates that model into observable
requirements. The [implementation plan](implementation-plan.md) defines the
intended Graphite stack and validation gates.

The replacement is a clean implementation. Existing rating projections,
generations, windows, workers, and formulas are not migration inputs. Build the
new schema alongside the legacy subsystem, preserve legacy reads for rollback
through verification, then remove legacy code and tables in the final stack PR.

## Authority

When documents disagree, use this order:

1. [`spec.tex`](spec.tex)
2. [`behavior.md`](behavior.md)
3. [`implementation-plan.md`](implementation-plan.md)
4. Existing rating documents and implementation

The following documents describe earlier explorations or the subsystem being
replaced:

- [`docs/mastery-renown-rating.md`](../mastery-renown-rating.md)
- [`docs/incremental-tenant-ratings-rollout.md`](../incremental-tenant-ratings-rollout.md)
- [`docs/tenant-ratings-catchup-design.md`](../tenant-ratings-catchup-design.md)
- [`docs/renown-fact-repair.md`](../renown-fact-repair.md)

They remain useful historical context, but they are not contracts for
leaderboard v2.

## Fixed decisions

- Store all-time results only.
- Project raw `encounter_dps_rankings.dps` and `.hps`,
  `time_parse_boss_scores.duration_ms`, and
  `time_parse_scores.clear_duration_ms` from canonical runs.
- Do not consume persisted precise/display scores, ranks, statuses, windows, or
  policy versions as rating inputs.
- Resolve one exact non-null tenant from each run's realm and never copy rating
  data into a second tenant.
- Resolve rules from the canonical union of the dataset flavor and tenant
  flavors.
- Store one global current ruleset per canonical flavor set, updated in place.
- Store one moving raw-metric benchmark per complete cohort.
- Store boss and clear subject results. Derive normalized Peak from the current
  benchmark at read time.
- Recalculate instance, portfolio, and arbitrary boss-group Peak and Mastery at
  read time. Do not materialize aggregate result rows initially.
- Use ordered cursor browsing. Exact rank and arbitrary numbered pages are not
  required.
- Keep serving old values while dirty work converges. Reads never filter by
  ruleset revision or dirty state.
- Perform rating derivation and dirty maintenance in bounded PostgreSQL
  functions. Go schedules those functions and serves their results; it does not
  calculate ratings.
- Apply a sliding 30-minute debounce only to upload-driven dirty runs. Repair,
  benchmark, subject, Renown, tenant, flavor, and ruleset work is due
  immediately. An hourly scheduler is acceptable initially, producing normal
  upload convergence in roughly 30 to 90 minutes.

## Package boundary

New application code belongs in:

```text
internal/services/serviceratings/
```

That package owns scheduling, API/query orchestration, cursor handling, logging,
and metrics. PostgreSQL owns observation replacement, benchmark calculation,
Mastery, Renown, dirty fan-out, and compare-and-swap acknowledgement.
