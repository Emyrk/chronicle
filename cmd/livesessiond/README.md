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
