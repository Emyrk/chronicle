import { afterEach, expect, test, vi } from 'vitest';
import { createOgMetrics, getOgMetrics, measureOgRender, startOgMetrics } from '../../app/lib/og-metrics';

afterEach(() => vi.restoreAllMocks());

async function values(metrics: ReturnType<typeof createOgMetrics>, name: string) {
  return (await metrics.registry.getSingleMetric(name)!.get()).values;
}

test('disabled listener and invalid configuration fail closed', async () => {
  expect(await startOgMetrics({})).toBeUndefined();
  await expect(startOgMetrics({ OG_METRICS_ENABLED: 'true' })).rejects.toThrow('TOKEN');
  await expect(startOgMetrics({ OG_METRICS_ENABLED: 'true', OG_METRICS_TOKEN: 'same', OG_SIGNING_KEY: 'same' })).rejects.toThrow('distinct');
  await expect(startOgMetrics({ OG_METRICS_ENABLED: 'true', OG_METRICS_TOKEN: 'test', OG_METRICS_PORT: '3000' })).rejects.toThrow('separate');
});

test('separately loaded bundles share the process registry', async () => {
  const original = getOgMetrics();
  vi.resetModules();
  const reloaded = await import('../../app/lib/og-metrics');
  expect(reloaded.getOgMetrics()).toBe(original);
});

test.each(['success', 'failure', 'cancelled'] as const)('stream %s balances counters and gauges', async outcome => {
  const metrics = createOgMetrics();
  const cancel = vi.fn();
  let reads = 0;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(new Uint8Array([1, 2, 3]));
      else if (outcome === 'failure') controller.error(new Error('lazy render failure'));
      else controller.close();
    }, cancel,
  }, { highWaterMark: 0 });
  const response = await measureOgRender('arbitrary-user-input', async () => new Response(source), undefined, metrics);
  expect((await values(metrics, 'og_render_in_flight'))[0].value).toBe(1);
  const reader = response.body!.getReader();
  expect((await reader.read()).value).toEqual(new Uint8Array([1, 2, 3]));
  if (outcome === 'cancelled') { await reader.cancel(); expect(cancel).toHaveBeenCalledOnce(); }
  else if (outcome === 'failure') await expect(reader.read()).rejects.toThrow('lazy render failure');
  else expect((await reader.read()).done).toBe(true);
  expect(await values(metrics, 'og_render_requests_total')).toEqual([{ value: 1, labels: { theme: 'brand', outcome } }]);
  expect((await values(metrics, 'og_render_in_flight'))[0].value).toBe(0);
  expect((await values(metrics, 'og_render_bytes_total'))[0].value).toBe(3);
});

test('preparation failure is recorded once', async () => {
  const metrics = createOgMetrics();
  await expect(measureOgRender('raid', async () => { throw new Error('fonts'); }, undefined, metrics)).rejects.toThrow('fonts');
  expect((await values(metrics, 'og_render_in_flight'))[0].value).toBe(0);
  expect((await values(metrics, 'og_render_requests_total'))[0]).toEqual({ value: 1, labels: { theme: 'raid', outcome: 'failure' } });
});

test('abort while reading cancels upstream and counts only once', async () => {
  const metrics = createOgMetrics();
  const abort = new AbortController();
  const cancelled = vi.fn();
  const response = await measureOgRender('guild', async () => new Response(new ReadableStream({ cancel: cancelled })), abort.signal, metrics);
  const read = response.body!.getReader().read();
  abort.abort();
  await expect(read).rejects.toThrow('cancelled');
  expect(cancelled).toHaveBeenCalledOnce();
  expect((await values(metrics, 'og_render_in_flight'))[0].value).toBe(0);
  expect((await values(metrics, 'og_render_requests_total'))[0].labels.outcome).toBe('cancelled');
});

test('private listener authenticates and exports only its registry', async () => {
  const { createOgMetricsServer } = await import('../../app/lib/og-metrics');
  const { once } = await import('node:events');
  const metrics = createOgMetrics();
  const server = createOgMetricsServer('test-private-token', metrics);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address() as import('node:net').AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    expect((await fetch(url + '/metrics')).status).toBe(401);
    expect((await fetch(url + '/metrics', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
    const headers = { Authorization: 'Bearer test-private-token' };
    expect((await fetch(url + '/elsewhere', { headers })).status).toBe(404);
    expect((await fetch(url + '/metrics', { headers, method: 'POST' })).status).toBe(404);
    const rendered = await measureOgRender('raid', async () => new Response(new Uint8Array([1])), undefined, metrics);
    await rendered.arrayBuffer();
    const scrape = await fetch(url + '/metrics', { headers });
    expect(scrape.status).toBe(200);
    expect(scrape.headers.get('cache-control')).toBe('no-store');
    expect(await scrape.text()).toContain('og_render_requests_total{theme="raid",outcome="success"} 1');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('preparation and lazy stream durations are distinct', async () => {
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const metrics = createOgMetrics();
  const response = await measureOgRender('clear', async () => {
    now = 1000;
    return new Response(new Uint8Array([1]));
  }, undefined, metrics);
  expect(await values(metrics, 'og_render_requests_total')).toEqual([]);
  now = 4000;
  await response.arrayBuffer();
  const scrape = await metrics.registry.metrics();
  expect(scrape).toContain('og_render_preparation_seconds_sum{theme="clear"} 1\n');
  expect(scrape).toContain('og_render_duration_seconds_sum{theme="clear",outcome="success"} 4\n');
});
