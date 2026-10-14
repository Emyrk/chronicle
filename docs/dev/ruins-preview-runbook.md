# Ruins of Lordaeron local 3D preview

Runs a real WoW Forever "Halls of Lordaeron" log (map 2999) through a local
backend and shows it in the Replay Map's "3D map" on the dungeon mesh, before
the mesh is on the CDN. Nothing here touches prod.

Ports: backend `4000`, split router `4999`, Vite `5175`. Postgres `5433`.

Needs: Docker, Go, Node 22+, the raw log, and the GLB
(`rendered-maps/maps/ruins-of-lordaeron/renders/v007-glb/ruins-of-lordaeron-open-top.glb`).
Both are Blizzard-derived or personal data: never commit them.

Run everything from the repo root of a worktree that contains the train tip
(`origin/feature/3d-map-main`, which has the Ruins registration, mesh-only
instances and the dev manifest overlay).

## 1. Dependencies and a scratch database

```bash
make services-up                       # Postgres :5433, SpiceDB
docker exec chronicle-postgres psql -U postgres -c "CREATE DATABASE chronicle_ruins"
```

The default `make develop-backend` database can be left dirty by other
worktrees' migrations (`schema_migrations` dirty at some version), so this
preview uses its own database.

## 2. Backend

```bash
go run --tags azerothcore ./cmd/chronicled server --dev-auth --jwt-secret-pem=dev \
  --log-parse-worker-count=4 --emit-parse-logs --primary-domain=localhost \
  --postgres-url="postgres://postgres:postgres@127.0.0.1:5433/chronicle_ruins?sslmode=disable"
```

Wait for "startup sequence complete" (about a minute; migrations run first).

## 3. Upload the dump

Browser-only API: every request needs `Origin` and `Sec-Fetch-Site`.

```bash
H=(-H "Origin: http://localhost:4000" -H "Sec-Fetch-Site: same-origin")
curl -s -c /tmp/jar "${H[@]}" -H "Content-Type: application/json" \
  -X POST localhost:4000/auth/password/register \
  -d '{"email":"dev@example.com","username":"dev","password":"devpassword123"}'
curl -s -c /tmp/jar "${H[@]}" -H "Content-Type: application/json" \
  -X POST localhost:4000/auth/password/login \
  -d '{"email":"dev@example.com","password":"devpassword123"}'
curl -s -b /tmp/jar "${H[@]}" \
  -F "combat_log=@$HOME/git/warcraft/forever-logs/2026-10-14-halls-of-lordaeron-full-run.txt" \
  "localhost:4000/api/v1/raidlogs/logs/upload-v2?format=v22-cleu&flavor=vanilla,wow-forever"
```

The response carries `log_id`. The format and flavor are passed explicitly
because the local DB has no `forever` tenant. Parse takes a few seconds; check
`GET /api/v1/raidlogs/logs/<log_id>` for `status.state: "completed"`.

Find the instance id (it is random per upload):

```bash
docker exec chronicle-postgres psql -U postgres -d chronicle_ruins -At \
  -c "select id from log_instances where name = 'Halls of Lordaeron'"
```

Expect one instance named "Halls of Lordaeron" with 47 encounters: 6 bosses
(Witherfang, The Butcher, Viktor the Vile, The Abandoned, Bjork, Rath'mael;
two of them also have a 0s duplicate) and 39 trash.

## 4. Give the realm a dataset (icon base URL)

The Map panel reads the icon CDN base from the instance's dataset. The local
DB has none, so create one with prod Forever's value and point the log's
"Unknown" realm's server at it:

```bash
docker exec chronicle-postgres psql -U postgres -d chronicle_ruins -c "
INSERT INTO datasets (name, slug, wow_version, build_version, description, default_flavor, icon_base_url)
VALUES ('Forever','forever','1.60.1',70338,'local preview','{vanilla,wow-forever}','https://icons.chronicleclassic.com/forever')
ON CONFLICT (slug) DO NOTHING;
UPDATE wow_servers SET default_dataset_id=(SELECT id FROM datasets WHERE slug='forever')
 WHERE id = (SELECT server_id FROM wow_server_realms WHERE name='Unknown');"
```

No restart needed.

## 4b. Game data (spells, classes)

Without game data the parser stores no spell for any cast
(`wotlk.Parser.lookupSpell` returns nil on a miss), so cast icons show "?" /
"Spell 0" and every player class is `UNKNOWN` (class is read from the first
cast spell's `spell_class_set`).

The proper fix is a WoW Forever game-data snapshot imported with
`go run ./scripts/dbcdata import-wowdata --snapshot ... --api-url ...`
(`docs/wow-forever-game-data.md`). The `wowdata` extractor that command
builds (`github.com/Follen/wowdata`) is gone from GitHub, so on a machine
without a prebuilt binary the import cannot run. **A Forever game-data
snapshot from Emyrk replaces this whole section**: import it into the
`forever` dataset instead of seeding.

Until then, seed only the spells this log uses from prod's spell API:

```bash
python3 docs/dev/ruins-preview-seed-spells.py \
  ~/git/warcraft/forever-logs/2026-10-14-halls-of-lordaeron-full-run.txt \
  | docker exec -i chronicle-postgres psql -U postgres -d chronicle_ruins
```

(about 550 spells, under a minute). Then:

1. **Restart the backend** (step 2). Spells sit in an in-memory LRU, so rows
   inserted after a lookup are not seen until restart.
2. **Reparse** the log; do not re-upload (the same file hash is refused). The
   dev user is an admin. Every reparse replaces the instance, so the id in
   step 3's query changes:

   ```bash
   G=$(docker exec chronicle-postgres psql -U postgres -d chronicle_ruins -At \
         -c "select id from wow_log_groups limit 1")
   curl -s -b /tmp/jar "${H[@]}" -H "Content-Type: application/json" \
     -X POST localhost:4000/api/v1/admin/logs/reparse -d "{\"log_ids\":[\"$G\"]}"
   ```

Check: `select name, class from log_instance_players` shows real classes
(Jolly SHAMAN, Ragebar PALADIN, Skooma WARLOCK, Moon/Aelynda DRUID).

The seed fills only name, icon id, school and class set; spell tooltips and
icons still come from prod through the router.

## 5. Split router (:4999)

```bash
node docs/dev/ruins-preview-router.mjs
```

`/api/v1/raidlogs/logs`, `/api/v1/raidlogs/instances` and `/auth/` go to
localhost:4000; everything else (game data, icons, rankings, site-config) goes
to https://forever.chronicleclassic.com with browser-looking headers. The
router drops the `dataset_id` query parameter on those requests: the page
sends the local scratch dataset's uuid, which prod answers with 404. Its
site-config response gets `access_url` rewritten to the Vite origin and
`tenant` nulled (the local run is untenanted, and the page's tenant gate would
otherwise say "recorded on a different server").

## 6. Frontend (Vite :5175, in Docker)

Vite on macOS serves a blank page (case-colliding `CooldownUsage.ts`/`.tsx`),
so run it in Linux from a `git archive`:

```bash
FE=frontend/chronicle
mkdir -p $FE/public/dungeon-meshes $FE/public/dev-manifest
cp ~/git/warcraft/rendered-maps/maps/ruins-of-lordaeron/renders/v007-glb/ruins-of-lordaeron-open-top.glb \
   $FE/public/dungeon-meshes/2999.glb
cat > $FE/public/dev-manifest/forever.meshes.json <<'EOF'
{
  "format": "chronicle-wow-map-art-v2",
  "target": { "product": "wow_classic_beta" },
  "instances": [
    { "mapID": 2999, "name": "Ruins of Lordaeron",
      "mesh": { "path": "meshes/2999.glb",
                "bounds": { "minX": 1333.3337, "maxX": 1900.0, "minY": -33.3333, "maxY": 500.0 },
                "zMin": -13.6235, "zMax": 195.9512, "frame": "wow-yup-mirrored-x" } }
  ]
}
EOF

docker rm -f ruins-vite 2>/dev/null
docker run -d --name ruins-vite -p 5175:5173 --add-host=host.docker.internal:host-gateway node:20 sleep infinity
docker exec ruins-vite mkdir -p /src
git archive HEAD frontend | docker exec -i ruins-vite tar -x -C /src
docker cp $FE/public/dev-manifest ruins-vite:/src/$FE/public/
docker cp $FE/public/dungeon-meshes ruins-vite:/src/$FE/public/
docker exec -d -e HOST=http://host.docker.internal:4999 -e SERVER=forever ruins-vite bash -c \
  'cd /src/frontend/chronicle && corepack enable && corepack prepare pnpm@10.9.0 --activate \
   && pnpm install --frozen-lockfile > /tmp/install.log 2>&1 \
   && npx vite --host 0.0.0.0 --port 5173 > /tmp/vite.log 2>&1'
```

The install takes a minute or two; `docker exec ruins-vite tail /tmp/vite.log`
shows when Vite is ready. `.env.development` already sets
`VITE_DUNGEON_MESH_BASE` and `VITE_MAP_MANIFEST_OVERLAY`, which read the two
gitignored files above. The overlay's `target.product` must match the prod
Forever manifest (`wow_classic_beta`).

## 7. Open it

`http://localhost:5175/instances/<instance id>`

Pick an encounter (e.g. Witherfang) in the left list, open the panel type
menu on the first panel ("Line Chart" chevron), search "Map" and pick it. The
panel shows "Ruins of Lordaeron, world 2999" with the "3D map" toggle on. Use
the page's Replay button and play to watch the units move.

## Stop

```bash
docker rm -f ruins-vite
pkill -f ruins-preview-router.mjs
pkill -f "chronicled server"
make services-down   # optional; keeps the volume, so the run survives
```

The uploaded run lives in the `chronicle_ruins` database and survives a
restart; steps 3, 4 and 4b are only needed once.
