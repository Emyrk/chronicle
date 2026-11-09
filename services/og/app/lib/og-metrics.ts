import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { normalizeOgTheme } from './og-themes';

type Outcome = 'success' | 'failure' | 'cancelled';

export function createOgMetrics() {
  const registry = new Registry();
  const requests = new Counter({ name: 'og_render_requests_total', help: 'Completed origin render attempts.', labelNames: ['theme', 'outcome'], registers: [registry] });
  const inFlight = new Gauge({ name: 'og_render_in_flight', help: 'Origin render attempts still active.', labelNames: ['theme'], registers: [registry] });
  const preparation = new Histogram({ name: 'og_render_preparation_seconds', help: 'Time until response construction (or preparation failure).', labelNames: ['theme'], registers: [registry] });
  const duration = new Histogram({ name: 'og_render_duration_seconds', help: 'Time from request preparation through stream completion, failure or cancellation.', labelNames: ['theme', 'outcome'], registers: [registry] });
  const bytes = new Counter({ name: 'og_render_bytes_total', help: 'PNG bytes emitted by the origin stream, including partial responses.', labelNames: ['theme'], registers: [registry] });
  return { registry, requests, inFlight, preparation, duration, bytes };
}

// Next bundles instrumentation and routes separately. Module-local registries
// would silently export different counters. Share on the Node process global.
const state = globalThis as typeof globalThis & {
  __chronicleOgMetrics?: ReturnType<typeof createOgMetrics>;
  __chronicleOgMetricsServer?: Promise<Server>;
};
export function getOgMetrics() {
  return state.__chronicleOgMetrics ??= createOgMetrics();
}

export function createOgMetricsServer(token: string, metrics = getOgMetrics()): Server {
  const expected = Buffer.from(`Bearer ${token}`);
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url !== '/metrics' || req.method !== 'GET') { res.writeHead(404).end(); return; }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      res.writeHead(401).end(); return;
    }
    try {
      const body = await metrics.registry.metrics();
      res.writeHead(200, { 'Content-Type': metrics.registry.contentType }).end(body);
    } catch { res.writeHead(500).end(); }
  });
}

export async function startOgMetrics(env: Record<string, string | undefined> = process.env): Promise<Server | undefined> {
  if (env.OG_METRICS_ENABLED !== 'true') return;
  const token = env.OG_METRICS_TOKEN;
  if (!token || token === env.OG_SIGNING_KEY) throw new Error('OG_METRICS_TOKEN must be set and distinct from OG_SIGNING_KEY');
  const port = Number(env.OG_METRICS_PORT ?? '9091');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === Number(env.PORT ?? '3000')) {
    throw new Error('OG_METRICS_PORT must be a valid separate port');
  }
  return state.__chronicleOgMetricsServer ??= new Promise<Server>((resolve, reject) => {
    const server = createOgMetricsServer(token);
    server.once('error', reject);
    server.once('close', () => { state.__chronicleOgMetricsServer = undefined; });
    server.listen(port, env.OG_METRICS_HOST ?? '127.0.0.1', () => {
      server.unref(); // Next owns process shutdown; this listener must not keep it alive.
      resolve(server);
    });
  });
}

export async function measureOgRender(
  themeName: string,
  prepare: () => Promise<Response>,
  signal?: AbortSignal,
  metrics = getOgMetrics(),
): Promise<Response> {
  const theme = normalizeOgTheme(themeName);
  const start = performance.now();
  let finished = false;
  let prepared = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const elapsed = () => (performance.now() - start) / 1000;
  const finish = (outcome: Outcome) => {
    if (finished) return;
    finished = true;
    signal?.removeEventListener('abort', abort);
    if (!prepared) metrics.preparation.observe({ theme }, elapsed());
    metrics.requests.inc({ theme, outcome });
    metrics.duration.observe({ theme, outcome }, elapsed());
    metrics.inFlight.dec({ theme });
  };
  const abort = () => {
    finish('cancelled');
    controller?.error(new Error('Render cancelled'));
    void reader?.cancel().catch(() => {});
  };
  metrics.inFlight.inc({ theme });
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await prepare();
    if (finished) {
      await response.body?.cancel();
      throw new Error('Render cancelled');
    }
    metrics.preparation.observe({ theme }, elapsed());
    prepared = true;
    if (!response.body) { finish('success'); return response; }
    reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      start(value) { controller = value; },
      async pull(output) {
        try {
          const chunk = await reader!.read();
          if (finished) return;
          if (chunk.done) { finish('success'); output.close(); }
          else { metrics.bytes.inc({ theme }, chunk.value.byteLength); output.enqueue(chunk.value); }
        } catch (error) {
          if (!finished) { finish('failure'); output.error(error); }
        }
      },
      async cancel(reason) { finish('cancelled'); await reader!.cancel(reason); },
    }, { highWaterMark: 0 });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) { finish('failure'); throw error; }
}
