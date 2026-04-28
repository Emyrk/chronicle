# Deploying Chronicle

Chronicle ships as pre-built Docker images on DockerHub. Each supported WoW server gets its own image with server-specific game data compiled in. The container entrypoint is `./chronicled server`.

## Prerequisites

Before deploying Chronicle, you need:

- **PostgreSQL 17** — primary data store
- **SpiceDB** — gRPC authorization service ([github.com/authzed/spicedb](https://github.com/authzed/spicedb))
- **S3-compatible object storage** — AWS S3, Tigris, MinIO, etc. (or Supabase)
- **Discord OAuth application** — for user authentication ([Discord Developer Portal](https://discord.com/developers/applications))

## Available Images

Images are published to DockerHub under [`emyrk/chronicled`](https://hub.docker.com/r/emyrk/chronicled):

| Image Tag | Server | WoW Version |
|-----------|--------|-------------|
| `emyrk/chronicled:turtle` | Turtle WoW | 1.12.2 |
| `emyrk/chronicled:epoch` | Epoch | 3.3.5a |
| `emyrk/chronicled:kronos` | Kronos | 1.12.2 |
| `emyrk/chronicled:warmane` | Warmane | 1.12.2 |

Unstable builds from the main branch are tagged `<server>-unstable` (e.g. `emyrk/chronicled:turtle-unstable`).

## Running the Container

### Minimal Example

```bash
docker run -p 4000:4000 \
  -e CHRONICLE_POSTGRES_URL="postgresql://user:pass@db-host:5432/chronicle?sslmode=require" \
  -e CHRONICLE_ACCESS_URL="https://chronicle.example.com" \
  -e CHRONICLE_JWT_SECRET_PEM="<base64-encoded PEM private key>" \
  -e CHRONICLE_DISCORD_CLIENT_ID="..." \
  -e CHRONICLE_DISCORD_CLIENT_SECRET="..." \
  -e CHRONICLE_SPICEDB_GRPC_URL="spicedb:50051" \
  -e CHRONICLE_SPICEDB_PRESHARED_KEY="your-secret-key" \
  -e CHRONICLE_STORAGE_TYPE="s3" \
  -e CHRONICLE_S3_REGION="us-east-1" \
  -e CHRONICLE_S3_ACCESS_KEY="..." \
  -e CHRONICLE_S3_SECRET_KEY="..." \
  -e CHRONICLE_S3_BUCKET="chronicle-logs" \
  emyrk/chronicled:turtle
```

When running behind nginx on the same host, prefer binding Chronicle to loopback instead of exposing it publicly:

```bash
docker run -p 127.0.0.1:4000:4000 \
  -e CHRONICLE_POSTGRES_URL="postgresql://user:pass@db-host:5432/chronicle?sslmode=require" \
  -e CHRONICLE_ACCESS_URL="https://logs.oldmanwarcraft.com" \
  -e CHRONICLE_JWT_SECRET_PEM="<base64-encoded PEM private key>" \
  -e CHRONICLE_DISCORD_CLIENT_ID="..." \
  -e CHRONICLE_DISCORD_CLIENT_SECRET="..." \
  -e CHRONICLE_SPICEDB_GRPC_URL="spicedb:50051" \
  -e CHRONICLE_SPICEDB_PRESHARED_KEY="your-secret-key" \
  -e CHRONICLE_STORAGE_TYPE="s3" \
  -e CHRONICLE_S3_REGION="us-east-1" \
  -e CHRONICLE_S3_ACCESS_KEY="..." \
  -e CHRONICLE_S3_SECRET_KEY="..." \
  -e CHRONICLE_S3_BUCKET="chronicle-logs" \
  emyrk/chronicled:warmane
```

### Docker Compose

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: chronicle
      POSTGRES_PASSWORD: chronicle
      POSTGRES_DB: chronicle
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chronicle"]
      interval: 5s
      timeout: 5s
      retries: 5

  spicedb-migrate:
    image: authzed/spicedb
    command: datastore migrate head
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: "postgresql://chronicle:chronicle@postgres:5432/spicedb?sslmode=disable"
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  spicedb:
    image: authzed/spicedb
    command: serve
    environment:
      SPICEDB_DATASTORE_ENGINE: postgres
      SPICEDB_DATASTORE_CONN_URI: "postgresql://chronicle:chronicle@postgres:5432/spicedb?sslmode=disable"
      SPICEDB_GRPC_PRESHARED_KEY: "your-secret-key"
    ports:
      - "50051:50051"
    depends_on:
      spicedb-migrate:
        condition: service_completed_successfully

  chronicle:
    image: emyrk/chronicled:turtle
    ports:
      - "4000:4000"
    environment:
      CHRONICLE_POSTGRES_URL: "postgresql://chronicle:chronicle@postgres:5432/chronicle?sslmode=disable"
      CHRONICLE_ACCESS_URL: "https://chronicle.example.com"
      CHRONICLE_JWT_SECRET_PEM: "<base64-encoded PEM private key>"
      CHRONICLE_DISCORD_CLIENT_ID: "..."
      CHRONICLE_DISCORD_CLIENT_SECRET: "..."
      CHRONICLE_SPICEDB_GRPC_URL: "spicedb:50051"
      CHRONICLE_SPICEDB_PRESHARED_KEY: "your-secret-key"
      CHRONICLE_STORAGE_TYPE: "s3"
      CHRONICLE_S3_REGION: "us-east-1"
      CHRONICLE_S3_ACCESS_KEY: "..."
      CHRONICLE_S3_SECRET_KEY: "..."
      CHRONICLE_S3_BUCKET: "chronicle-logs"
    depends_on:
      postgres:
        condition: service_healthy
      spicedb:
        condition: service_started

volumes:
  pgdata:
```

## Database Migrations

- **Chronicle** — migrations run automatically on startup. No manual step needed.
- **SpiceDB** — run `spicedb datastore migrate head` before first use (and after SpiceDB version upgrades) to initialize its schema. The docker-compose example above handles this with a one-shot `spicedb-migrate` service.

## Configuration Reference

All configuration is set via environment variables (prefixed `CHRONICLE_`) or equivalent CLI flags.

### Core

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_POSTGRES_URL` | `--postgres-url` | `postgresql://postgres:postgres@localhost:5433/chronicle` | PostgreSQL connection URL |
| `CHRONICLE_HTTP_ADDRESS` | `--http-address` | `0.0.0.0:4000` | Address to listen on |
| `CHRONICLE_ACCESS_URL` | `--access-url` | `http://localhost:4000` | Public URL users access Chronicle at |
| `CHRONICLE_JWT_SECRET_PEM` | `--jwt-secret-pem` | _(ephemeral)_ | Base64-encoded PEM private key for JWT signing. Use `"dev"` for a built-in test key. |

### Discord OAuth

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_DISCORD_CLIENT_ID` | `--discord-client-id` | | Discord OAuth application client ID |
| `CHRONICLE_DISCORD_CLIENT_SECRET` | `--discord-client-secret` | | Discord OAuth application client secret |
| `CHRONICLE_DEV_AUTH` | `--dev-auth` | `false` | Enable mock OAuth (no Discord needed, development only) |

### SpiceDB (Authorization)

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_SPICEDB_GRPC_URL` | `--spicedb-grpc-url` | `localhost:50051` | SpiceDB gRPC endpoint |
| `CHRONICLE_SPICEDB_PRESHARED_KEY` | `--spicedb-preshared-key` | `chronicle-dev-key` | Shared key for SpiceDB authentication |

### Object Storage

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_STORAGE_TYPE` | `--storage-type` | `local` | Storage backend: `local`, `s3`, or `supabase` |
| `CHRONICLE_S3_REGION` | `--s3-region` | | AWS S3 region |
| `CHRONICLE_S3_ENDPOINT` | `--s3-endpoint` | | Custom S3 endpoint (for MinIO, Tigris, etc.) |
| `CHRONICLE_S3_ACCESS_KEY` | `--s3-access-key` | | S3 access key ID |
| `CHRONICLE_S3_SECRET_KEY` | `--s3-secret-key` | | S3 secret access key |
| `CHRONICLE_S3_PATH_STYLE` | `--s3-path-style` | `false` | Use path-style addressing (required for MinIO) |
| `CHRONICLE_S3_BUCKET` | `--s3-bucket` | | S3 bucket name |

### Discord Bot (Optional)

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_DISCORD_BOT_TOKEN` | `--discord-token` | | Discord bot token for role syncing |
| `CHRONICLE_DISCORD_BOT_DISABLE` | `--disable-discord-bot` | `false` | Disable the Discord bot |
| `CHRONICLE_DISCORD_GUILD_ID` | `--discord-guild-id` | | Discord guild ID for role syncing |

### Job Queue

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_LOG_PARSING_WORKERS` | `--log-parse-worker-count` | `1`     | Number of parallel combat log parsing workers |

### Email (Optional)

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_RESEND_API_KEY` | `--resend-api-key` | | [Resend](https://resend.com) API key |
| `CHRONICLE_EMAIL_FROM` | `--email-from` | `Chronicle <noreply@chronicleclassic.com>` | From address for outgoing emails |

### Monitoring (Optional)

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_PROMETHEUS_ENABLED` | `--prometheus-enabled` | `false` | Enable Prometheus metrics endpoint |
| `CHRONICLE_PROMETHEUS_ADDRESS` | `--prometheus-address` | `0.0.0.0:9091` | Prometheus metrics listen address |
| `CHRONICLE_PPROF_ENABLED` | `--pprof-enabled` | `false` | Enable Go pprof profiling endpoint |
| `CHRONICLE_PPROF_ADDRESS` | `--pprof-address` | `0.0.0.0:6060` | pprof listen address |

### Other

| Variable | Flag | Default | Description |
|----------|------|---------|-------------|
| `CHRONICLE_RETENTION_SCHEDULE` | `--retention-schedule` | `24h` | How often to run data retention cleanup. `0` to disable. |
| `CHRONICLE_ASSETS_GENERATED_DIR` | `--assets-generated-dir` | `./assets/<server>/generated` | Directory for generated JSON asset files |
| `CHRONICLE_JSON_LOGS` | _(env only)_ | `false` | Output structured JSON logs |
| `CHRONICLE_EMIT_PARSE_LOGS` | `--emit-parse-logs` | `false` | Emit verbose combat log parsing logs |
| `CHRONICLE_SHORT_LINK_DOMAIN` | `--short-link-domain` | | Custom domain for short share links (e.g. `chrn.link`) |
| `CHRONICLE_SAFFRON_URL` | `--saffron-url` | | URL to Saffron admin dashboard (internal proxy) |
| `CHRONICLE_OCR_URL` | `--ocr-url` | | URL to OCR service for item parsing |

## Railway Deployment

Chronicle's CI/CD is set up for Railway:

1. **Image builds** — pushing a git tag triggers GitHub Actions to build and push Docker images for all servers to DockerHub (e.g. `emyrk/chronicled:turtle`).
2. **Railway services** — each WoW server has its own Railway service configured to pull the appropriate image tag.
3. **Manual redeploy** — use the `deploy-railway.yml` workflow dispatch to trigger a redeploy without a new tag.
4. **Per-server isolation** — each server deployment needs its own PostgreSQL database, Discord OAuth application, SpiceDB instance, S3 bucket, and subdomain.

## Monitoring

Both endpoints are opt-in:

- **Prometheus metrics** — set `CHRONICLE_PROMETHEUS_ENABLED=true` to expose metrics on port `9091` (configurable). Scrape `/metrics`.
- **pprof profiling** — set `CHRONICLE_PPROF_ENABLED=true` to expose Go profiling on port `6060` (configurable). Access at `/debug/pprof/`.

## Nginx and Certbot

For a host-level deployment at `https://logs.example.com/`, run Chronicle on `127.0.0.1:4000` and let nginx terminate TLS and proxy requests to the app.

### 1. Install nginx and certbot

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2. Install the nginx site

An example site config is included at `services/nginx/logs.example.com.conf.example`.

```bash
sudo cp services/nginx/logs.example.com.conf.example /etc/nginx/sites-available/logs.example.com
sudo ln -s /etc/nginx/sites-available/logs.example.com /etc/nginx/sites-enabled/logs.example.com
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Issue the TLS certificate

```bash
sudo certbot --nginx -d logs.example.com
```

Certbot will update the nginx config in place to reference the Let's Encrypt certificate and install automatic renewal.

### 4. Cloudflare settings

- Point the DNS record for `logs.example.com` at the host running nginx.
- Set Cloudflare SSL/TLS mode to `Full (strict)` after the origin certificate is issued.
- If the ACME HTTP challenge fails while the record is proxied through Cloudflare, temporarily switch the DNS record to `DNS only`, rerun certbot, then re-enable the proxy.

### 5. Renewals and validation

```bash
sudo certbot renew --dry-run
curl -I https://logs.example.com/
```

The application must also be configured with:

```bash
CHRONICLE_ACCESS_URL=https://logs.example.com
```

That keeps Chronicle's redirects, OAuth callbacks, and absolute URLs aligned with the public origin.
