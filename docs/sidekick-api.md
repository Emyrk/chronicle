# Chronicle Sidekick integration

Chronicle identifies each Sidekick installation separately so an account can monitor and disconnect multiple computers.

## Stable installation identity

Sidekick must generate a UUID once and persist it for the lifetime of that installation. Reuse the UUID when reconnecting the same installation. Do not derive it from hardware identifiers.

Include these fields in the OAuth device authorization request to `POST /oauth/device/authorize`:

| Form field | Required | Description |
| --- | --- | --- |
| `client_id` | yes | `chronicle-sidekick` |
| `scope` | yes | `all` |
| `installation_id` | yes for managed Sidekicks | Persisted installation UUID |
| `installation_name` | no | Initial user-facing name, such as the computer name |
| `installation_platform` | no | Short platform description |
| `installation_version` | no | Sidekick application version |

Older clients without `installation_id` can still authorize and upload, but they do not appear in Sidekick settings and cannot report health.

Reauthorizing the same installation UUID revokes its previous OAuth grants. Disconnecting it from Chronicle also revokes all OAuth access and refresh tokens associated with that installation.

## Heartbeat and issues

Send `PUT /api/v1/sidekick/status` with the OAuth bearer token once per minute:

```json
{
  "platform": "Windows 11",
  "version": "1.2.3",
  "wow_directories": [
    {
      "path": "C:\\Games\\Turtle WoW",
      "tenant_name": "Turtle WoW",
      "tenant_base_url": "https://legacy.chronicleclassic.com",
      "realmlist": "logon.turtle-wow.org"
    },
    {
      "path": "C:\\Games\\Warmane",
      "tenant_name": "Warmane",
      "tenant_base_url": "https://warmane.chronicleclassic.com",
      "realmlist": "logon.warmane.com"
    }
  ],
  "issues": [
    {
      "code": "combat_log_unavailable",
      "message": "The combat log file could not be opened.",
      "details": "Sanitized diagnostic details"
    }
  ]
}
```

Chronicle considers an installation running when its most recent heartbeat is less than three minutes old.

`wow_directories` is the complete snapshot of configured WoW installs. Build each entry from Sidekick's resolved `wowdir.Install`: `Dir` becomes `path`, the routed community becomes `tenant_name`, `BaseURL` becomes `tenant_base_url`, and `Realmlist` becomes `realmlist`. Omitting a previously reported path removes it from Chronicle. At most 50 directories may be reported.

`issues` is the complete snapshot of currently active issues:

- Use a stable, machine-readable `code` for each issue type.
- Repeating a code updates its message, details, and last-reported timestamp.
- Omitting a previously active code marks that issue resolved.
- Send an empty array when the installation is healthy.
- Messages and details must be sanitized and must not contain credentials, OAuth tokens, or private log contents.

Limits:

- 20 active issues per heartbeat
- code: 100 characters
- message: 500 characters
- details: 4,000 characters

## Upload tracking

Continue uploading with the linked OAuth bearer token through the existing raid-log upload endpoint. Chronicle associates successful uploads with the installation embedded in the OAuth authorization and updates its `last_upload_at` timestamp. No additional upload header is required.
