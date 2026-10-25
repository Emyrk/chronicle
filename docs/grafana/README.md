# Chronicle Grafana dashboard

`chronicle-operations.json` is a ready-to-import operational dashboard for Chronicle's Prometheus metrics.

It includes rows for:

- Service availability and API latency
- Combat-log parsing health and throughput
- Parser stage and consumer bottlenecks
- River queue depth, job age, saturation, retries, and durations
- Cache effectiveness and capacity
- Billing reconciliation and Stripe entitlement synchronization
- Authentication activity and leader election

The dashboard targets Grafana 10 or newer and uses only built-in panels.

## Import through the Grafana UI

1. Open **Dashboards > New > Import**.
2. Upload `chronicle-operations.json` or paste its contents.
3. Open the imported dashboard.
4. Select the Prometheus datasource that scrapes Chronicle.
5. Select the appropriate **Prometheus job** variable.

The dashboard UID is `chronicle-operations`. Importing a newer version with the same UID updates the existing dashboard.

## File provisioning

Copy the dashboard JSON into a directory visible to Grafana, for example:

```text
/etc/grafana/provisioning/dashboards/chronicle/chronicle-operations.json
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
      - ./deploy/grafana/chronicle.yml:/etc/grafana/provisioning/dashboards/chronicle.yml:ro
```

The provider YAML is intentionally an example rather than a tracked deployment file because Grafana paths, organizations, and folder policy vary between installations.

## Variables

| Variable | Purpose |
| --- | --- |
| `datasource` | Prometheus datasource containing Chronicle metrics |
| `job` | One Prometheus scrape job, usually one Chronicle deployment or environment |
| `instance` | Chronicle replicas used by process-local panels |
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

## Metric availability

Panels can show **No data** until the corresponding subsystem has emitted a sample. Examples include parser histograms before the first upload, leader-election metrics when the Discord bot is disabled, and dataset cache metrics before game data is requested.

Chronicle does not currently expose HTTP status-code, Go runtime, process, PostgreSQL pool, object-storage, SpiceDB, or pubsub metrics through its dedicated registry. The dashboard intentionally does not reference those metrics.
