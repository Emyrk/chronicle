#!/usr/bin/env bash
# Build first: docker build -t chronicle-og services/og
set -euo pipefail
image=${1:-chronicle-og}
container=''
trap 'if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi' EXIT
for enabled in false true; do
  container=$(docker run --detach --rm \
    --env OG_API_ONLY=true --env OG_METRICS_ENABLED="$enabled" \
    --env OG_METRICS_HOST=0.0.0.0 --env OG_METRICS_TOKEN=smoke-only-token "$image")
  # Retry readiness only. Assertions below never retry failures.
  ready=false
  for attempt in {1..30}; do
    if docker exec "$container" node -e "fetch('http://127.0.0.1:3000/api/debug').then(()=>{}).catch(()=>process.exit(1))" 2>/dev/null; then
      ready=true; break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then docker logs "$container"; exit 1; fi
  docker exec -i --env TEST_METRICS_ENABLED="$enabled" "$container" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const publicURL = 'http://127.0.0.1:3000';
const privateURL = 'http://127.0.0.1:9091/metrics';
const enabled = process.env.TEST_METRICS_ENABLED === 'true';
for (const path of ['/metrics', '/api/metrics']) {
  assert.equal((await fetch(publicURL + path)).status, 404);
}
if (!enabled) {
  await assert.rejects(fetch(privateURL));
} else {
  assert.equal((await fetch(privateURL)).status, 401);
  assert.equal((await fetch(privateURL, {headers:{Authorization:'Bearer wrong'}})).status, 401);
}
const scrape = async () => {
  const response = await fetch(privateURL, {headers:{Authorization:'Bearer smoke-only-token'}});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/plain/);
  return response.text();
};
if (enabled) assert.doesNotMatch(await scrape(), /og_render_requests_total\{theme="brand",outcome="success"\}/);
const response = await fetch(publicURL + '/api/og?template=brand');
assert.equal(response.status, 200);
const png = Buffer.from(await response.arrayBuffer());
assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
if (enabled) {
  const metrics = await scrape();
  assert.match(metrics, /og_render_requests_total\{theme="brand",outcome="success"\} 1\n/);
  assert.match(metrics, /og_render_in_flight\{theme="brand"\} 0\n/);
  assert.ok(metrics.includes(`og_render_bytes_total{theme="brand"} ${png.length}\n`));
}
console.log(`Container smoke passed (metrics=${enabled})`);
JS
  docker rm -f "$container" >/dev/null
  container=''
done
