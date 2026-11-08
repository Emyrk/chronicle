// Next invokes this once per server instance, including standalone server.js.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startOgMetrics } = await import('./app/lib/og-metrics');
    try {
      await startOgMetrics();
    } catch (error) {
      // Next can log a rejected register hook without exiting its HTTP process.
      // Never leave a seemingly healthy renderer with broken metrics startup.
      console.error('OG metrics startup failed', error);
      process.exit(1);
    }
  }
}
