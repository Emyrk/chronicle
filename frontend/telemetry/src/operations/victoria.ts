import type { Env } from "../types";

export interface OperationsQueue {
  name: string;
  ready: number;
  running: number;
  retry: number;
  oldestAgeSeconds: number;
}

export interface OperationsInstance {
  name: string;
  count: number;
}

export interface DeviceOperations {
  status: "healthy" | "degraded" | "down";
  healthyReplicas: number;
  totalReplicas: number;
  requests24h: number;
  requestsChangePercent: number | null;
  apiP95Ms: number;
  backlog: number;
  oldestJobAgeSeconds: number;
  parseFailures24h: number;
  encounters24h: number;
  parsingSuccessPercent: number;
  billingAgeSeconds: number;
  billingCustomersFound: number;
  billingCustomersSynced: number;
  billingErrors: number;
  leaderOk: boolean;
  gcBacklog: number;
  requestTrend7d: number[];
  parsing: {
    instances24h: number;
    lines24h: number;
    p95Ms: number;
    encountersChangePercent: number | null;
    dailyEncounters7d: number[];
    topInstances: OperationsInstance[];
  };
  jobs: {
    completed24h: number;
    cancelled24h: number;
    configuredWorkers: number;
    workerUtilizationPercent: number;
    collectorErrors24h: number;
    queues: OperationsQueue[];
  };
}

interface PrometheusVectorSample {
  metric: Record<string, string>;
  value: [number, string];
}

interface PrometheusMatrixSample {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

let cachedIngressSession: { value: string; expiresAt: number } | undefined;

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function websocketUrl(homeAssistantUrl: string): string {
  const url = new URL(homeAssistantUrl);
  url.pathname = "/api/websocket";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function waitForMessage(socket: WebSocket, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Home Assistant WebSocket timed out"));
    }, timeoutMs);
    const onMessage = (event: MessageEvent) => {
      cleanup();
      try {
        resolve(JSON.parse(String(event.data)));
      } catch {
        reject(new Error("Home Assistant returned invalid WebSocket JSON"));
      }
    };
    const onClose = () => {
      cleanup();
      reject(new Error("Home Assistant closed the WebSocket"));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Home Assistant WebSocket failed"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.removeEventListener("error", onError);
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);
    socket.addEventListener("error", onError);
  });
}

async function createIngressSession(env: Env): Promise<string> {
  const homeAssistantUrl = required(env.HOME_ASSISTANT_URL, "HOME_ASSISTANT_URL");
  const token = required(env.HOME_ASSISTANT_TOKEN, "HOME_ASSISTANT_TOKEN");
  const response = await fetch(websocketUrl(homeAssistantUrl), {
    headers: { Upgrade: "websocket" },
  });
  const socket = response.webSocket;
  if (response.status !== 101 || !socket) {
    throw new Error(`Home Assistant WebSocket returned HTTP ${response.status}`);
  }

  socket.accept();
  try {
    const requiredMessage = await waitForMessage(socket) as { type?: string };
    if (requiredMessage.type !== "auth_required") {
      throw new Error("Home Assistant did not request authentication");
    }
    socket.send(JSON.stringify({ type: "auth", access_token: token }));
    const authMessage = await waitForMessage(socket) as { type?: string };
    if (authMessage.type !== "auth_ok") {
      throw new Error("Home Assistant authentication failed");
    }

    socket.send(JSON.stringify({
      id: 1,
      type: "supervisor/api",
      endpoint: "/ingress/session",
      method: "post",
    }));
    const sessionMessage = await waitForMessage(socket) as {
      id?: number;
      success?: boolean;
      result?: { session?: string; data?: { session?: string } };
    };
    if (sessionMessage.id !== 1 || !sessionMessage.success) {
      throw new Error("Home Assistant ingress session creation failed");
    }
    const session = sessionMessage.result?.data?.session ?? sessionMessage.result?.session;
    if (!session) throw new Error("Home Assistant returned no ingress session");
    return session;
  } finally {
    socket.close(1000, "complete");
  }
}

async function ingressSession(env: Env): Promise<string> {
  if (cachedIngressSession && cachedIngressSession.expiresAt > Date.now()) {
    return cachedIngressSession.value;
  }
  const value = await createIngressSession(env);
  cachedIngressSession = { value, expiresAt: Date.now() + 10 * 60_000 };
  return value;
}

async function prometheusRequest<T>(
  env: Env,
  path: string,
  params: URLSearchParams,
  retry = true
): Promise<T> {
  const baseUrl = required(
    env.VICTORIAMETRICS_INGRESS_URL,
    "VICTORIAMETRICS_INGRESS_URL"
  );
  const session = await ingressSession(env);
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  url.search = params.toString();
  const response = await fetch(url, {
    headers: { Cookie: `ingress_session=${session}` },
  });
  if (response.status === 401 && retry) {
    cachedIngressSession = undefined;
    return prometheusRequest<T>(env, path, params, false);
  }
  if (!response.ok) {
    throw new Error(`VictoriaMetrics returned HTTP ${response.status}`);
  }
  const body = await response.json() as {
    status?: string;
    data?: { result?: T };
  };
  if (body.status !== "success" || body.data?.result === undefined) {
    throw new Error("VictoriaMetrics returned an invalid response");
  }
  return body.data.result;
}

async function instant(
  env: Env,
  query: string
): Promise<PrometheusVectorSample[]> {
  return prometheusRequest(env, "api/v1/query", new URLSearchParams({ query }));
}

async function range(
  env: Env,
  query: string,
  start: number,
  end: number,
  step: number
): Promise<PrometheusMatrixSample[]> {
  return prometheusRequest(env, "api/v1/query_range", new URLSearchParams({
    query,
    start: String(start),
    end: String(end),
    step: String(step),
  }));
}

function sampleValue(samples: PrometheusVectorSample[]): number {
  const value = Number(samples[0]?.value?.[1] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function matrixValues(samples: PrometheusMatrixSample[], points: number): number[] {
  const values = samples[0]?.values?.map((value) => Number(value[1])) ?? [];
  return values.slice(-points).map((value) => Number.isFinite(value) ? value : 0);
}

function queueName(name: string): string {
  const labels: Record<string, string> = {
    "log-parsing": "Log parsing",
    rankings: "Rankings",
    "discord-sync": "Discord sync",
    "discord-announcements": "Announcements",
    retention: "Retention",
    default: "Default",
  };
  return labels[name] ?? name;
}

async function mapInBatches<T, U>(
  values: T[],
  batchSize: number,
  mapper: (value: T) => Promise<U>
): Promise<U[]> {
  const results: U[] = [];
  for (let offset = 0; offset < values.length; offset += batchSize) {
    results.push(...await Promise.all(
      values.slice(offset, offset + batchSize).map(mapper)
    ));
  }
  return results;
}

export async function fetchDeviceOperations(env: Env): Promise<DeviceOperations> {
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  const metric = (name: string) => `${name}{job=~".+"}`;

  const queries = {
    up: `sum(up)` ,
    replicas: `count(up)`,
    requests: `sum(increase(${metric("chronicle_api_requests_processed_total")}[24h]))`,
    requestsPrevious: `sum(increase(${metric("chronicle_api_requests_processed_total")}[24h] offset 24h))`,
    apiP95: `histogram_quantile(0.95, sum by (le) (rate(${metric("chronicle_api_request_latencies_seconds_bucket")}[1h])))`,
    backlog: `sum(max by (queue, state) (chronicle_river_queue_jobs{state=~"available|pending|retryable"}))`,
    oldestJob: `max(chronicle_river_queue_oldest_job_age_seconds{state=~"available|pending|retryable"})`,
    parseFailures: `sum(increase(chronicle_logparse_jobs_total{result="failure"}[24h]))`,
    parseJobs: `sum(increase(chronicle_logparse_jobs_total[24h]))`,
    encounters: `sum(increase(chronicle_logparse_encounters_parsed_total[24h]))`,
    encountersPrevious: `sum(increase(chronicle_logparse_encounters_parsed_total[24h] offset 24h))`,
    instances: `sum(increase(chronicle_logparse_instances_parsed_total[24h]))`,
    lines: `sum(increase(chronicle_logparse_lines_processed_total[24h]))`,
    parseP95: `histogram_quantile(0.95, sum by (le) (rate(chronicle_logparse_job_duration_seconds_bucket[1h])))`,
    billingAge: `time() - max(chronicle_billing_reconciliation_last_success_timestamp_seconds)`,
    billingFound: `max(chronicle_billing_reconciliation_entitlement_customers_found)`,
    billingSynced: `max(chronicle_billing_reconciliation_entitlement_customers_synced)`,
    billingErrors: `max(chronicle_billing_reconciliation_subscription_errors) + max(chronicle_billing_reconciliation_entitlement_errors)`,
    leader: `sum(chronicle_leader_election_leader)`,
    gc: `sum(chronicle_lua_projects_artifact_gc_backlog)`,
    completed: `sum(increase(chronicle_river_jobs_total{result=~"completed|success"}[24h]))`,
    cancelled: `sum(increase(chronicle_river_jobs_total{result="cancelled"}[24h]))`,
    workers: `sum(chronicle_river_configured_workers)`,
    running: `sum(max by (queue) (chronicle_river_queue_jobs{state="running"}))`,
    collectorErrors: `sum(increase(chronicle_river_queue_metrics_collection_failures_total[24h]))`,
  };

  const entries = Object.entries(queries);
  const scalarResults = await mapInBatches(entries, 5, ([, query]) =>
    instant(env, query)
  );
  const values = Object.fromEntries(entries.map(([name], index) => [
    name,
    sampleValue(scalarResults[index]),
  ])) as Record<keyof typeof queries, number>;

  const [topInstances, queueJobs, queueAges, requestTrend, encounterTrend] = await Promise.all([
    instant(env, "topk(5, sum by (instance_name) (increase(chronicle_logparse_instance_duration_seconds_count[24h])))"),
    instant(env, "max by (queue, state) (chronicle_river_queue_jobs)"),
    instant(env, "max by (queue) (chronicle_river_queue_oldest_job_age_seconds{state=~\"available|pending|retryable\"})"),
    range(env, "sum(increase(chronicle_api_requests_processed_total[1d]))", now - 6 * day, now, day),
    range(env, "sum(increase(chronicle_logparse_encounters_parsed_total[1d]))", now - 6 * day, now, day),
  ]);

  const queues = new Map<string, OperationsQueue>();
  const getQueue = (name: string) => {
    let queue = queues.get(name);
    if (!queue) {
      queue = { name: queueName(name), ready: 0, running: 0, retry: 0, oldestAgeSeconds: 0 };
      queues.set(name, queue);
    }
    return queue;
  };
  for (const sample of queueJobs) {
    const queue = getQueue(sample.metric.queue ?? "unknown");
    const value = Math.round(Number(sample.value[1]) || 0);
    if (sample.metric.state === "running") queue.running += value;
    else if (sample.metric.state === "retryable") queue.retry += value;
    else if (sample.metric.state === "available" || sample.metric.state === "pending") {
      queue.ready += value;
    }
  }
  for (const sample of queueAges) {
    getQueue(sample.metric.queue ?? "unknown").oldestAgeSeconds =
      Math.round(Number(sample.value[1]) || 0);
  }

  const parseSuccess = values.parseJobs <= 0
    ? 100
    : Math.max(0, 100 * (values.parseJobs - values.parseFailures) / values.parseJobs);
  const status = values.up < values.replicas || values.up === 0
    ? "down"
    : values.backlog > 20 || values.parseFailures > 10 || values.billingErrors > 0
      ? "degraded"
      : "healthy";

  return {
    status,
    healthyReplicas: Math.round(values.up),
    totalReplicas: Math.round(values.replicas),
    requests24h: Math.round(values.requests),
    requestsChangePercent: percentChange(values.requests, values.requestsPrevious),
    apiP95Ms: Math.round(values.apiP95 * 1000),
    backlog: Math.round(values.backlog),
    oldestJobAgeSeconds: Math.round(values.oldestJob),
    parseFailures24h: Math.round(values.parseFailures),
    encounters24h: Math.round(values.encounters),
    parsingSuccessPercent: parseSuccess,
    billingAgeSeconds: Math.round(values.billingAge),
    billingCustomersFound: Math.round(values.billingFound),
    billingCustomersSynced: Math.round(values.billingSynced),
    billingErrors: Math.round(values.billingErrors),
    leaderOk: values.leader >= 1,
    gcBacklog: Math.round(values.gc),
    requestTrend7d: matrixValues(requestTrend, 7).map(Math.round),
    parsing: {
      instances24h: Math.round(values.instances),
      lines24h: Math.round(values.lines),
      p95Ms: Math.round(values.parseP95 * 1000),
      encountersChangePercent: percentChange(values.encounters, values.encountersPrevious),
      dailyEncounters7d: matrixValues(encounterTrend, 7).map(Math.round),
      topInstances: topInstances.slice(0, 5).map((sample) => ({
        name: sample.metric.instance_name ?? "Unknown",
        count: Math.round(Number(sample.value[1]) || 0),
      })),
    },
    jobs: {
      completed24h: Math.round(values.completed),
      cancelled24h: Math.round(values.cancelled),
      configuredWorkers: Math.round(values.workers),
      workerUtilizationPercent: values.workers <= 0 ? 0 : 100 * values.running / values.workers,
      collectorErrors24h: Math.round(values.collectorErrors),
      queues: [...queues.values()].sort((a, b) =>
        (b.retry + b.ready + b.running) - (a.retry + a.ready + a.running)
      ).slice(0, 6),
    },
  };
}
