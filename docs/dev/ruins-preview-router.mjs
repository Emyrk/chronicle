// Dev-only split router for the Ruins of Lordaeron local preview
// (docs/dev/ruins-preview-runbook.md). Not part of the product.
//
//   node ruins-preview-router.mjs   # listens on :4999
//
// Log/instance/auth endpoints go to the local backend (:4000, which holds the
// uploaded run); everything else (game data, icons, site-config) goes to prod
// Forever with browser-looking headers, because the local DB has no game data.
import http from "node:http";
import https from "node:https";

const PORT = Number(process.env.ROUTER_PORT || 4999);
const LOCAL = { host: "127.0.0.1", port: 4000 };
const PROD = "forever.chronicleclassic.com";
const VITE_ORIGIN = process.env.VITE_ORIGIN || "http://localhost:5175";

const LOCAL_PREFIXES = [
  "/api/v1/raidlogs/logs",
  "/api/v1/raidlogs/instances",
  "/auth/",
];
const isLocal = (path) => LOCAL_PREFIXES.some((p) => path.startsWith(p));

function forward(req, res, { mod, options, rewrite }) {
  const up = mod.request(options, (upRes) => {
    const headers = { ...upRes.headers };
    delete headers["content-length"];
    delete headers["content-encoding"];
    delete headers["transfer-encoding"];
    const chunks = [];
    upRes.on("data", (c) => chunks.push(c));
    upRes.on("end", () => {
      let body = Buffer.concat(chunks);
      if (rewrite) body = rewrite(body, upRes);
      headers["content-length"] = body.length;
      res.writeHead(upRes.statusCode, headers);
      res.end(body);
    });
  });
  up.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}

http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  const base = { path: req.url, method: req.method };
  if (isLocal(path)) {
    const headers = { ...req.headers, host: "localhost:4000", origin: "http://localhost:4000", "sec-fetch-site": "same-origin", "accept-encoding": "identity" };
    console.log("LOCAL", req.method, req.url);
    return forward(req, res, { mod: http, options: { ...base, ...LOCAL, headers } });
  }
  const headers = {
    ...req.headers,
    host: PROD,
    origin: `https://${PROD}`,
    referer: `https://${PROD}/`,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "accept-encoding": "identity",
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  delete headers.cookie;
  const rewrite = path === "/api/v1/site-config"
    ? (body) => {
        // The uploaded run is untenanted locally; null the tenant so the
        // instance page's tenant gate treats it as the same site.
        const cfg = JSON.parse(body.toString());
        cfg.access_url = VITE_ORIGIN;
        cfg.tenant = null;
        return Buffer.from(JSON.stringify(cfg));
      }
    : undefined;
  console.log("PROD ", req.method, req.url);
  forward(req, res, { mod: https, options: { ...base, host: PROD, port: 443, headers }, rewrite });
}).listen(PORT, () => console.log(`router :${PORT} -> local :4000 (raidlogs/auth) | https://${PROD}`));
