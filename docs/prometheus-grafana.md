# Prometheus metrics and Grafana dashboards

Chronicle exposes application, parser, queue, cache, authentication, and leader-election metrics for Prometheus. This guide is written for operators building Grafana dashboards and alerts.

## Enable the metrics listener

Prometheus uses a separate HTTP listener from the Chronicle application server. Enable it with:

```text
CHRONICLE_PROMETHEUS_ENABLED=true
CHRONICLE_PROMETHEUS_ADDRESS=0.0.0.0:9091
```

The default address is `0.0.0.0:9091`. A normal Prometheus target uses the `/metrics` path on that listener. Chronicle does not expose `/metrics` on the main application listener, which normally uses port `4000`.

Protect the listener with one or both of:

```text
CHRONICLE_PROMETHEUS_SHARED_KEY=<bearer-token>
CHRONICLE_PROMETHEUS_IP_ALLOW=10.0.0.10,10.0.0.11
```

When both are configured, both checks must pass. The IP allowlist accepts exact IPv4 or IPv6 addresses, not CIDR ranges. Forwarded client IPs are trusted only when Chronicle's direct peer is a private or loopback reverse proxy.

A Prometheus scrape job using bearer authentication can look like:

```yaml
scrape_configs:
  - job_name: chronicle
    metrics_path: /metrics
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/secrets/chronicle-metrics-token
    static_configs:
      - targets:
          - chronicle:9091
```

Do not expose the metrics listener directly to the public internet. Bind it to a private network, firewall it, or put an authenticated reverse proxy in front of it.

## Reading Chronicle metrics

All Chronicle-defined metric names start with `chronicle_`.

Counters ending in `_total` should normally be graphed with `rate()` or `increase()`. Gauges are current values. Histograms produce `_bucket`, `_sum`, and `_count` series and can be converted into percentiles with `histogram_quantile()`.

The examples below use `$__rate_interval`, Grafana's rate window derived from the panel range and Prometheus scrape interval. A fixed interval such as `[5m]` or `[15m]` is also valid.

For multiple Chronicle replicas, use the labels supplied by your Prometheus service discovery, such as `instance`, `pod`, or `deployment`, when you need per-replica results. Service-wide aggregation depends on whether the metric is process-local or database-global, as described below.

The River queue depth and oldest-job-age gauges are database-global values collected by every Chronicle replica. When several replicas are scraped, use `max` across replicas for those metrics instead of `sum`, which would count the same database rows more than once. River execution counters and histograms are local to the worker process and should be summed across replicas. Configured worker capacity is also per process and should be summed for fleet-wide capacity.

## Included Grafana dashboard

Chronicle includes an importable dashboard at [`docs/grafana/chronicle-operations.json`](grafana/chronicle-operations.json). It covers API traffic, parser outcomes and bottlenecks, River queues, cache behavior, authentication, and leader election.

See [`docs/grafana/README.md`](grafana/README.md) for import and file-provisioning instructions.

## Suggested dashboard variables

Useful Grafana variables include:

| Variable | Query |
| --- | --- |
| `$instance` | `label_values(chronicle_api_concurrent_requests, instance)` |
| `$queue` | `label_values(chronicle_river_configured_workers, queue)` |
| `$kind` | `label_values(chronicle_river_jobs_total{queue=~"$queue"}, kind)` |
| `$route` | `label_values(chronicle_api_requests_processed_total, path)` |
| `$cache` | `label_values(chronicle_cache_capacity, cache)` |
| `$dataset` | `label_values(chronicle_cache_hits_total{cache=~"$cache"}, dataset)` |

The exact infrastructure labels available alongside Chronicle's labels depend on the Prometheus deployment.

## Recommended dashboard layout

A useful top-level dashboard answers these questions:

1. Is Chronicle reachable and serving traffic?
2. Are API latency or concurrency increasing?
3. Are parsing jobs succeeding, and how long do they take?
4. Is a River queue building a backlog?
5. Are workers saturated, waiting on PostgreSQL, or spending time in application code?
6. Which parser stage or consumer is the bottleneck?
7. Are caches effective and within capacity?
8. Does the expected replica hold each leader-election lock?

The sections below provide panels and alert candidates for each area.

## Service availability and API traffic

### Is Prometheus successfully scraping Chronicle?

Prometheus automatically adds the `up` metric for every target:

```promql
up{job="chronicle"}
```

Alert when it is zero for longer than the deployment's normal restart window.

### Requests per second

```promql
sum by (method) (
  rate(chronicle_api_requests_processed_total[$__rate_interval])
)
```

Break traffic down by route:

```promql
sum by (method, path) (
  rate(chronicle_api_requests_processed_total[$__rate_interval])
)
```

The `path` label is the chi route pattern, such as `/api/v1/.../{id}`, rather than the raw request URL. This keeps route cardinality bounded.

### Current concurrent requests

```promql
sum(chronicle_api_concurrent_requests)
```

Per replica:

```promql
chronicle_api_concurrent_requests
```

A sustained increase usually means requests are arriving faster than they complete. Compare it with request latency and PostgreSQL health.

### API latency percentiles

Service-wide p50, p95, and p99:

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(chronicle_api_request_latencies_seconds_bucket[$__rate_interval])
  )
)
```

Slowest route patterns by p95:

```promql
histogram_quantile(
  0.95,
  sum by (le, method, path) (
    rate(chronicle_api_request_latencies_seconds_bucket[$__rate_interval])
  )
)
```

Grafana can display the second query as a table sorted descending.

### API alert ideas

- **Scrape unavailable:** `up{job="chronicle"} == 0` for 5 minutes.
- **High p95 latency:** p95 above the deployment's user-facing latency SLO for 10 to 15 minutes.
- **Concurrency growth:** concurrent requests above a known safe baseline while p95 latency is also elevated.

Chronicle's API metrics do not currently include HTTP status code labels. They cannot directly answer HTTP 4xx or 5xx error-rate questions. Use reverse-proxy metrics, logs, or tracing for status-code alerts.

## Log parsing

The `chronicle_logparse_*` metrics describe the `log-parse` worker itself. Use them when the question is specifically about combat-log parsing rather than all River jobs.

### Are parse jobs succeeding?

Parse completions by result:

```promql
sum by (result) (
  rate(chronicle_logparse_jobs_total[$__rate_interval])
)
```

Result values are:

- `success`: the parse completed.
- `failure`: an error was returned and River may retry it.
- `cancelled`: the job was rejected or cancelled as a permanent outcome.

Failure ratio:

```promql
sum(rate(chronicle_logparse_jobs_total{result="failure"}[$__rate_interval]))
/
clamp_min(sum(rate(chronicle_logparse_jobs_total[$__rate_interval])), 0.000001)
```

Cancellation ratio:

```promql
sum(rate(chronicle_logparse_jobs_total{result="cancelled"}[$__rate_interval]))
/
clamp_min(sum(rate(chronicle_logparse_jobs_total[$__rate_interval])), 0.000001)
```

Treat failures and cancellations separately. Failures usually indicate an operational or software problem. Cancellations can also represent invalid or unsupported input.

### How long does a complete parse take?

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(chronicle_logparse_job_duration_seconds_bucket[$__rate_interval])
  )
)
```

Use p50, p95, and p99 panels. Average duration is also useful when traffic is low:

```promql
sum(rate(chronicle_logparse_job_duration_seconds_sum[$__rate_interval]))
/
clamp_min(sum(rate(chronicle_logparse_job_duration_seconds_count[$__rate_interval])), 0.000001)
```

### Which parse stage is slow?

Chronicle exposes these stage histograms:

- `chronicle_logparse_load_file_duration_seconds`
- `chronicle_logparse_parse_duration_seconds`
- `chronicle_logparse_finalize_duration_seconds`
- `chronicle_logparse_db_insert_duration_seconds`

A Grafana panel can graph the average duration of every stage:

```promql
sum(rate(chronicle_logparse_load_file_duration_seconds_sum[$__rate_interval]))
/
clamp_min(sum(rate(chronicle_logparse_load_file_duration_seconds_count[$__rate_interval])), 0.000001)
```

Create one query per stage and give each query a short legend such as `load`, `parse`, `finalize`, and `database`.

Interpretation:

| Dominant stage | Likely area to investigate |
| --- | --- |
| File loading | Object storage, network throughput, decompression, or large uploads |
| Parsing | CPU, log size, parser format, or event-consumer work |
| Finalization | Encounter detection and per-instance aggregation |
| Database insertion | PostgreSQL latency, connection pressure, locks, indexes, or large transactions |

Stage histograms record total stage time for a job. A job can contain more than one instance, so stage values are not per-instance latency.

### Which parser consumer is the bottleneck?

```promql
histogram_quantile(
  0.95,
  sum by (le, consumer) (
    rate(chronicle_logparse_consumer_duration_seconds_bucket[$__rate_interval])
  )
)
```

Use a table or time series sorted by value. The `consumer` label contains code-defined parser and consumer timing names. It does not contain user, log, player, or ability identifiers.

### Parsing throughput

Lines processed per second:

```promql
sum(rate(chronicle_logparse_lines_processed_total[$__rate_interval]))
```

Parsed instances and successfully persisted encounters per hour:

```promql
sum(increase(chronicle_logparse_instances_parsed_total[1h]))
```

```promql
sum(increase(chronicle_logparse_encounters_parsed_total[1h]))
```

Average lines per successful parse:

```promql
sum(rate(chronicle_logparse_lines_processed_total[$__rate_interval]))
/
clamp_min(sum(rate(chronicle_logparse_jobs_total{result="success"}[$__rate_interval])), 0.000001)
```

### Are jobs partially succeeding?

Some instances can fail finalization or validation while the overall parse job continues:

```promql
sum(increase(chronicle_logparse_instance_failures_total[1h]))
```

A nonzero value deserves investigation even if `chronicle_logparse_jobs_total{result="success"}` remains healthy.

### Parsing alert ideas

- **Parse failures:** one or more failures over 15 minutes, or a sustained failure ratio above the accepted baseline.
- **Partial instance failures:** any increase in `chronicle_logparse_instance_failures_total` over 15 minutes.
- **Parse latency:** p95 total duration above the expected upload-to-result SLO.
- **Database bottleneck:** database insertion p95 above its baseline, especially when queue depth also grows.
- **Parser regression:** parsing or consumer p95 rises after a deploy while input throughput remains comparable.

Avoid alerting only on low throughput. Chronicle may legitimately receive no uploads for long periods.

## River queues and workers

River runs Chronicle's background jobs. Queue metrics answer whether work is waiting, running, retrying, or stuck.

Common configured queues include:

- `default`
- `log-parsing`
- `discord-sync`
- `discord-announcements`
- `retention`
- `rankings`

Deployments may disable optional workers, and new releases may add queues or job kinds. Discover current values with the Grafana `$queue` and `$kind` variables rather than hard-coding every possibility.

Active River states exposed by the queue collector are:

- `available`: ready for a worker.
- `pending`: inserted but not yet made available.
- `retryable`: failed and awaiting another attempt.
- `running`: currently executing.
- `scheduled`: intentionally waiting for a future time.

Terminal completed, cancelled, and discarded jobs are not included in `chronicle_river_queue_jobs`. Their executions are represented by `chronicle_river_jobs_total`.

### How large is each backlog?

```promql
sum by (queue) (
  max by (queue, state) (
    chronicle_river_queue_jobs{
      state=~"available|pending|retryable"
    }
  )
)
```

Scheduled work is often expected, so graph it separately:

```promql
max by (queue) (
  chronicle_river_queue_jobs{state="scheduled"}
)
```

Stacked queue-state panel:

```promql
max by (queue, state) (
  chronicle_river_queue_jobs
)
```

### How old is the oldest active job?

```promql
max by (queue) (
  chronicle_river_queue_oldest_job_age_seconds{
    state=~"available|pending|retryable"
  }
)
```

This metric is based on the job's `created_at` timestamp. It is job age, not the exact amount of time spent in the current state. For scheduled jobs, it includes time since creation rather than time overdue. Use the queue-wait histogram for measured wait time of jobs that actually started.

### Are workers saturated?

```promql
max by (queue) (
  chronicle_river_queue_jobs{state="running"}
)
/
clamp_min(
  sum by (queue) (
    chronicle_river_configured_workers
  ),
  1
)
```

A value near `1` means all configured worker slots are busy. Saturation is not an incident by itself. Alert when it is sustained and backlog or oldest-job age is also growing.

Configured worker capacity:

```promql
chronicle_river_configured_workers
```

The parsing queue's capacity is controlled by `CHRONICLE_LOG_PARSING_WORKERS`.

### How long do jobs wait and run?

Queue-wait p95:

```promql
histogram_quantile(
  0.95,
  sum by (le, queue, kind) (
    rate(chronicle_river_job_queue_wait_duration_seconds_bucket[$__rate_interval])
  )
)
```

Worker execution p95:

```promql
histogram_quantile(
  0.95,
  sum by (le, queue, kind) (
    rate(chronicle_river_job_run_duration_seconds_bucket[$__rate_interval])
  )
)
```

Result-persistence p95:

```promql
histogram_quantile(
  0.95,
  sum by (le, queue, kind) (
    rate(chronicle_river_job_complete_duration_seconds_bucket[$__rate_interval])
  )
)
```

Interpretation:

- High queue wait with normal run time indicates insufficient worker capacity or a bursty backlog.
- Normal queue wait with high run time indicates slow worker logic or downstream dependencies.
- High complete duration indicates River is slow to persist job results, usually pointing at PostgreSQL.

### Are jobs completing or retrying?

```promql
sum by (queue, kind, result) (
  rate(chronicle_river_jobs_total[$__rate_interval])
)
```

Result values are `completed`, `cancelled`, `snoozed`, `retryable`, and `discarded`.

Retry and discard counts:

```promql
sum by (queue, kind, result) (
  increase(chronicle_river_jobs_total{result=~"retryable|discarded"}[15m])
)
```

A retryable event records a failed execution attempt, not necessarily a permanently failed job. A discarded event means River exhausted or rejected further attempts.

### Is River fetching work efficiently?

Fetch latency p95:

```promql
histogram_quantile(
  0.95,
  sum by (le, queue) (
    rate(chronicle_river_job_fetch_duration_seconds_bucket[$__rate_interval])
  )
)
```

Jobs fetched per second:

```promql
sum by (queue) (
  rate(chronicle_river_jobs_fetched_total[$__rate_interval])
)
```

Fetch latency measures River's PostgreSQL query and lock path. High fetch latency together with high result-completion or parser database time strongly suggests database pressure.

### Did queue-state collection fail?

```promql
increase(chronicle_river_queue_metrics_collection_failures_total[10m])
```

The queue-depth collector queries PostgreSQL during a scrape with a short timeout. On failure, it omits queue-state samples for that scrape and increments this counter. Alert on any sustained increase because backlog dashboards may otherwise look empty.

### River alert ideas

- **Backlog growing:** available, pending, and retryable jobs above an established threshold for 10 minutes.
- **Oldest job too old:** oldest active job age above the queue's completion SLO.
- **Retry storm:** retryable execution rate or retryable queue depth above baseline.
- **Permanent job loss:** any discarded jobs for critical kinds.
- **Worker saturation:** running workers equal configured workers while backlog remains nonzero.
- **Database pressure:** fetch or result-completion p95 elevated across several queues.
- **Collector failure:** queue metric collection failures increase over 10 minutes.

Use different thresholds by queue. A five-minute parse backlog may be important, while scheduled retention work can wait much longer.

## Caches

Chronicle exposes metrics for its in-process LRU caches.

Known cache names include:

- `spells`
- `talents`
- `items_id`
- `items_name`
- `creatures`
- `extra_attacks`
- `duration_mods`
- `periodic_spells`
- `gear_trends`

New releases may add caches.

### Cache hit ratio

By cache:

```promql
sum by (cache) (
  rate(chronicle_cache_hits_total[$__rate_interval])
)
/
clamp_min(
  sum by (cache) (rate(chronicle_cache_hits_total[$__rate_interval]))
  +
  sum by (cache) (rate(chronicle_cache_misses_total[$__rate_interval])),
  0.000001
)
```

By cache and dataset:

```promql
sum by (cache, dataset) (
  rate(chronicle_cache_hits_total[$__rate_interval])
)
/
clamp_min(
  sum by (cache, dataset) (rate(chronicle_cache_hits_total[$__rate_interval]))
  +
  sum by (cache, dataset) (rate(chronicle_cache_misses_total[$__rate_interval])),
  0.000001
)
```

The `dataset` label is an empty string for caches without a dataset dimension. Game-data caches use dataset UUIDs.

### Cache utilization

```promql
sum by (cache) (chronicle_cache_entries)
/
sum by (cache) (chronicle_cache_capacity)
```

Entries by dataset:

```promql
chronicle_cache_dataset_entries{cache=~"$cache"}
```

A cache at capacity is not automatically unhealthy. LRU caches are expected to evict. Combine utilization with hit ratio and downstream latency.

The overall `chronicle_cache_entries` gauge is refreshed when Chronicle adds, removes, or purges cache entries. A TTL expiration can briefly leave that gauge stale until the next cache mutation. Per-dataset entry counts are adjusted by the eviction callback.

### Cache alert ideas

Cache hit ratio is usually better as a dashboard and regression signal than a paging alert. Consider an alert only when a sustained hit-ratio drop correlates with database latency, queue run time, or API latency.

Aggregate by `cache` for alerts to avoid one alert per dataset.

## Authentication activity

Session creation activity:

```promql
sum(delta(chronicle_api_auth_create_session_count[$__rate_interval]))
```

Session validation attempts by validity:

```promql
sum by (valid) (
  delta(chronicle_api_auth_validate_session_count[$__rate_interval])
)
```

Invalid validation ratio:

```promql
sum(delta(chronicle_api_auth_validate_session_count{valid="false"}[$__rate_interval]))
/
clamp_min(sum(delta(chronicle_api_auth_validate_session_count[$__rate_interval])), 0.000001)
```

These two metrics have count semantics but are currently implemented as Prometheus gauges. They increase during a process lifetime and reset on restart. Use `delta()` for visualization, tolerate negative restart windows, and do not treat them as durable audit totals.

A sudden invalid-validation spike can indicate expired clients, malformed tokens, clock problems, or unwanted traffic. Correlate it with application logs before paging.

## Leader election

Leader-election metrics currently cover the Discord gateway election when the Discord bot is enabled.

### Which replica is leader?

```promql
chronicle_leader_election_leader{election="discord_gateway"}
```

In a healthy multi-replica deployment, exactly one replica should normally report `1` for an enabled election:

```promql
sum(chronicle_leader_election_leader{election="discord_gateway"})
```

### Is leadership flapping or failing?

```promql
sum by (election, transition) (
  increase(chronicle_leader_election_transitions_total[1h])
)
```

```promql
sum by (election, reason) (
  increase(chronicle_leader_election_failures_total[15m])
)
```

Transition values include `acquired` and `lost`. Failure reasons include bounded values such as `acquire_connection`, `acquire_lock`, `activate`, `connection_lost`, `deactivate`, and `release_lock`.

Alerting is deployment-specific. Do not require a leader when the corresponding optional service is disabled.

## Alert rule examples

Thresholds below are starting points, not universal defaults. Tune them to upload volume, worker count, database capacity, and the response expectations for each deployment.

```yaml
groups:
  - name: chronicle
    rules:
      - alert: ChronicleMetricsTargetDown
        expr: up{job="chronicle"} == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Chronicle metrics target is unavailable

      - alert: ChronicleParseFailures
        expr: increase(chronicle_logparse_jobs_total{result="failure"}[15m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Chronicle parsing jobs are failing

      - alert: ChroniclePartialParseFailures
        expr: increase(chronicle_logparse_instance_failures_total[15m]) > 0
        labels:
          severity: warning
        annotations:
          summary: Chronicle parses contain failed instances

      - alert: ChronicleParsingBacklogOld
        expr: |
          max by (queue) (
            chronicle_river_queue_oldest_job_age_seconds{
              queue="log-parsing",
              state=~"available|pending|retryable"
            }
          ) > 900
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: Chronicle parsing backlog is older than 15 minutes

      - alert: ChronicleRiverJobsDiscarded
        expr: increase(chronicle_river_jobs_total{result="discarded"}[15m]) > 0
        labels:
          severity: warning
        annotations:
          summary: Chronicle background jobs were permanently discarded

      - alert: ChronicleQueueMetricsCollectionFailing
        expr: increase(chronicle_river_queue_metrics_collection_failures_total[10m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Chronicle cannot collect River queue state
```

For low-traffic deployments, count-based alerts are often more reliable than ratios. A ratio can become noisy when only one or two jobs run in the alert window.

## Metric reference

### API

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_api_requests_processed_total` | Counter | `method`, `path` | API requests whose handler returned |
| `chronicle_api_concurrent_requests` | Gauge | none | API requests currently executing |
| `chronicle_api_request_latencies_seconds` | Histogram | `method`, `path` | End-to-end API handler latency |

### Authentication

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_api_auth_create_session_count` | Gauge | none | Sessions created since process start |
| `chronicle_api_auth_validate_session_count` | Gauge | `valid` | Session validation attempts since process start |

### Log parsing

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_logparse_jobs_total` | Counter | `result` | Parse job outcomes |
| `chronicle_logparse_job_duration_seconds` | Histogram | none | Total parse worker duration |
| `chronicle_logparse_lines_processed_total` | Counter | none | Combat-log lines processed |
| `chronicle_logparse_instances_parsed_total` | Counter | none | Instances parsed |
| `chronicle_logparse_encounters_parsed_total` | Counter | none | Encounters parsed |
| `chronicle_logparse_instance_failures_total` | Counter | none | Instance failures that did not immediately fail the whole job |
| `chronicle_logparse_load_file_duration_seconds` | Histogram | none | File load and read time |
| `chronicle_logparse_parse_duration_seconds` | Histogram | none | Combat-log parser and event-consumption time |
| `chronicle_logparse_finalize_duration_seconds` | Histogram | none | Aggregate instance-finalization time |
| `chronicle_logparse_db_insert_duration_seconds` | Histogram | none | Aggregate parsed-data insertion time |
| `chronicle_logparse_consumer_duration_seconds` | Histogram | `consumer` | Time spent in code-defined parser and consumer stages |

### River

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_river_jobs_total` | Counter | `queue`, `kind`, `result` | River execution outcomes |
| `chronicle_river_job_queue_wait_duration_seconds` | Histogram | `queue`, `kind` | Time jobs waited before execution |
| `chronicle_river_job_run_duration_seconds` | Histogram | `queue`, `kind` | Worker execution time |
| `chronicle_river_job_complete_duration_seconds` | Histogram | `queue`, `kind` | Time to persist an execution result |
| `chronicle_river_job_fetch_duration_seconds` | Histogram | `queue` | Time to fetch and lock jobs |
| `chronicle_river_jobs_fetched_total` | Counter | `queue` | Jobs fetched and locked |
| `chronicle_river_configured_workers` | Gauge | `queue` | Maximum configured workers |
| `chronicle_river_queue_jobs` | Gauge | `queue`, `state` | Current jobs in active states |
| `chronicle_river_queue_oldest_job_age_seconds` | Gauge | `queue`, `state` | Age of the oldest job in each active state |
| `chronicle_river_queue_metrics_collection_failures_total` | Counter | none | Queue-state collector failures |

### Caches

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_cache_hits_total` | Counter | `cache`, `dataset` | Successful LRU lookups |
| `chronicle_cache_misses_total` | Counter | `cache`, `dataset` | Failed LRU lookups |
| `chronicle_cache_entries` | Gauge | `cache` | Current cache entries |
| `chronicle_cache_dataset_entries` | Gauge | `cache`, `dataset` | Current entries by dataset |
| `chronicle_cache_capacity` | Gauge | `cache` | Configured maximum entries |

### Leader election

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `chronicle_leader_election_leader` | Gauge | `election` | Whether this replica holds the lock |
| `chronicle_leader_election_transitions_total` | Counter | `election`, `transition` | Leadership acquired and lost events |
| `chronicle_leader_election_failures_total` | Counter | `election`, `reason` | Election operation failures |

## Metrics not currently exposed

The dedicated Chronicle registry does not currently register the Go runtime or process collectors. Metrics such as `go_goroutines`, `process_cpu_seconds_total`, and `process_resident_memory_bytes` are not available from this endpoint.

The PostgreSQL pubsub implementation defines internal metrics, but its collector is not currently registered with the production Prometheus registry. Do not build dashboards or alerts around `chronicle_pubsub_*` until that wiring is added.

Chronicle also does not currently export PostgreSQL pool utilization, SQL query duration, HTTP response status, object-storage operation latency, or SpiceDB request metrics. Use PostgreSQL, reverse-proxy, object-storage, and SpiceDB exporters where available.

## Cardinality guidance

Chronicle intentionally avoids log IDs, instance IDs, user IDs, player names, and upload file names in metric labels.

The labels most likely to grow are:

- `path`, as API routes are added.
- `kind`, as River job types are added.
- `consumer`, as parser stages are added.
- `dataset`, because game-data cache metrics use dataset UUIDs.

Do not copy these labels into new recording rules unnecessarily. For service-level alerts, aggregate away `path`, `kind`, `consumer`, and `dataset` unless the alert specifically needs that dimension.
