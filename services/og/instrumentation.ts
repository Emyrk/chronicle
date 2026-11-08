// Next invokes this once per server instance, including standalone server.js.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startOgMetrics } = await import('./app/lib/og-metrics');
    await startOgMetrics();
  }
}
