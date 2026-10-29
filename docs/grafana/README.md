# Chronicle Grafana dashboards

Chronicle includes two ready-to-import dashboards for its Prometheus metrics:

- `chronicle-operations.json` covers service health and background processing.
- `chronicle-http-traffic.json` investigates HTTP request volume, rate, and latency by route template and method.

The operations dashboard includes rows for:

- Service availability and API latency
- Combat-log parsing health and throughput
- Parser stage and consumer bottlenecks
- River queue depth, job age, saturation, retries, and durations
- Cache effectiveness and capacity
- Billing reconciliation and Stripe entitlement synchronization
- Authentication activity and leader election

Both dashboards target Grafana 10 or newer and use only built-in panels.

## Import through the Grafana UI

1. Open **Dashboards > New > Import**.
2. Upload one of the dashboard JSON files or paste its contents.
3. Open the imported dashboard.
4. Select the Prometheus datasource that scrapes Chronicle.
5. Select the appropriate **Prometheus job** variable.

The dashboard UIDs are `chronicle-operations` and `chronicle-http-traffic`. Importing a newer version with the same UID updates the corresponding existing dashboard.

## File provisioning

Copy one or both dashboard JSON files into a directory visible to Grafana, for example:

```text
/etc/grafana/provisioning/dashboards/chronicle/chronicle-operations.json
/etc/grafana/provisioning/dashboards/chronicle/chronicle-http-traffic.json
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
      - ./deploy/grafana/chronicle.yml:/etc/grafana/provisioning/dashboards/chronicle.yml:ro
```

The provider YAML is intentionally an example rather than a tracked deployment file because Grafana paths, organizations, and folder policy vary between installations.

## HTTP traffic dashboard

`chronicle-http-traffic.json` helps identify route and method combinations receiving unusually high traffic. It includes request totals for the selected time range, current request rates, traffic trends, and route latency comparisons.

The `path` label contains the matched chi route template, such as `/api/v1/instances/{id}`, rather than the raw URL. This keeps Prometheus label cardinality bounded and groups requests for different resource IDs into the same route.

The current HTTP metrics do not include response status, client IP, user ID, or raw URL labels. The dashboard can show which route templates are receiving traffic, but it cannot identify the caller or separate successful requests from errors.

## Variables

| Variable | Purpose |
| --- | --- |
| `datasource` | Prometheus datasource containing Chronicle metrics |
| `job` | One Prometheus scrape job, usually one Chronicle deployment or environment |
| `instance` | Chronicle replicas used by process-local panels |
| `method` | HTTP methods on the traffic dashboard |
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
