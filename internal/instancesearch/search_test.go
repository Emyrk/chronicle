package instancesearch_test

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/timeparsepolicy"
)

// fixture is a small world with two tenants:
//
//   - mc1 / mc1dup: the same Molten Core run uploaded twice (one logical run).
//     Alpha guild, 3 priests, a druid that played Bear and Cat, Thrall with a
//     97 DPS parse on Ragnaros, a 90s Ragnaros kill, time parses, and a clear
//     with known boss / trash / idle time.
//   - mc2: Molten Core by Beta, 2 priests, a Ragnaros wipe then a 200s kill,
//     a druid that only played Bear.
//   - hidden: 3 priests but the log is unlisted.
//   - invalid: an invalidated run with no encounter data.
//   - other: 3 priests in tenant B.
type fixture struct {
	url                    string
	tenantA, tenantB       uuid.UUID
	mc1, mc1dup, mc2       uuid.UUID
	hidden, invalid, other uuid.UUID
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	url := dbtestutil.NewConnectionURL(t)

	// Seed with RLS bypassed.
	cfg, err := pgxpool.ParseConfig(url)
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_bypass"] = "true"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	defer pool.Close()

	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	f := &fixture{
		url:     url,
		tenantA: uuid.New(), tenantB: uuid.New(),
		mc1: uuid.New(), mc1dup: uuid.New(), mc2: uuid.New(),
		hidden: uuid.New(), invalid: uuid.New(), other: uuid.New(),
	}
	user := uuid.New()
	exec("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", user, "u-"+user.String()[:8], user.String()+"@example.com")

	realm := func(tenant uuid.UUID, name string) uuid.UUID {
		server, realm := uuid.New(), uuid.New()
		exec("INSERT INTO tenants (id, name, include_in_all) VALUES ($1, $2, false)", tenant, "tenant "+name)
		exec("INSERT INTO wow_servers (id, name, tenant_id) VALUES ($1, $2, $3)", server, "server "+name, tenant)
		exec("INSERT INTO wow_server_realms (id, server_id, name) VALUES ($1, $2, $3)", realm, server, name+"-"+realm.String()[:8])
		return realm
	}
	realmA := realm(f.tenantA, "Nordanaar")
	realmB := realm(f.tenantB, "Tel'Abim")

	guild := func(realm uuid.UUID, name string) uuid.UUID {
		id := uuid.New()
		exec("INSERT INTO guilds (id, realm_id, name) VALUES ($1, $2, $3)", id, realm, name)
		return id
	}
	alpha, beta := guild(realmA, "Alpha"), guild(realmA, "Beta")
	gammaB := guild(realmB, "Gamma")

	t0 := time.Date(2026, 10, 15, 19, 0, 0, 0, time.UTC)
	instance := func(id, realm uuid.UUID, guildID any, unlisted bool, dup any) {
		lg := uuid.New()
		exec("INSERT INTO wow_log_groups (id, owner, created_at, updated_at, unlisted) VALUES ($1, $2, $3, $3, $4)", lg, user, t0, unlisted)
		exec("INSERT INTO parsed_log_group (id, finalized_at) VALUES ($1, now())", lg)
		exec(`INSERT INTO log_instances (id, realm_id, log_group_id, name, guild_id, start_time, category, duplicate_group_id)
			VALUES ($1, $2, $3, 'Molten Core', $4, $5, 'raid', $6)`, id, realm, lg, guildID, t0, dup)
	}
	dup := uuid.New()
	instance(f.mc1, realmA, alpha, false, dup)
	instance(f.mc1dup, realmA, alpha, false, dup)
	instance(f.mc2, realmA, beta, false, nil)
	instance(f.hidden, realmA, alpha, true, nil)
	instance(f.invalid, realmA, nil, false, nil)
	exec("UPDATE log_instances SET name = 'Invalid Run', category = 'dungeon', start_time = '2026-09-01T00:00:00Z', invalidated_at = now(), invalid_reason = 'test invalidation' WHERE id = $1", f.invalid)
	instance(f.other, realmB, gammaB, false, nil)
	exec("UPDATE log_instances SET capabilities = '{overheal,unit-resources,unit-position}' WHERE id = ANY($1)", []uuid.UUID{f.mc1, f.mc1dup})
	exec("UPDATE log_instances SET capabilities = '{overheal,unit-resources}' WHERE id = $1", f.mc2)

	guidN := 0
	player := func(inst uuid.UUID, name, class string, guildID any) string {
		guidN++
		g := fmt.Sprintf("0x%016X", guidN)
		exec(`INSERT INTO log_instance_players (instance_id, unit_guid, name, level, class, race, guild_id)
			VALUES ($1, $2, $3, 60, $4, 'Human', $5)`, inst, g, name, class, guildID)
		return g
	}
	encounter := func(inst uuid.UUID, name string, boss bool, kill string, from, to time.Duration) uuid.UUID {
		id := uuid.New()
		exec(`INSERT INTO log_instance_encounters (id, instance_id, name, remaining, boss, start_time, end_time, kill_type)
			VALUES ($1, $2, $3, '{}', $4, $5, $6, $7)`, id, inst, name, boss, t0.Add(from), t0.Add(to), kill)
		return id
	}
	ranking := func(inst, enc, realm uuid.UUID, guid, name, class, spec, subSpec, role string, dps float64, deaths int) {
		exec(`INSERT INTO encounter_dps_rankings (encounter_id, instance_id, encounter_name, instance_name, player_guid, player_name,
				player_class, player_spec, player_sub_spec, player_role, realm_id, realm_name, damage_done, duration_secs, dps, killed_at, player_deaths)
			VALUES ($1, $2, (SELECT name FROM log_instance_encounters WHERE id = $1), 'Molten Core', $3, $4, $5, $6, $7, $8, $9, 'r', 1000, 60, $10, $11, $12)`,
			enc, inst, guid, name, class, spec, subSpec, role, realm, dps, t0, deaths)
	}

	// mc1 and its duplicate.
	for _, inst := range []uuid.UUID{f.mc1, f.mc1dup} {
		for i := range 3 {
			player(inst, fmt.Sprintf("Priest%d", i), "PRIEST", alpha)
		}
	}
	druid := player(f.mc1, "Bearcat", "DRUID", alpha)
	thrall := player(f.mc1, "Thrall", "SHAMAN", alpha)
	// Clear window 0-1500s: trash 0-600, Domo 600-780, trash 900-1200, Rag 1200-1290.
	// All fights = 1170s, boss = 270s, trash = 900s, idle = 330s.
	encounter(f.mc1, "Molten Giant", false, "clean", 0, 600*time.Second)
	domo := encounter(f.mc1, "Majordomo Executus", true, "clean", 600*time.Second, 780*time.Second)
	encounter(f.mc1, "Lava Surger", false, "clean", 900*time.Second, 1200*time.Second)
	rag := encounter(f.mc1, "Ragnaros", true, "clean", 1200*time.Second, 1290*time.Second)
	ranking(f.mc1, domo, realmA, druid, "Bearcat", "DRUID", "Feral", "Bear", "tank", 300, 0)
	ranking(f.mc1, rag, realmA, druid, "Bearcat", "DRUID", "Feral", "Cat", "dps", 900, 0)
	ranking(f.mc1, rag, realmA, thrall, "Thrall", "SHAMAN", "Enhancement", "", "dps", 1000, 0)
	exec(`INSERT INTO instance_speedruns (instance_id, instance_name, realm_id, qualified, start_time, completion_time, duration_ms, proof,
			ranked_start_time, ranked_completion_time, ranked_duration_ms)
		VALUES ($1, 'Molten Core', $2, true, $3, $4, 1500000, '{}', $3, $4, 1500000)`, f.mc1, realmA, t0, t0.Add(1500*time.Second))
	exec(`INSERT INTO instance_speedruns (instance_id, instance_name, realm_id, qualified, start_time, completion_time, duration_ms, proof,
			ranked_start_time, ranked_completion_time, ranked_duration_ms)
			VALUES ($1, 'Molten Core', $2, true, $3, $4, 1500000, '{}', $3, $4, 1500000)`, f.mc1dup, realmA, t0, t0.Add(1500*time.Second))
	exec(`INSERT INTO parse_score_results (tenant_id, instance_id, run_id, encounter_name, player_guid, metric, metric_value,
			precise_score, display_score, rank, sample_size, status)
		VALUES ($1, $2, $3, 'Ragnaros', $4, 'dps', 1000, 97, 97, 1, 20, 'ok')`, f.tenantA, f.mc1, uuid.New(), thrall)
	tps := uuid.New()
	exec(`INSERT INTO time_parse_scores (id, tenant_id, instance_id, run_id, realm_id, clear_duration_ms,
			clear_server_precise_score, clear_server_display_score, clear_server_rank, clear_server_sample_size, clear_server_status,
			clear_realm_precise_score, clear_realm_display_score, clear_realm_rank, clear_realm_sample_size, clear_realm_status,
			cutoff, window_start, lookback_days, policy_version, query_version)
		VALUES ($1, $2, $3, $4, $5, 1500000, 96, 96, 1, 20, 'ok', 96, 96, 1, 20, 'ok', now(), now(), $6, $7, $8)`,
		tps, f.tenantA, f.mc1, uuid.New(), realmA, instancesearch.DefaultTimeParseLookbackDays, int16(timeparsepolicy.PolicyVersion), timeparsepolicy.QueryVersion)
	exec(`INSERT INTO time_parse_scores (id, tenant_id, instance_id, run_id, realm_id, clear_duration_ms,
			clear_server_precise_score, clear_server_display_score, clear_server_rank, clear_server_sample_size, clear_server_status,
			clear_realm_precise_score, clear_realm_display_score, clear_realm_rank, clear_realm_sample_size, clear_realm_status,
			cutoff, window_start, lookback_days, policy_version, query_version)
			VALUES ($1, $2, $3, $4, $5, 1500000, 96, 96, 1, 20, 'ok', 96, 96, 1, 20, 'ok', now(), now(), $6, $7, $8)`,
		uuid.New(), f.tenantA, f.mc1dup, uuid.New(), realmA, instancesearch.DefaultTimeParseLookbackDays, int16(timeparsepolicy.PolicyVersion), timeparsepolicy.QueryVersion)
	bossScore := func(enc uuid.UUID, name string, score int) {
		exec(`INSERT INTO time_parse_boss_scores (time_parse_score_id, encounter_id, encounter_name, duration_ms,
				server_precise_score, server_display_score, server_rank, server_sample_size, server_status,
				realm_precise_score, realm_display_score, realm_rank, realm_sample_size, realm_status)
			VALUES ($1, $2, $3, 1000, $4::int, $4::int, 1, 20, 'ok', $4::int, $4::int, 1, 20, 'ok')`, tps, enc, name, score)
	}
	bossScore(rag, "Ragnaros", 95)
	bossScore(domo, "Majordomo Executus", 92)

	// mc2: wipe then a slow kill, two priests, a Bear-only druid.
	player(f.mc2, "PriestA", "PRIEST", beta)
	player(f.mc2, "PriestB", "PRIEST", beta)
	bear := player(f.mc2, "Bearonly", "DRUID", beta)
	encounter(f.mc2, "Ragnaros", true, "wipe", 0, 100*time.Second)
	rag2 := encounter(f.mc2, "Ragnaros", true, "clean", 200*time.Second, 400*time.Second)
	ranking(f.mc2, rag2, realmA, bear, "Bearonly", "DRUID", "Feral", "Bear", "tank", 300, 1)
	// Bearonly went Cat on trash. The aggregated trash row has no encounter_id.
	exec(`INSERT INTO encounter_dps_rankings (encounter_id, instance_id, encounter_name, instance_name, player_guid, player_name,
			player_class, player_spec, player_sub_spec, player_role, realm_id, realm_name, damage_done, duration_secs, dps, killed_at, player_deaths)
		VALUES (NULL, $1, 'Trash', 'Molten Core', $2, 'Bearonly', 'DRUID', 'Feral', 'Cat', 'dps', $3, 'r', 1000, 60, 500, $4, 0)`,
		f.mc2, bear, realmA, t0)

	// hidden and other: 3 priests each.
	for _, inst := range []uuid.UUID{f.hidden, f.other} {
		for i := range 3 {
			player(inst, fmt.Sprintf("Priest%d", i), "PRIEST", nil)
		}
	}
	return f
}

// store returns a store whose connections carry app.tenant_id, the way
// servicetenant.PrepareConn sets it in production.
func (f *fixture) store(t *testing.T, tenant uuid.UUID) (context.Context, database.Store) {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	cfg, err := pgxpool.ParseConfig(f.url)
	require.NoError(t, err)
	cfg.ConnConfig.RuntimeParams["app.tenant_id"] = tenant.String()
	// Superusers bypass RLS. Production pools downgrade to the chronicle role
	// (database.RegisterTypes); do the same so RLS is really exercised.
	cfg.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "SET ROLE chronicle")
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return servicetenant.WithTenantID(ctx, tenant), database.New(pool)
}

func (f *fixture) search(t *testing.T, tenant uuid.UUID, q instancesearch.Query) instancesearch.Page {
	t.Helper()
	ctx, store := f.store(t, tenant)
	page, err := run(ctx, store, q)
	require.NoError(t, err)
	return page
}

func run(ctx context.Context, store database.Store, q instancesearch.Query) (instancesearch.Page, error) {
	compiled, err := instancesearch.CompileForContext(ctx, q, instancesearch.Options{})
	if err != nil {
		return instancesearch.Page{}, err
	}
	return instancesearch.Search(ctx, store, compiled, instancesearch.SearchOptions{})
}

func (f *fixture) explain(t *testing.T, tenant uuid.UUID, query string, id uuid.UUID) instancesearch.Explanation {
	t.Helper()
	ctx, store := f.store(t, tenant)
	compiled, err := instancesearch.CompileExplainForContext(ctx, where(t, query), id, instancesearch.Options{})
	require.NoError(t, err)
	ex, err := instancesearch.Explain(ctx, store, compiled, instancesearch.SearchOptions{})
	require.NoError(t, err)
	return ex
}

func ids(page instancesearch.Page) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(page.Results))
	for _, r := range page.Results {
		out = append(out, r.ID)
	}
	return out
}

func where(t *testing.T, raw string) instancesearch.Query {
	t.Helper()
	var n instancesearch.Node
	require.NoError(t, json.Unmarshal([]byte(raw), &n))
	return instancesearch.Query{Where: &n}
}

func TestSearch(t *testing.T) {
	t.Parallel()
	f := newFixture(t)

	// Every example must be valid SQL against the real schema.
	t.Run("ExamplesExecute", func(t *testing.T) {
		t.Parallel()
		ctx, store := f.store(t, f.tenantA)
		for _, ex := range loadExamples(t) {
			_, err := run(ctx, store, ex.Query)
			require.NoError(t, err, ex.Name)
		}
	})

	t.Run("ExamplesExplain", func(t *testing.T) {
		t.Parallel()
		ctx, store := f.store(t, f.tenantA)
		for _, ex := range loadExamples(t) {
			compiled, err := instancesearch.CompileExplainForContext(ctx, ex.Query, f.mc1, instancesearch.Options{})
			require.NoError(t, err, ex.Name)
			_, err = instancesearch.Explain(ctx, store, compiled, instancesearch.SearchOptions{})
			require.NoError(t, err, ex.Name)
		}
	})

	t.Run("ExplainEvidence", func(t *testing.T) {
		t.Parallel()
		// The same druid was Bear on Majordomo and Cat on Ragnaros.
		ex := f.explain(t, f.tenantA, `{"and": [
			{"field": "instance.clear_time_ms", "op": "between", "value": [1000000, 2000000]},
			{"field": "instance.kill_time_parse", "op": ">=", "value": 90, "bosses": ["Ragnaros", "Majordomo Executus"], "match": "each"},
			{"any_player": {"and": [
				{"field": "player.sub_spec", "op": "=", "value": "Bear"},
				{"field": "player.sub_spec", "op": "=", "value": "Cat"}]}},
			{"count_players": {"where": {"field": "player.class", "op": "=", "value": "PRIEST"}, "op": ">=", "value": 3}},
			{"not": {"any_encounter": {"field": "encounter.outcome", "op": "=", "value": "wipe"}}}]}`, f.mc1)
		require.True(t, ex.Matched)
		kids := ex.Evidence.Children
		require.Len(t, kids, 5)
		for i, k := range kids {
			require.NotNil(t, k.OK, i)
			require.True(t, *k.OK, i)
		}

		require.EqualValues(t, 1_500_000, kids[0].Value)

		parses := map[string]any{}
		for _, r := range kids[1].Rows {
			require.True(t, r.OK)
			parses[r.Name] = r.Value
		}
		require.Equal(t, map[string]any{"Ragnaros": float64(95), "Majordomo Executus": float64(92)}, parses)

		require.EqualValues(t, 1, *kids[2].Count)
		require.Len(t, kids[2].Witnesses, 1)
		druid := kids[2].Witnesses[0]
		require.Equal(t, "Bearcat", druid.Name)
		require.Equal(t, "DRUID", druid.Class)
		bear, cat := druid.Evidence.Children[0], druid.Evidence.Children[1]
		require.Equal(t, []instancesearch.EvidenceRow{{Name: "Majordomo Executus", Value: "Bear", OK: true}, {Name: "Ragnaros", Value: "Cat", OK: false}}, bear.Rows)
		require.Equal(t, []instancesearch.EvidenceRow{{Name: "Majordomo Executus", Value: "Bear", OK: false}, {Name: "Ragnaros", Value: "Cat", OK: true}}, cat.Rows)

		require.EqualValues(t, 3, *kids[3].Count)
		require.Len(t, kids[3].Witnesses, 3)

		// not: the inner any_encounter is false with no witnesses.
		inner := kids[4].Children[0]
		require.False(t, *inner.OK)
		require.Empty(t, inner.Witnesses)

		// mc2 has no ranked clear: unknown, and still unknown under not.
		ex = f.explain(t, f.tenantA, `{"not": {"field": "instance.clear_time_ms", "op": ">", "value": 0}}`, f.mc2)
		require.False(t, ex.Matched)
		require.Nil(t, ex.Evidence.OK)
		require.Nil(t, ex.Evidence.Children[0].OK)
		require.Nil(t, ex.Evidence.Children[0].Value)

		// A wipe is a witness pull with its outcome and duration.
		ex = f.explain(t, f.tenantA, `{"any_encounter": {"field": "encounter.outcome", "op": "=", "value": "wipe"}}`, f.mc2)
		require.True(t, ex.Matched)
		w := ex.Evidence.Witnesses[0]
		require.Equal(t, "Ragnaros", w.Name)
		require.Equal(t, "wipe", w.Outcome)
		require.EqualValues(t, 100_000, w.DurationMS)
		require.True(t, w.EncounterID.Valid)
	})

	t.Run("ExplainVisibility", func(t *testing.T) {
		t.Parallel()
		q := where(t, `{"field": "instance.name", "op": "contains", "value": "molten"}`)
		for _, tc := range []struct {
			tenant uuid.UUID
			id     uuid.UUID
		}{
			{f.tenantA, f.hidden}, // unlisted
			{f.tenantA, f.other},  // other tenant
			{f.tenantB, f.mc1},
			{f.tenantA, uuid.New()},
		} {
			ctx, store := f.store(t, tc.tenant)
			compiled, err := instancesearch.CompileExplainForContext(ctx, q, tc.id, instancesearch.Options{})
			require.NoError(t, err)
			_, err = instancesearch.Explain(ctx, store, compiled, instancesearch.SearchOptions{})
			require.ErrorIs(t, err, instancesearch.ErrNotFound)
		}

		ctx, store := f.store(t, f.tenantA)
		compiled, err := instancesearch.CompileExplainForContext(ctx, instancesearch.Query{Where: q.Where}, f.invalid, instancesearch.Options{})
		require.NoError(t, err)
		ex, err := instancesearch.Explain(ctx, store, compiled, instancesearch.SearchOptions{})
		require.NoError(t, err)
		require.False(t, ex.Matched)

		validQ := where(t, `{"field": "instance.validity", "op": "=", "value": "valid"}`)
		compiled, err = instancesearch.CompileExplainForContext(ctx, validQ, f.invalid, instancesearch.Options{})
		require.NoError(t, err)
		ex, err = instancesearch.Explain(ctx, store, compiled, instancesearch.SearchOptions{})
		require.NoError(t, err)
		require.False(t, ex.Matched)

		compiled, err = instancesearch.CompileExplainForContext(ctx, q, f.mc1, instancesearch.Options{})
		require.NoError(t, err)
		_, err = instancesearch.Explain(servicetenant.AdminBypass(ctx), store, compiled, instancesearch.SearchOptions{})
		require.ErrorContains(t, err, "RLS bypassed")
	})

	t.Run("RefusesAdminBypass", func(t *testing.T) {
		t.Parallel()
		ctx, store := f.store(t, f.tenantA)
		_, err := run(servicetenant.AdminBypass(ctx), store, instancesearch.Query{})
		require.ErrorContains(t, err, "RLS bypassed")
	})

	t.Run("Timeout", func(t *testing.T) {
		t.Parallel()
		ctx, store := f.store(t, f.tenantA)
		compiled, err := instancesearch.CompileForContext(ctx, instancesearch.Query{}, instancesearch.Options{})
		require.NoError(t, err)
		// Force the timeout with a query that sleeps past it.
		compiled.SQL = "SELECT pg_sleep(1)"
		compiled.Args = nil
		_, err = instancesearch.Search(ctx, store, compiled, instancesearch.SearchOptions{StatementTimeout: 50 * time.Millisecond})
		require.ErrorIs(t, err, instancesearch.ErrTimeout)
	})

	t.Run("TenantIsolationVisibilityAndDuplicates", func(t *testing.T) {
		t.Parallel()
		q := where(t, `{"count_players": {"where": {"field": "player.class", "op": "=", "value": "PRIEST"}, "op": ">=", "value": 3}}`)

		// Tenant A: mc1 and mc1dup collapse to one row; hidden (unlisted) and
		// other (tenant B) never show up.
		got := ids(f.search(t, f.tenantA, q))
		require.Len(t, got, 1)
		require.Contains(t, []uuid.UUID{f.mc1, f.mc1dup}, got[0])

		require.Equal(t, []uuid.UUID{f.other}, ids(f.search(t, f.tenantB, q)))

		// An empty query includes valid and invalid runs by default, while still
		// respecting tenant scope, unlisted logs and duplicate collapsing.
		require.Len(t, f.search(t, f.tenantB, instancesearch.Query{}).Results, 1)
		require.Len(t, f.search(t, f.tenantA, instancesearch.Query{}).Results, 3)
	})

	t.Run("ValidityCondition", func(t *testing.T) {
		t.Parallel()

		valid := f.search(t, f.tenantA, where(t, `{"field": "instance.validity", "op": "=", "value": "valid"}`)).Results
		require.Len(t, valid, 2)
		for _, result := range valid {
			require.Nil(t, result.InvalidatedAt)
		}

		invalid := f.search(t, f.tenantA, where(t, `{"field": "instance.validity", "op": "=", "value": "invalid"}`)).Results
		require.Len(t, invalid, 1)
		require.Equal(t, f.invalid, invalid[0].ID)
		require.NotNil(t, invalid[0].InvalidatedAt)
		require.Equal(t, "test invalidation", invalid[0].InvalidReason)

		require.Len(t, f.search(t, f.tenantA, instancesearch.Query{}).Results, 3)
	})

	t.Run("Semantics", func(t *testing.T) {
		t.Parallel()
		mc1 := []uuid.UUID{f.mc1}
		cases := []struct {
			name  string
			query string
			want  []uuid.UUID
		}{
			// mc2's druid was Bear on a boss and Cat only on trash, so the
			// default (bosses) excludes it.
			{"SamePlayerBearAndCat", `{"any_player": {"and": [
				{"field": "player.sub_spec", "op": "=", "value": "Bear"},
				{"field": "player.sub_spec", "op": "=", "value": "Cat"}]}}`, mc1},
			{"BearAndCatOnAnyFight", `{"any_player": {"and": [
				{"field": "player.sub_spec", "op": "=", "value": "Bear", "on": "any"},
				{"field": "player.sub_spec", "op": "=", "value": "Cat", "on": "any"}]}}`, []uuid.UUID{f.mc1, f.mc2}},
			{"CatOnTrash", `{"any_player": {"field": "player.sub_spec", "op": "=", "value": "Cat", "on": "trash"}}`, []uuid.UUID{f.mc2}},
			{"BearOnBossCatOnTrash", `{"any_player": {"and": [
				{"field": "player.sub_spec", "op": "=", "value": "Bear", "on": "bosses"},
				{"field": "player.sub_spec", "op": "=", "value": "Cat", "on": "trash"}]}}`, []uuid.UUID{f.mc2}},
			{"CaseInsensitiveStrings", `{"and": [
				{"field": "instance.name", "op": "=", "value": "molten CORE"},
				{"field": "instance.guild", "op": "in", "value": ["BETA"]},
				{"any_player": {"field": "player.name", "op": "=", "value": "bearONLY"}}]}`, []uuid.UUID{f.mc2}},
			{"CaseInsensitiveEnumsAndBosses", `{"and": [
				{"any_player": {"field": "player.class", "op": "=", "value": "priest"}},
				{"field": "instance.kill_time_parse", "op": ">=", "value": 90, "bosses": ["RAGNAROS", "majordomo executus"], "match": "each"},
				{"field": "instance.capability", "op": "=", "value": "Unit-Position"}]}`, mc1},
			// The same boss in two cases counts once for match each.
			{"EachDedupesBossCase", `{"field": "instance.kill_time_ms", "op": "<=", "value": 120000, "bosses": ["Ragnaros", "RAGNAROS"], "match": "each"}`, mc1},
			{"NameContains", `{"field": "instance.name", "op": "contains", "value": "molten"}`, []uuid.UUID{f.mc1, f.mc2}},
			{"NameContainsMiddle", `{"field": "instance.name", "op": "contains", "value": "TEN co"}`, []uuid.UUID{f.mc1, f.mc2}},
			{"NameStartsWith", `{"field": "instance.name", "op": "starts_with", "value": "Molt"}`, []uuid.UUID{f.mc1, f.mc2}},
			{"NameStartsWithMiss", `{"field": "instance.name", "op": "starts_with", "value": "core"}`, nil},
			{"NameExactStillExact", `{"field": "instance.name", "op": "=", "value": "molten"}`, nil},
			// % and _ are literal, not LIKE wildcards.
			{"ContainsWildcardIsLiteral", `{"field": "instance.name", "op": "contains", "value": "%"}`, nil},
			{"PlayerNameContains", `{"any_player": {"field": "player.name", "op": "contains", "value": "cat"}}`, mc1},
			{"TankRole", `{"any_player": {"field": "player.role", "op": "=", "value": "tank"}}`, []uuid.UUID{f.mc1, f.mc2}},
			{"RagKillWithoutWipes", `{"and": [
				{"any_encounter": {"and": [{"field": "encounter.name", "op": "=", "value": "Ragnaros"}, {"field": "encounter.killed", "op": "=", "value": true}]}},
				{"not": {"any_encounter": {"and": [{"field": "encounter.name", "op": "=", "value": "Ragnaros"}, {"field": "encounter.outcome", "op": "=", "value": "wipe"}]}}}]}`, mc1},
			{"KillParseEach", `{"field": "instance.kill_time_parse", "op": ">=", "value": 90, "bosses": ["Ragnaros", "Majordomo Executus"], "match": "each"}`, mc1},
			{"KillParseEachMissesOne", `{"field": "instance.kill_time_parse", "op": ">=", "value": 93, "bosses": ["Ragnaros", "Majordomo Executus"], "match": "each"}`, nil},
			{"KillParseAny", `{"field": "instance.kill_time_parse", "op": ">=", "value": 93, "bosses": ["Ragnaros", "Majordomo Executus"]}`, mc1},
			{"ClearParse", `{"field": "instance.clear_parse", "op": ">=", "value": 95}`, mc1},
			{"PlayerParse", `{"any_player": {"and": [{"field": "player.name", "op": "=", "value": "Thrall"},
				{"field": "player.parse", "op": ">=", "value": 95, "bosses": ["Ragnaros"]}]}}`, mc1},
			{"FastRagKill", `{"field": "instance.kill_time_ms", "op": "<=", "value": 120000, "bosses": ["Ragnaros"]}`, mc1},
			{"SlowRagKill", `{"field": "instance.kill_time_ms", "op": ">", "value": 120000, "bosses": ["Ragnaros"]}`, []uuid.UUID{f.mc2}},
			{"BossTime", `{"field": "instance.boss_time_ms", "op": "=", "value": 270000}`, mc1},
			{"TrashTime", `{"field": "instance.trash_time_ms", "op": "=", "value": 900000}`, mc1},
			{"IdleTime", `{"field": "instance.idle_time_ms", "op": "=", "value": 330000}`, mc1},
			{"WipesCounted", `{"count_encounters": {"where": {"field": "encounter.outcome", "op": "=", "value": "wipe"}, "op": "=", "value": 1}}`, []uuid.UUID{f.mc2}},
			{"GuildMembers", `{"count_players": {"where": {"field": "player.guild", "op": "in", "value": ["Beta"]}, "op": ">=", "value": 3}}`, []uuid.UUID{f.mc2}},
			{"DeathlessRag", `{"and": [{"field": "instance.kill_time_ms", "op": ">", "value": 0, "bosses": ["Ragnaros"]},
				{"not": {"any_player": {"field": "player.deaths", "op": ">=", "value": 1, "bosses": ["Ragnaros"]}}}]}`, mc1},
			{"HasCapability", `{"field": "instance.capability", "op": "=", "value": "unit-position"}`, mc1},
			{"LacksCapability", `{"and": [{"field": "instance.capability", "op": "=", "value": "unit-resources"},
				{"field": "instance.capability", "op": "!=", "value": "unit-position"}]}`, []uuid.UUID{f.mc2}},
			{"AnyCapability", `{"field": "instance.capability", "op": "in", "value": ["unit-position", "interrupt"]}`, mc1},
			{"NoCapability", `{"field": "instance.capability", "op": "not_in", "value": ["unit-position", "interrupt"]}`, []uuid.UUID{f.mc2}},
			{"InstanceGuild", `{"field": "instance.guild", "op": "=", "value": "Beta"}`, []uuid.UUID{f.mc2}},
			{"KillTimeBetween", `{"field": "instance.kill_time_ms", "op": "between", "value": [150000, 250000], "bosses": ["Ragnaros"]}`, []uuid.UUID{f.mc2}},
			{"KillTimeBetweenInclusive", `{"field": "instance.kill_time_ms", "op": "between", "value": [90000, 90000], "bosses": ["Ragnaros"]}`, mc1},
			{"StartedBetween", `{"field": "instance.started_at", "op": "between", "value": ["2026-10-15T00:00:00Z", "2026-10-15T23:59:59Z"]}`, []uuid.UUID{f.mc1, f.mc2}},
			{"StartedBetweenMiss", `{"field": "instance.started_at", "op": "between", "value": ["2026-10-16T00:00:00Z", "2026-10-31T23:59:59Z"]}`, nil},
			{"NotClearTimeUnknown", `{"not": {"field": "instance.clear_time_ms", "op": ">", "value": 0}}`, nil},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				t.Parallel()
				// Explain agrees with search on every visible run.
				for _, id := range []uuid.UUID{f.mc1, f.mc2} {
					want := slices.Contains(tc.want, id)
					require.Equal(t, want, f.explain(t, f.tenantA, tc.query, id).Matched, "explain %s", id)
				}
				q := where(t, tc.query)
				q.Where = &instancesearch.Node{And: []instancesearch.Node{
					{Field: "instance.validity", Op: instancesearch.OpEq, Value: json.RawMessage(`"valid"`)},
					*q.Where,
				}}
				got := ids(f.search(t, f.tenantA, q))
				// mc1 and mc1dup are one logical run; normalize to mc1.
				for i, id := range got {
					if id == f.mc1dup {
						got[i] = f.mc1
					}
				}
				if tc.want == nil {
					require.Empty(t, got)
					return
				}
				require.ElementsMatch(t, tc.want, got)
			})
		}
	})

	t.Run("SummaryColumns", func(t *testing.T) {
		t.Parallel()
		page := f.search(t, f.tenantA, where(t, `{"any_player": {"field": "player.name", "op": "=", "value": "Thrall"}}`))
		require.Len(t, page.Results, 1)
		r := page.Results[0]
		require.Equal(t, f.mc1, r.ID)
		// 3 priests, Bearcat, Thrall; Majordomo and Ragnaros killed; 25 min clear.
		require.EqualValues(t, 5, r.PlayerCount)
		require.EqualValues(t, 2, r.BossesKilled)
		require.NotNil(t, r.ClearTimeMS)
		require.EqualValues(t, 1_500_000, *r.ClearTimeMS)

		// mc2 has no ranked clear.
		page = f.search(t, f.tenantA, where(t, `{"field": "instance.guild", "op": "=", "value": "Beta"}`))
		require.Len(t, page.Results, 1)
		require.Nil(t, page.Results[0].ClearTimeMS)
		require.EqualValues(t, 1, page.Results[0].BossesKilled)
	})

	t.Run("ParseTenantIsBound", func(t *testing.T) {
		t.Parallel()
		// Tenant B cannot see tenant A's instances, and parse rows are also
		// tenant-scoped, so nothing matches.
		q := where(t, `{"field": "instance.clear_parse", "op": ">=", "value": 0}`)
		require.Empty(t, f.search(t, f.tenantB, q).Results)
	})

	t.Run("Sorting", func(t *testing.T) {
		t.Parallel()

		for _, option := range instancesearch.DescribeSorts() {
			sort := &instancesearch.Sort{Field: option.Field}
			if option.Boss {
				sort.Boss = "Ragnaros"
			}
			q := where(t, `{"field": "instance.validity", "op": "=", "value": "valid"}`)
			q.Sort = sort
			page := f.search(t, f.tenantA, q)
			require.Len(t, page.Results, 2, option.Field)
		}

		q := where(t, `{"field": "instance.validity", "op": "=", "value": "valid"}`)
		q.Sort = &instancesearch.Sort{Field: instancesearch.SortClearTime, Direction: instancesearch.SortAsc}
		page := f.search(t, f.tenantA, q)
		require.Equal(t, []string{"Alpha", "Beta"}, []string{page.Results[0].GuildName, page.Results[1].GuildName})
		// Results carry the sorted value so the UI can show it; mc2 has no clear.
		require.NotNil(t, page.Results[0].SortValue)
		require.Equal(t, "1500000", *page.Results[0].SortValue)
		require.Nil(t, page.Results[1].SortValue)

		q.Sort = &instancesearch.Sort{Field: instancesearch.SortClearParse, ParseScope: instancesearch.ParseScopeServer}
		page = f.search(t, f.tenantA, q)
		require.Equal(t, []string{"Alpha", "Beta"}, []string{page.Results[0].GuildName, page.Results[1].GuildName})

		q.Sort = &instancesearch.Sort{Field: instancesearch.SortStartedAt, Direction: instancesearch.SortAsc}
		ascending := f.search(t, f.tenantA, q)
		q.Sort.Direction = instancesearch.SortDesc
		descending := f.search(t, f.tenantA, q)
		require.Equal(t, ascending.Results[0].ID, descending.Results[1].ID)
		require.Equal(t, ascending.Results[1].ID, descending.Results[0].ID)
	})

	t.Run("Pagination", func(t *testing.T) {
		t.Parallel()
		q := where(t, `{"any_encounter": {"field": "encounter.name", "op": "=", "value": "Ragnaros"}}`)
		q.Limit = 1
		first := f.search(t, f.tenantA, q)
		require.Len(t, first.Results, 1)
		require.NotNil(t, first.Next)
		require.NotNil(t, first.Next.Value)
		require.Equal(t, instancesearch.Sort{Field: instancesearch.SortStartedAt, Direction: instancesearch.SortDesc}, first.Next.Sort)

		q.Cursor = first.Next
		second := f.search(t, f.tenantA, q)
		require.Len(t, second.Results, 1)
		require.Nil(t, second.Next)
		require.NotEqual(t, first.Results[0].ID, second.Results[0].ID)
	})
}
