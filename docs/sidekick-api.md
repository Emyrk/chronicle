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
  "config_hash": "b568659ffa9fe99b312ce1c6ad2724d8b46924833e0641423329c91d9f698be5",
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

## Managed configuration

Chronicle is authoritative for Sidekick configuration. Configuration has two levels:

1. An account default.
2. An optional complete override for one Sidekick installation.

A Sidekick without an override inherits the account default. Deleting an override restores inheritance. The initial account default is:

```json
{
  "version": 1,
  "auto_upload": {
    "enabled": false
  }
}
```

Version 1 only contains `auto_upload.enabled`. Clients must treat the returned document as a complete typed configuration, not as a patch.

Authenticated account endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/me/sidekicks/config` | Read the account default and its canonical hash. |
| `PUT` | `/api/v1/me/sidekicks/config` | Replace the complete account default. |
| `GET` | `/api/v1/me/sidekicks/{sidekickID}/config` | Read inherited, override, effective, and effective hash state. |
| `PUT` | `/api/v1/me/sidekicks/{sidekickID}/config` | Replace the installation's complete override. |
| `DELETE` | `/api/v1/me/sidekicks/{sidekickID}/config` | Delete the override and resume inheritance. |

All installation endpoints enforce account ownership. `GET /api/v1/me/sidekicks` also includes `account_config`, and every installation includes its `configuration` state for account settings screens.

### Heartbeat reconciliation

`config_hash` in the heartbeat request is the SHA-256 hex digest of the exact deterministic JSON serialization of the typed effective config. For version 1, the disabled default serializes as:

```json
{"version":1,"auto_upload":{"enabled":false}}
```

The heartbeat response always includes the canonical desired `config_hash`. It includes `config` only when the request hash is absent or differs:

```json
{
  "config_hash": "b568659ffa9fe99b312ce1c6ad2724d8b46924833e0641423329c91d9f698be5",
  "config": {
    "version": 1,
    "auto_upload": {
      "enabled": false
    }
  }
}
```

When the hashes match, `config` is omitted. Older clients may omit `config_hash`; the heartbeat still succeeds, and they may ignore the additional response fields.

## Upload tracking

Continue uploading with the linked OAuth bearer token through the existing raid-log upload endpoint. Chronicle associates successful uploads with the installation embedded in the OAuth authorization and updates its `last_upload_at` timestamp. No additional upload header is required.
