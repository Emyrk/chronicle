# Developer API OAuth

The external API at `/api/external/v1` accepts optional OAuth bearer tokens. Anonymous requests remain available for now. Both anonymous and authenticated requests have the existing 60-request-per-minute limit and burst of 20; authenticated requests share a quota by developer app, while anonymous requests share a quota by client IP. Event requests cost one tenth of a standard request. Quotas are currently process-local, not shared across server replicas.

## Developer application

An authenticated Chronicle browser user may manage **one** app. The management routes use the existing browser authentication middleware. There is no settings UI yet.

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/oauth/apps` | `{"app": null}` or app metadata, without a secret |
| `POST` | `/oauth/apps` | Create with JSON `{"name":"My integration"}`; returns app metadata and the secret **once** |
| `POST` | `/oauth/apps/rotate` | Rotate the secret; returns the new secret **once** and revokes existing tokens |
| `DELETE` | `/oauth/apps` | Delete the app and revoke existing tokens |

Store the secret securely. The server stores only its hash. A lost secret must be rotated.

## Obtain and refresh tokens

Exchange the client ID and secret for a one-hour access token and a rotating refresh token:

```sh
curl -X POST https://chronicleclassic.com/oauth/token \
  -d grant_type=client_credentials \
  -d client_id='<client_id>' \
  -d client_secret='<client_secret>' \
  -d scope=external:read
```

When the access token expires, exchange the latest refresh token without resending the client secret:

```sh
curl -X POST https://chronicleclassic.com/oauth/token \
  -d grant_type=refresh_token \
  -d refresh_token='<latest_refresh_token>'
```

Save the new access **and** refresh tokens atomically. Refresh rotates both tokens; reusing an old refresh token invalidates its grant. A refreshed access token is a new value, not an extension of the previous token's expiry. The refresh token lifetime is 30 days; obtain fresh credentials if it expires.

Call the read-only external API with `Authorization: Bearer <access_token>`. These app tokens never grant owner permissions on `/api/v1`. Sidekick continues to use its separate device flow.

## Validate a token

`POST /oauth/validate` checks any Chronicle-issued OAuth access token, including Sidekick's. Pass `token=<access_token>` as a form field or use `Authorization: Bearer <access_token>`. Active tokens return `active: true`, `client_id`, `user_id`, `scope`, and `expires_at` (plus a developer app ID where applicable). Expired, revoked, refresh, and non-OAuth tokens return `{"active":false}`. This endpoint does not accept Chronicle browser-session JWTs.

The current public endpoint set is unchanged. Requiring OAuth for selected external API routes and lowering anonymous limits are a separate rollout.
