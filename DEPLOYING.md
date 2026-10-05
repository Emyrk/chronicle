# Self-hosting Chronicle

Chronicle publishes a Docker image for AzerothCore-compatible World of Warcraft servers. The supported image is:

```text
emyrk/chronicled:latest
```

Release builds are also published with their Git tag, for example `emyrk/chronicled:v1.2.3`. Pin a release tag in production so upgrades are deliberate. The historical `emyrk/chronicled:azerothcore` tag remains available as a compatibility alias for release builds.

> [!IMPORTANT]
> Chronicle's license permits non-commercial hosting subject to the [Self Hosted Requirements](https://chronicleclassic.com/self-hosting/). Keep the required branding, linked **Powered by Chronicle** footer, and support banner intact.

## What the image includes

The image runs `./chronicled server` and includes the frontend, backend, database migrations, and generated application assets. The current public image is compiled for AzerothCore.

Game data is not fully bootstrapped by starting the container. After Chronicle is running, use the repository's import scripts to upload spells and related game data.

## Prerequisites

A production installation needs:

- PostgreSQL 17
- SpiceDB
- S3-compatible object storage
- A Discord OAuth application
- A public HTTPS URL and reverse proxy

For evaluation on one machine, Chronicle can use local object storage. Production installations should use S3-compatible storage so uploaded logs survive container replacement.

## Quick start with the published image

The repository's root `compose.yml` is intended for local development and builds Chronicle from source. For a hosted installation, create a separate Compose file using the published image:

```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: chronicle
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: chronicle
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chronicle -d chronicle"]
      interval: 5s
      timeout: 5s
      retries: 10

  spicedb-migrate:
    image: authzed/spicedb:latest
    command: migrate head
    restart: "no"
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: postgresql://chronicle:change-me@postgres:5432/spicedb?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy

  spicedb:
    image: authzed/spicedb:latest
    command: serve
    restart: unless-stopped
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: postgresql://chronicle:change-me@postgres:5432/spicedb?sslmode=disable
      SPICEDB_GRPC_PRESHARED_KEY: change-this-too
    depends_on:
      spicedb-migrate:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD", "grpc_health_probe", "-addr=localhost:50051"]
      interval: 10s
      timeout: 5s
      retries: 10

  chronicle:
    image: emyrk/chronicled:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:4000:4000"
    environment:
      CHRONICLE_ACCESS_URL: https://logs.example.com
      CHRONICLE_HTTP_ADDRESS: 0.0.0.0:4000
      CHRONICLE_POSTGRES_URL: postgresql://chronicle:change-me@postgres:5432/chronicle?sslmode=disable
      CHRONICLE_JWT_SECRET_PEM: replace-with-generated-key
      CHRONICLE_SPICEDB_GRPC_URL: spicedb:50051
      CHRONICLE_SPICEDB_PRESHARED_KEY: change-this-too
      CHRONICLE_DISCORD_CLIENT_ID: replace-me
      CHRONICLE_DISCORD_CLIENT_SECRET: replace-me
      CHRONICLE_DISCORD_BOT_DISABLE: "true"
      CHRONICLE_STORAGE_TYPE: s3
      CHRONICLE_S3_REGION: auto
      CHRONICLE_S3_ENDPOINT: https://your-s3-compatible-endpoint
      CHRONICLE_S3_ACCESS_KEY: replace-me
      CHRONICLE_S3_SECRET_KEY: replace-me
      CHRONICLE_S3_BUCKET: chronicle
    depends_on:
      postgres:
        condition: service_healthy
      spicedb:
        condition: service_healthy

volumes:
  postgres-data:
```

The example intentionally binds Chronicle to loopback. Put nginx, Caddy, Traefik, or another TLS-terminating reverse proxy in front of port 4000.

Create both `chronicle` and `spicedb` databases before starting the stack. A simple initialization script mounted into PostgreSQL can create the second database:

```sql
CREATE DATABASE spicedb;
```

Replace every example password and secret before exposing the service.

## Generate the JWT signing key

The container includes Chronicle's key generator:

```bash
docker run --rm emyrk/chronicled:latest ./chronicled secret
```

Store its output in `CHRONICLE_JWT_SECRET_PEM`. Do not use the development value `dev` in a public installation.

## Discord OAuth

Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and configure this redirect URL:

```text
https://logs.example.com/auth/discord/callback
```

It must use the same origin as `CHRONICLE_ACCESS_URL`.

Set:

```text
CHRONICLE_DISCORD_CLIENT_ID
CHRONICLE_DISCORD_CLIENT_SECRET
```

The Discord bot is optional. Keep `CHRONICLE_DISCORD_BOT_DISABLE=true` unless you have configured its token and guild integration.

## S3-compatible storage

Chronicle supports S3-compatible object storage. Required settings are:

| Variable | Purpose |
| --- | --- |
| `CHRONICLE_STORAGE_TYPE=s3` | Select S3 storage |
| `CHRONICLE_S3_REGION` | Provider region, or the provider's documented compatibility value |
| `CHRONICLE_S3_ENDPOINT` | Custom endpoint for non-AWS providers |
| `CHRONICLE_S3_ACCESS_KEY` | Access key ID |
| `CHRONICLE_S3_SECRET_KEY` | Secret access key |
| `CHRONICLE_S3_BUCKET` | Bucket used for Chronicle objects |
| `CHRONICLE_S3_PATH_STYLE` | Set to `true` when required by MinIO or another provider |

The credentials need permission to read, write, list, and delete objects in the configured bucket.

For a disposable local installation, use:

```text
CHRONICLE_STORAGE_TYPE=local
```

and persist `/root/.chronicle/storage` with a Docker volume.

## Start Chronicle

```bash
docker compose pull
docker compose up -d
```

Chronicle runs its PostgreSQL migrations during startup. SpiceDB schema migrations run through the one-shot `spicedb-migrate` service.

Inspect startup logs before continuing:

```bash
docker compose logs -f chronicle
```

Then open the configured `CHRONICLE_ACCESS_URL` and sign in with Discord.

## Administrator and game-data setup

Chronicle's authorization and game-data tools are powerful, but the bootstrap workflow is still evolving. The exact administrator grant depends on the current authorization schema and should be verified against the checked-out version of the repository.

> [!NOTE]
> This is a good task for a coding agent. Ask it to inspect the current SpiceDB authorization schema, administrator APIs, and game-data routes before it performs the bootstrap. Do not copy an old SQL or SpiceDB command without verifying it against your release.

The account performing imports needs the world-data administration permission used by the game-data API.

## Upload spells and game data

Starting Chronicle creates the default dataset record, but it does not import all spell, item, talent, creature, or modern client data. Use the tooling under `scripts/dbcdata` and `scripts/upload-dbc` after the server is available.

The import tooling supports two broad paths:

- Legacy DBC clients through `go run ./scripts/dbcdata import`
- Modern WoWData/DB2 clients through `go run ./scripts/dbcdata import-wowdata`

The scripts can upload directly to a running Chronicle API and scope data to a dataset ID. Authentication and the exact required importers depend on the client build.

> [!WARNING]
> These scripts are not yet documented as a stable operator interface. Review them before running them against production.

`scripts/upload-dbc/run.sh` is the best starting point for an AI coding agent learning the workflow. It shows:

- The legacy target format
- The modern WoWData target format
- Dataset IDs and API URLs
- The commands used for each import path
- How extra authentication or import flags are forwarded

Ask the agent to inspect these files together:

```text
scripts/upload-dbc/run.sh
scripts/dbcdata/cli/importcmd.go
scripts/dbcdata/cli/import_wowdata.go
scripts/dbcdata/cli/uploader.go
api/gamedataapi/handler.go
```

Before an import, have the agent confirm:

1. The Chronicle release and client build are compatible.
2. The destination dataset ID is correct.
3. The selected legacy or WoWData import path is appropriate.
4. Authentication has the required world-data permission.
5. A comparison or dry-run mode is used first when the selected importer supports it.
6. The resulting configuration appears correctly on `/technical`.

Do not use the site-specific scripts in `scripts/upload-dbc` unchanged. Some contain project deployment URLs, local paths, and dataset IDs. Treat them as examples.

## Flavors, formats, and the icon CDN

Chronicle exposes its public game-data configuration at:

```text
https://logs.example.com/technical
```

The page shows:

- Active flavor tags
- Accepted combat-log formats and the default format
- The configured icon CDN

Flavor tags describe the game-data and parser behavior enabled for the installation. The current published image is AzerothCore-compatible, but imported data and configuration still need to match the server and client build you intend to process.

### Chronicle icon CDN

Self-hosters may be allowed to use Chronicle's hosted icon CDN. Ask for permission in the [Chronicle Discord](https://discord.gg/gz97ABFVAj) before depending on it.

For custom data or long-term operational independence, host your own assets on an HTTP CDN or S3-compatible public bucket and configure the dataset's `icon_base_url`. Verify the resulting URL on `/technical` and confirm item and spell icons load in the UI.

Generated JSON assets packaged with the application are served by Chronicle itself. The icon CDN is separate from S3 object storage used for uploaded combat logs.

## Reverse proxy and TLS

A minimal nginx proxy looks like this:

```nginx
server {
    listen 80;
    server_name logs.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use Certbot or your preferred ACME client to add HTTPS. After TLS is working, confirm that `CHRONICLE_ACCESS_URL` exactly matches the public HTTPS origin.

The repository also includes an example under `services/nginx/`.

## Upgrades

Production installations should pin a release tag:

```yaml
image: emyrk/chronicled:v1.2.3
```

To upgrade:

1. Back up PostgreSQL and object storage.
2. Read the release notes.
3. Change the pinned image tag.
4. Pull the new image.
5. Restart Chronicle and watch the migration logs.
6. Re-run game-data imports only when the release or client data requires it.

```bash
docker compose pull chronicle
docker compose up -d chronicle
docker compose logs -f chronicle
```

## Useful configuration

| Variable | Default | Description |
| --- | --- | --- |
| `CHRONICLE_HTTP_ADDRESS` | `0.0.0.0:4000` | HTTP listen address |
| `CHRONICLE_ACCESS_URL` | `http://localhost:4000` | Public origin used for redirects and OAuth |
| `CHRONICLE_POSTGRES_URL` | local development URL | PostgreSQL connection URL |
| `CHRONICLE_DB_MAX_CONNS` | `20` | Maximum shared PostgreSQL pool size |
| `CHRONICLE_JWT_SECRET_PEM` | ephemeral | Base64-encoded PEM signing key |
| `CHRONICLE_SPICEDB_GRPC_URL` | `localhost:50051` | SpiceDB gRPC endpoint |
| `CHRONICLE_SPICEDB_PRESHARED_KEY` | development key | SpiceDB authentication key |
| `CHRONICLE_STORAGE_TYPE` | `local` | `local` or `s3` |
| `CHRONICLE_LOG_PARSING_WORKERS` | `1` | Parallel combat-log parsing workers |
| `CHRONICLE_RETENTION_SCHEDULE` | `24h` | Retention cleanup interval, or `0` to disable |
| `CHRONICLE_PROMETHEUS_ENABLED` | `false` | Enable Prometheus on its separate listener |
| `CHRONICLE_PROMETHEUS_ADDRESS` | `0.0.0.0:9091` | Prometheus listen address |
| `CHRONICLE_PPROF_ENABLED` | `false` | Enable Go pprof on its separate listener |
| `CHRONICLE_PPROF_ADDRESS` | `0.0.0.0:6060` | pprof listen address |
| `CHRONICLE_OCR_URL` | unset | Optional OCR service URL |
| `CHRONICLE_RESEND_API_KEY` | unset | Optional Resend email API key |
| `CHRONICLE_EMAIL_FROM` | Chronicle default | Outgoing email sender |

Run the image's help command for the complete configuration supported by your pinned release:

```bash
docker run --rm emyrk/chronicled:latest ./chronicled server --help
```

## Troubleshooting

### Discord redirects to the wrong address

Make sure `CHRONICLE_ACCESS_URL` and the Discord OAuth callback use the same HTTPS origin and callback path.

### Chronicle cannot connect to SpiceDB

Confirm that `spicedb-migrate` completed successfully, the gRPC endpoint is reachable, and both services use the same preshared key.

### Uploads disappear after replacing the container

Use S3-compatible storage, or persist `/root/.chronicle/storage` when using local storage.

### Spell or item pages are empty

The container is running, but game data has not been imported into the destination dataset. Inspect `scripts/upload-dbc/run.sh` and the current `dbcdata` commands with an AI coding agent.

### Icons are missing

Open `/technical` and check the advertised icon CDN. Confirm that the configured base URL is publicly reachable and contains assets for the imported client data.

### A game-data upload returns 401 or 403

The session or token is missing the required world-data administration permission. Have an agent inspect the authorization schema and current administrator tooling for your pinned release.
