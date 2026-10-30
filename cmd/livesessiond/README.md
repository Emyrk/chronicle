# livesessiond

A dedicated, in-memory, **single-replica** WebRTC signaling process. Rooms and
join tokens are not shared across replicas and are lost on restart. Do not load
balance public WebSocket and private create/join calls across replicas.

Environment:

- `LIVESESSION_INTERNAL_SECRET` (required): shared Bearer token for the private API.
- `LIVESESSION_ALLOWED_ORIGINS` (required): comma-separated, explicit browser
  origins, e.g. `https://chronicle.example.com,https://*.chronicle.example.com`.
  No catch-all `*`. Include scheme and port when applicable.
- `CHRONICLE_ACCESS_URL` (required): base URL of the main Chronicle site,
  used to build the share link in the create response.
- `LIVESESSION_PUBLIC_ADDR` (default `:8080`): public listener, expose only
  `/healthz` and `GET /api/v1/live-sessions/{code}/ws?token=...`.
- `LIVESESSION_PRIVATE_ADDR` (default `127.0.0.1:8081`): private listener,
  bind to the backend-reachable private interface. Never publish it publicly.

The backend calls `POST /internal/live-sessions` with the JSON
`CreateLiveSessionRequest` (`instance_id`, optional `password`) and
`POST /internal/live-sessions/{code}/join` with JSON `{ "password": "...",
"username": "..." }`. Both require `Authorization: Bearer <secret>` and
return the standard `chroniclesdk` create/join responses. The backend must
perform its own authorization and resolve the authenticated username before
forwarding it; leave `username` empty for a guest. The backend constructs the
public WebSocket URL. This daemon does not expose public create/join endpoints.

The main Chronicle API remains the only browser-facing create/join API and
checks the global SpiceDB `create_live_session` permission (Revered or Exalted)
before creating a room. Guests may still join using a code and optional password.
Configure the backend with all three settings together:

- `CHRONICLE_LIVE_SIGNALING_INTERNAL_URL=http://<private-service-address>:8081`
- `CHRONICLE_LIVE_SIGNALING_PUBLIC_URL=https://<public-signaling-origin>`
- `CHRONICLE_LIVE_SIGNALING_SECRET=<same secret as LIVESESSION_INTERNAL_SECRET>`

The backend must reach the private listener over the platform's internal network;
only the public listener should receive external traffic. The browser obtains the
public WebSocket URL from the create/join response; the main site's CSP adds that
configured origin to `connect-src`. Configure `LIVESESSION_ALLOWED_ORIGINS` to
include every Chronicle site origin used by guests. If the backend settings are
absent, the old process-local signaling mode remains available for single-node
development; **do not run multiple API replicas in that mode**.

Deploy the singleton daemon first, ensure its public and private listeners are
reachable from their respective clients, and then enable all three backend
settings on every API replica. A backend configured for the daemon fails startup
if any one setting is missing. Existing in-memory sessions on an old backend
end during rollout. Do not scale the signaling service itself past one replica
without implementing shared room/peer coordination.
