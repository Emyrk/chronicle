package servicestats_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services/servicestats"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
)

const furyGear = `{"class_name":"Warrior","spec":"Fury","window_days":60,"top_n":20,"players":20,
	"slots":[{"slot":15,"label":"Main Hand","items":[{"id":19364,"name":"Ashkandi","wearers":14,"percent":70}]}]}`

// Gear pages render from snapshots; a small cohort is noindex and out of the
// sitemap; a class/spec without data is 404; the index lists indexable pages.
func TestGearPages(t *testing.T) {
	t.Parallel()
	tenant := uuid.New()
	store := &snapshotStore{}
	store.put(tenant, "gear", "gear/warrior/fury", furyGear, 20, 5, computedAt, changedAt)
	store.put(tenant, "gear", "gear/priest/holy", `{"class_name":"Priest","spec":"Holy","window_days":60,"top_n":20,"players":2,"slots":[]}`, 2, 5, computedAt, changedAt)
	store.put(tenant, "gear-index", "gear-index", `{"window_days":60,"top_n":20,"entries":[{"class_name":"Warrior","spec":"Fury","path":"/stats/gear/warrior/fury","players":20}]}`, 1, 1, computedAt, changedAt)
	svc := newService(t, store)
	h := handler(svc, forever)

	fury := get(t, h, tenant, "/stats/gear/warrior/fury")
	require.Equal(t, http.StatusOK, fury.Code)
	body := fury.Body.String()
	require.Contains(t, body, "<h1>What gear do top Fury Warriors wear on WoW Forever?</h1>")
	require.Contains(t, body, "Ashkandi is the most-worn main-hand weapon among the top 20 Fury Warrior players on WoW Forever")
	require.Contains(t, body, "<caption>Main Hand</caption>")
	require.Contains(t, body, `<td><a href="/wowdb/item?id=19364">Ashkandi</a></td><td>70%</td><td>14</td>`)
	require.NotContains(t, body, "noindex")

	holy := get(t, h, tenant, "/stats/gear/priest/holy")
	require.Equal(t, http.StatusOK, holy.Code)
	require.Equal(t, "noindex", holy.Header().Get("X-Robots-Tag"), "below the minimum sample")
	require.NotContains(t, holy.Body.String(), "<table>")

	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/gear/mage/fire").Code, "no data, no page")
	require.Equal(t, http.StatusNotFound, get(t, h, tenant, "/stats/gear/Warrior/Fury").Code)

	index := get(t, h, tenant, "/stats/gear")
	require.Equal(t, http.StatusOK, index.Code)
	require.Contains(t, index.Body.String(), "<h1>Most-worn gear by class and spec on WoW Forever</h1>")
	require.Contains(t, index.Body.String(), `<td>Warrior</td><td><a href="/stats/gear/warrior/fury">Fury</a></td><td>20</td>`)

	entries, err := svc.SitemapEntries(servicetenant.WithTenantID(context.Background(), tenant))
	require.NoError(t, err)
	var paths []string
	for _, e := range entries {
		paths = append(paths, e.Path)
	}
	require.Contains(t, paths, "/stats/gear/warrior/fury")
	require.Contains(t, paths, "/stats/gear")
	require.NotContains(t, paths, "/stats/gear/priest/holy")
}

// The gear producer against real rankings and gear history: one page per
// class/spec with data, the tenant's own players only, and an index of the
// indexable pages.
func TestGearProducer(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	connURL := dbtestutil.NewConnectionURL(t)

	seedCfg, err := pgxpool.ParseConfig(connURL)
	require.NoError(t, err)
	seedCfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	seed, err := pgxpool.NewWithConfig(ctx, seedCfg)
	require.NoError(t, err)
	t.Cleanup(seed.Close)
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := seed.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	user := uuid.New()
	exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", user, "u-"+user.String()[:8], user.String()+"@example.com")
	killed := time.Now().Add(-5 * 24 * time.Hour)
	// raidWith seeds a tenant with enough raids to qualify and one boss kill
	// whose players get rankings and gear.
	raidWith := func(slug string) (tenant, realm, instance, encounter uuid.UUID) {
		tenant, server, realm, lg := uuid.New(), uuid.New(), uuid.New(), uuid.New()
		exec("INSERT INTO tenants (id, slug, name, include_in_all, discoverable) VALUES ($1, $2, $3, false, true)", tenant, slug, "tenant "+slug)
		exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server "+slug, tenant)
		exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, slug+"-realm")
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at) VALUES ($1, $2, now(), now())", lg, user)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category)
			SELECT gen_random_uuid(), $1, $2, 'Molten Core', $3, 'raid' FROM generate_series(1, $4::int)`, realm, lg, killed, servicestats.MinTenantRaids)
		instance, encounter = uuid.New(), uuid.New()
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, start_time, category) VALUES ($1, $2, $3, 'Blackwing Lair', $4, 'raid')`, instance, realm, lg, killed)
		exec(`INSERT INTO log_instance_encounters (id, instance_id, name, remaining, boss, start_time, end_time, kill_type)
			VALUES ($1, $2, 'Nefarian', '{}', true, $3, $3, 'clean')`, encounter, instance, killed)
		return tenant, realm, instance, encounter
	}
	gear := func(items map[int]string) string {
		slots := make([]map[string]any, 19)
		for i := range slots {
			slots[i] = map[string]any{}
		}
		for slot, name := range items {
			slots[slot] = map[string]any{"item_id": 1000 + len(name), "item_name": name, "item_quality": 4}
		}
		raw, _ := json.Marshal(slots)
		return string(raw)
	}
	n := 0
	player := func(realm, instance, encounter uuid.UUID, class, spec string, dps float64, items map[int]string) {
		n++
		guid := fmt.Sprintf("0x%016X", n)
		exec(`INSERT INTO game_players (id, realm_id, name, class, gender, race) VALUES ($1, $2, $3, $4, 'Male', 'Human')`, guid, realm, fmt.Sprintf("P%d", n), class)
		exec(`INSERT INTO encounter_dps_rankings (instance_id, encounter_id, encounter_name, instance_name, player_guid, player_name, player_class, player_spec, realm_id, realm_name, damage_done, duration_secs, dps, killed_at)
			VALUES ($1, $2, 'Nefarian', 'Blackwing Lair', $3, $4, $5, $6, $7, 'realm', 1000, 10, $8, $9)`, instance, encounter, guid, fmt.Sprintf("P%d", n), class, spec, realm, dps, killed)
		exec(`INSERT INTO game_player_gear_history (player_id, realm_id, instance_id, gear, equipped_at) VALUES ($1, $2, $3, $4, $5)`, guid, realm, instance, gear(items), killed)
	}

	ours, ourRealm, ourInstance, ourEncounter := raidWith("gearours")
	for i := 0; i < 6; i++ {
		weapon := "Ashkandi"
		if i >= 4 {
			weapon = "Bonereaver's Edge"
		}
		player(ourRealm, ourInstance, ourEncounter, "WARRIOR", "Fury", float64(900+i), map[int]string{0: "Lionheart Helm", 15: weapon})
	}
	player(ourRealm, ourInstance, ourEncounter, "PRIEST", "Holy", 100, map[int]string{0: "Halo"})
	player(ourRealm, ourInstance, ourEncounter, "MAGE", "Unknown", 800, map[int]string{0: "Hat"})
	// Another tenant's warriors never count toward ours.
	_, theirRealm, theirInstance, theirEncounter := raidWith("geartheirs")
	for i := 0; i < 3; i++ {
		player(theirRealm, theirInstance, theirEncounter, "WARRIOR", "Fury", 2000, map[int]string{15: "Thunderfury"})
	}

	pool, err := database.NewPostgresDB(ctx, testutil.Logger(t), connURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	store := database.New(pool)
	svc, err := servicestats.New(servicestats.Options{Logger: testutil.Logger(t), Store: store})
	require.NoError(t, err)

	_, err = svc.RefreshTenant(ctx, &recordingQueue{}, ours, false)
	require.NoError(t, err)
	res, err := svc.RefreshProducer(ctx, ours, "gear", time.Time{})
	require.NoError(t, err)
	require.Equal(t, 2, res.Pages, "Fury Warrior and Holy Priest; the unknown spec is skipped")
	require.Equal(t, []string{"/stats/gear/warrior/fury"}, res.Changed, "only the indexable page counts as changed for IndexNow")

	tctx := servicetenant.WithTenantID(ctx, ours)
	fury, err := store.GetStatsSnapshot(tctx, database.GetStatsSnapshotParams{TenantID: ours, PageKey: "gear/warrior/fury"})
	require.NoError(t, err)
	require.EqualValues(t, 6, fury.SampleN)
	require.JSONEq(t, `{
		"class_name": "Warrior", "spec": "Fury", "window_days": 60, "top_n": 20, "players": 6,
		"slots": [
			{"slot": 0, "label": "Head", "items": [{"id": 1014, "name": "Lionheart Helm", "wearers": 6, "percent": 100}]},
			{"slot": 15, "label": "Main Hand", "items": [
				{"id": 1008, "name": "Ashkandi", "wearers": 4, "percent": 66.66666666666666},
				{"id": 1017, "name": "Bonereaver's Edge", "wearers": 2, "percent": 33.33333333333333}
			]}
		]
	}`, string(fury.Payload))
	holy, err := store.GetStatsSnapshot(tctx, database.GetStatsSnapshotParams{TenantID: ours, PageKey: "gear/priest/holy"})
	require.NoError(t, err)
	require.EqualValues(t, 1, holy.SampleN)

	res, err = svc.RefreshProducer(ctx, ours, "gear-index", time.Time{})
	require.NoError(t, err)
	require.Equal(t, 1, res.Pages)
	index, err := store.GetStatsSnapshot(tctx, database.GetStatsSnapshotParams{TenantID: ours, PageKey: "gear-index"})
	require.NoError(t, err)
	require.JSONEq(t, `{"window_days": 60, "top_n": 20, "entries": [{"class_name": "Warrior", "spec": "Fury", "path": "/stats/gear/warrior/fury", "players": 6}]}`, string(index.Payload))
}
