# Chronicle Grafana dashboards

Chronicle includes four ready-to-import dashboards for its Prometheus metrics:

- `chronicle-operations.json` covers service health and background processing.
- `chronicle-http-traffic.json` investigates HTTP request volume, rate, and latency by route template and method.
- `chronicle-external-api.json` measures external developer API usage, call volume over time, endpoint popularity, request rate, and latency.
- `chronicle-discord-http.json` attributes outbound Discord traffic, errors, rate limits, and latency to bounded logical sources.

The operations dashboard includes rows for:

- Service availability and API latency
- Combat-log parsing health and throughput
- Parser stage and consumer bottlenecks
- River queue depth, job age, saturation, retries, and durations
- Cache effectiveness and capacity
- Billing reconciliation and Stripe entitlement synchronization
- Authentication and account activity, filterable by tenant
- UI panel views, explicit panel choices, and preset popularity, filterable by tenant
- Instance-search outcomes, latency, estimated cost, and predicate-field usage
- Sidekick heartbeat health, online installations, uploads, and configuration updates
- Tenant rating rebuild duration, leaderboard v2 dirty queues (including totals by tenant slug) and repair processing, and the Lua artifact garbage-collection backlog
- Leader election

All dashboards target Grafana 10 or newer and use only built-in panels.

## Import through the Grafana UI

1. Open **Dashboards > New > Import**.
2. Upload one of the dashboard JSON files or paste its contents.
3. Open the imported dashboard.
4. Select the Prometheus datasource that scrapes Chronicle.
5. Select the appropriate **Prometheus job** variable.

The dashboard UIDs are `chronicle-operations`, `chronicle-http-traffic`, `chronicle-external-api`, and `chronicle-discord-http`. Importing a newer version with the same UID updates the corresponding existing dashboard.

## File provisioning

Copy one or more dashboard JSON files into a directory visible to Grafana, for example:

```text
/etc/grafana/provisioning/dashboards/chronicle/chronicle-operations.json
/etc/grafana/provisioning/dashboards/chronicle/chronicle-http-traffic.json
/etc/grafana/provisioning/dashboards/chronicle/chronicle-external-api.json
/etc/grafana/provisioning/dashboards/chronicle/chronicle-discord-http.json
```

Create a dashboard provider such as `/etc/grafana/provisioning/dashboards/chronicle.yml`:

```yaml
apiVersion: 1

providers:
  - name: Chronicle
    orgId: 1
    folder: Chronicle
    type: file
    disableDeletion: false
    allowUiUpdates: true
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards/chronicle
      foldersFromFilesStructure: false
```

Then restart Grafana or wait for the configured update interval.

A Docker Compose service can mount the files read-only:

```yaml
services:
  grafana:
    volumes:
      - ./docs/grafana/chronicle-operations.json:/etc/grafana/provisioning/dashboards/chronicle/chronicle-operations.json:ro
      - ./docs/grafana/chronicle-http-traffic.json:/etc/grafana/provisioning/dashboards/chronicle/chronicle-http-traffic.json:ro
      - ./docs/grafana/chronicle-external-api.json:/etc/grafana/provisioning/dashboards/chronicle/chronicle-external-api.json:ro
      - ./docs/grafana/chronicle-discord-http.json:/etc/grafana/provisioning/dashboards/chronicle/chronicle-discord-http.json:ro
      - ./deploy/grafana/chronicle.yml:/etc/grafana/provisioning/dashboards/chronicle.yml:ro
```

The provider YAML is intentionally an example rather than a tracked deployment file because Grafana paths, organizations, and folder policy vary between installations.

## HTTP traffic dashboard

`chronicle-http-traffic.json` helps identify route and method combinations receiving unusually high traffic. It includes request totals for the selected time range, current request rates, traffic trends, and route latency comparisons.

The `path` label contains the matched chi route template, such as `/api/v1/instances/{id}`, rather than the raw URL. This keeps Prometheus label cardinality bounded and groups requests for different resource IDs into the same route.

The current HTTP metrics do not include response status, client IP, user ID, or raw URL labels. The dashboard can show which route templates are receiving traffic, but it cannot identify the caller or separate successful requests from errors.

## External developer API dashboard

`chronicle-external-api.json` focuses the shared HTTP metrics on routes mounted under `/api/external/v1`. Its default **All** route selection includes developer-facing data and OpenAPI endpoints, but excludes `/health` so uptime probes do not inflate usage totals. Select the health route explicitly when investigating probe traffic.

The dashboard reports completed origin requests observed by Chronicle and labels each request with the tenant slug that received it (`root` for the primary site). CDN-served responses do not reach Chronicle and are not counted. The current metrics cannot identify individual callers or separate responses by status code.

## Discord HTTP dashboard

`chronicle-discord-http.json` shows every outbound request Chronicle makes to Discord, including discordgo retries and OAuth traffic. Use the `source`, `method`, and `status` variables to isolate a caller, then compare request volume, 429 responses, other errors, and latency.

The `source` label is a bounded logical operation such as `gateway`, `membership_sync`, `raid_announcement`, or `oauth_token`. It never contains user, guild, channel, message, command, or job identifiers. Requests without an explicit source appear as `unattributed`, which makes new uninstrumented call sites visible without introducing unbounded cardinality.

## Variables

| Variable | Purpose |
| --- | --- |
| `datasource` | Prometheus datasource containing Chronicle metrics |
| `job` | One Prometheus scrape job, usually one Chronicle deployment or environment |
| `instance` | Chronicle replicas used by process-local panels |
| `tenant` | Root or tenant-slug activity for HTTP, UI, and authentication panels |
| `method` | HTTP methods on traffic and Discord dashboards |
| `source` | Bounded logical callers on the Discord dashboard |
| `status` | Discord HTTP status codes or the `error` transport outcome |
| `queue` | River queues |
| `route` | API route templates |
| `cache` | In-process cache names |
| `dataset` | Game-data dataset identifiers |

Queue depth and oldest-job-age are database-global values emitted by each Chronicle replica. Dashboard queries use `max` across replicas so those values are not counted more than once. River execution metrics are process-local and are summed across selected replicas.

## Thresholds and alerts

Panel thresholds are starting points, not service-level objectives. In particular:

- API latency thresholds assume a one-second warning and two-second critical boundary.
- Parsing backlog age warns at five minutes and becomes critical at fifteen minutes.
- Worker saturation warns at 80% and becomes critical at 95%.
- Billing reconciliation age warns at 30 minutes and becomes critical at 45 minutes.
- Parser failure ratio warns at 1% and becomes critical at 5%.

Tune these values for upload volume, worker capacity, PostgreSQL performance, and the expected response time for each deployment.

The dashboard does not provision Grafana-managed alert rules. Use the Prometheus rule examples in [`docs/prometheus-grafana.md`](../prometheus-grafana.md), or translate them into the alerting system used by the deployment.

## Counter resets

Dashboard panels that summarize counters over a time range use Prometheus `increase()`. This function accounts for counters returning to zero after Chronicle deploys, process restarts, and replica replacement. UI usage panels sum the reset-adjusted increases across the selected replicas rather than reading the current counter value directly.

## Metric availability

Panels can show **No data** until the corresponding subsystem has emitted a sample. Examples include parser histograms before the first upload, search histograms before the first compiled search, Sidekick panels before an installation checks in, leader-election metrics when the Discord bot is disabled, and dataset cache metrics before game data is requested.

Chronicle does not currently expose HTTP status-code, Go runtime, process, PostgreSQL pool, object-storage, SpiceDB, or pubsub metrics through its dedicated registry. The dashboard intentionally does not reference those metrics.
