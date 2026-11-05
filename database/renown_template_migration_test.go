package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const turtleServerID = "10ac9e23-ff74-43ed-83ad-96c123017097"
const createRenownGroupPolicy = `INSERT INTO rating_group_policies
    (group_id, version, period_days, half_life_days, best_weight, form_weight,
     floor_weight, rank_one_weight, full_rank_kills)
    VALUES ($1, 1, 28, 14, 0.5, 0.3, 0.2, 0.5, 10)`

func TestRenownTemplateAppliesOnlyToNewGroupPolicies(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	ctx := t.Context()

	turtleGroup := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
        VALUES ($1, $2, $3)`, turtleGroup, turtleServerID, t.Name())
	require.NoError(t, err)
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1`, turtleGroup).Scan(&count))
	require.Zero(t, count, "a group without an explicit policy has no awards")

	_, err = pool.Exec(ctx, createRenownGroupPolicy, turtleGroup)
	require.NoError(t, err)
	var points float64
	for _, name := range []string{"Gri'lek", "Hazza'rah", "Renataki", "Wushoolay"} {
		require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
            WHERE group_id = $1 AND instance_name = 'Zul''Gurub' AND encounter_name = $2`, turtleGroup, name).Scan(&points))
		require.Equal(t, 1.0, points, name)
	}
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Gehennas'`, turtleGroup).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Ragnaros'`, turtleGroup).Scan(&points))
	require.Equal(t, 5.0, points)

	require.NoError(t, pool.QueryRow(ctx, `SELECT sum(renown_points)
		FROM rating_group_boss_policies WHERE group_id = $1 AND instance_name = 'Zul''Gurub'
		AND encounter_name NOT IN ('Hazza''rah', 'Renataki', 'Wushoolay')`, turtleGroup).Scan(&points))
	require.Equal(t, 7.0, points, "only one Edge of Madness variant is available per reset")

	var version int
	require.NoError(t, pool.QueryRow(ctx, `SELECT version FROM rating_group_policies WHERE group_id = $1`, turtleGroup).Scan(&version))
	require.Equal(t, 1, version, "initial template rows must not inflate the configured policy version")
	for _, raid := range []struct {
		name   string
		points float64
	}{
		{"Molten Core", 17}, {"Blackwing Lair", 25}, {"Naxxramas", 50},
		{"Ruins of Ahn'Qiraj", 8}, {"Temple of Ahn'Qiraj", 35},
		{"Timbermaw Hold", 35}, {"Lower Tower of Karazhan", 6},
		{"Upper Tower of Karazhan", 55},
	} {
		require.NoError(t, pool.QueryRow(ctx, `SELECT sum(renown_points)
			FROM rating_group_boss_policies WHERE group_id = $1 AND instance_name = $2`, turtleGroup, raid.name).Scan(&points))
		require.Equal(t, raid.points, points, raid.name)
	}

	// Template application is INSERT-only: admin changes and policy updates cannot reset it.
	_, err = pool.Exec(ctx, `UPDATE rating_group_boss_policies SET renown_points = 42
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Ragnaros'`, turtleGroup)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `UPDATE rating_group_policies SET period_days = 30 WHERE group_id = $1`, turtleGroup)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Ragnaros'`, turtleGroup).Scan(&points))
	require.Equal(t, 42.0, points)

	datasetID := uuid.New()
	vanillaServer := uuid.New()
	vanillaGroup := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor)
        VALUES ($1, 'Vanilla', $2, '1.12', ARRAY['vanilla']::text[])`, datasetID, "vanilla-"+uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers (id, name, default_dataset_id)
        VALUES ($1, 'Kronos test', $2)`, vanillaServer, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
        VALUES ($1, $2, 'Vanilla')`, vanillaGroup, vanillaServer)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, createRenownGroupPolicy, vanillaGroup)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Gehennas'`, vanillaGroup).Scan(&points))
	require.Equal(t, 1.0, points)
	// Every vanilla boss is shared, while custom Turtle bosses are tagged only
	// nightmare-of-ursol and never seeded on a vanilla-only server.
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1
        AND instance_name = 'Naxxramas'`, vanillaGroup).Scan(&count))
	require.Equal(t, 15, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1
        AND instance_name = 'Lower Tower of Karazhan'`, vanillaGroup).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM (
        SELECT instance_name, encounter_name FROM rating_group_boss_policies WHERE group_id = $1
        EXCEPT
        SELECT instance_name, encounter_name FROM rating_renown_template_bosses WHERE flavor = 'vanilla' AND version = 1
    ) unexpected`, vanillaGroup).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM (
        SELECT instance_name, encounter_name FROM rating_renown_template_bosses WHERE flavor = 'vanilla' AND version = 1
        EXCEPT
        SELECT instance_name, encounter_name FROM rating_group_boss_policies WHERE group_id = $1
    ) missing`, vanillaGroup).Scan(&count))
	require.Zero(t, count)

	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM (
        SELECT instance_name, encounter_name FROM rating_group_boss_policies WHERE group_id = $1
        EXCEPT
        SELECT instance_name, encounter_name FROM rating_renown_template_bosses
        WHERE version = 1 AND flavor IN ('vanilla', 'nightmare-of-ursol')
          AND NOT (instance_name = 'Molten Core' AND encounter_name = 'Gehennas')
    ) unexpected`, turtleGroup).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM (
        SELECT instance_name, encounter_name FROM rating_renown_template_bosses
        WHERE version = 1 AND flavor IN ('vanilla', 'nightmare-of-ursol')
          AND NOT (instance_name = 'Molten Core' AND encounter_name = 'Gehennas')
        EXCEPT
        SELECT instance_name, encounter_name FROM rating_group_boss_policies WHERE group_id = $1
    ) missing`, turtleGroup).Scan(&count))
	require.Zero(t, count)

	// A Nightmare-flavored dataset composes the same shared vanilla inventory
	// with Turtle additions, even when the server is not the legacy Turtle UUID.
	nightmareDataset := uuid.New()
	nightmareServer := uuid.New()
	nightmareGroup := uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor)
        VALUES ($1, 'Nightmare test', $2, '1.12', ARRAY['nightmare-of-ursol']::text[])`, nightmareDataset, "nightmare-"+uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers (id, name, default_dataset_id)
        VALUES ($1, 'Nightmare test', $2)`, nightmareServer, nightmareDataset)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
        VALUES ($1, $2, 'Nightmare')`, nightmareGroup, nightmareServer)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, createRenownGroupPolicy, nightmareGroup)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Molten Core' AND encounter_name = 'Gehennas'`, nightmareGroup).Scan(&count))
	require.Zero(t, count)
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Lower Tower of Karazhan' AND encounter_name = 'Moroes'`, nightmareGroup).Scan(&points))
	require.Equal(t, 2.0, points)
}

func TestWrathRenownDoesNotInheritLowerExpansionTemplates(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	ctx := t.Context()

	tenantID, datasetID, serverID, realmID, groupID := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO tenants (id, name) VALUES ($1, 'Wrath Renown Tenant')`, tenantID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor)
		VALUES ($1, 'Wrath progression', $2, '3.3.5', ARRAY['vanilla', 'tbc', 'wrath']::text[])`, datasetID, "wrath-renown-"+uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers (id, name, tenant_id, default_dataset_id)
		VALUES ($1, 'Wrath progression', $2, $3)`, serverID, tenantID, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_server_realms (id, server_id, name)
		VALUES ($1, $2, 'Wrath progression')`, realmID, serverID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
		VALUES ($1, $2, 'Wrath progression')`, groupID, serverID)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, createRenownGroupPolicy, groupID)
	require.NoError(t, err)
	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1`, groupID).Scan(&count))
	require.Zero(t, count, "Wrath groups must not inherit Vanilla or TBC Renown bosses")

	var generationID uuid.UUID
	require.NoError(t, pool.QueryRow(ctx, `SELECT start_tenant_rating_rebuild($1, now(), now())`, tenantID).Scan(&generationID))
	var rulesVersion int
	require.NoError(t, pool.QueryRow(ctx, `SELECT (manifest->>'rules_version')::int,
		jsonb_array_length(manifest->'renown_bosses')
		FROM rating_rebuild_checkpoints WHERE generation_id = $1`, generationID).Scan(&rulesVersion, &count))
	require.Equal(t, 3, rulesVersion)
	require.Zero(t, count, "Wrath tenant manifests must not award lower-expansion raid Renown")
}

func TestVanillaPlusRenownDefaults(t *testing.T) {
	t.Parallel()
	pool, _ := dbtestutil.NewPGXPool(t)
	ctx := t.Context()

	datasetID, serverID, groupID := uuid.New(), uuid.New(), uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor)
        VALUES ($1, 'Vanilla Plus test', $2, '1.12', ARRAY['vanilla', 'vanillaplus']::text[])`, datasetID, "vanillaplus-"+uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers (id, name, default_dataset_id)
        VALUES ($1, 'Vanilla Plus test', $2)`, serverID, datasetID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
        VALUES ($1, $2, 'Vanilla Plus')`, groupID, serverID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, createRenownGroupPolicy, groupID)
	require.NoError(t, err)

	var hermitPoints float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Zul''Gurub' AND encounter_name = 'The Nameless Hermit'`, groupID).Scan(&hermitPoints))
	require.Equal(t, 1.0, hermitPoints)

	var azusPoints float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Zul''Gurub' AND encounter_name = 'Azus the Bloodseeker'`, groupID).Scan(&azusPoints))
	require.Equal(t, 1.0, azusPoints)

	for name, want := range map[string]float64{
		"Master Elemental Shaper Krixix": 2,
		"Elementium Decapitator Mk III":  2,
		"Razorgore the Untamed":          2, // Shared vanilla boss.
	} {
		var points float64
		require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
            WHERE group_id = $1 AND instance_name = 'Blackwing Lair' AND encounter_name = $2`, groupID, name).Scan(&points))
		require.Equal(t, want, points, name)
	}

	for name, want := range map[string]float64{
		"Loksey": 1, "Brother Michael": 1, "Brigitte Abbendis": 1,
		"Fairbanks": 1, "Doan": 1, "Vishas": 1, "Herod": 1,
		"Mograine & Whitemane": 3,
	} {
		var points float64
		require.NoError(t, pool.QueryRow(ctx, `SELECT renown_points FROM rating_group_boss_policies
            WHERE group_id = $1 AND instance_name = 'Scarlet Monastery' AND encounter_name = $2`, groupID, name).Scan(&points))
		require.Equal(t, want, points, name)
	}
	var count int
	var total float64
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*), sum(renown_points) FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Scarlet Monastery'`, groupID).Scan(&count, &total))
	require.Equal(t, 8, count)
	require.Equal(t, 10.0, total)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies
        WHERE group_id = $1 AND instance_name = 'Blackwing Lair' AND encounter_name = 'Ezzel Darkbrewer'`, groupID).Scan(&count))
	require.Zero(t, count, "Nightmare-only bosses do not appear on Vanilla Plus")

	vanillaOnlyDataset, vanillaOnlyServer, vanillaOnlyGroup := uuid.New(), uuid.New(), uuid.New()
	_, err = pool.Exec(ctx, `INSERT INTO datasets (id, name, slug, wow_version, default_flavor)
        VALUES ($1, 'Vanilla only test', $2, '1.12', ARRAY['vanilla']::text[])`, vanillaOnlyDataset, "vanilla-only-"+uuid.NewString())
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO wow_servers (id, name, default_dataset_id)
        VALUES ($1, 'Vanilla only test', $2)`, vanillaOnlyServer, vanillaOnlyDataset)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO rating_realm_groups (id, server_id, name)
        VALUES ($1, $2, 'Vanilla only')`, vanillaOnlyGroup, vanillaOnlyServer)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, createRenownGroupPolicy, vanillaOnlyGroup)
	require.NoError(t, err)
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1
        AND (instance_name = 'Scarlet Monastery' OR encounter_name = 'Master Elemental Shaper Krixix'
             OR encounter_name = 'Elementium Decapitator Mk III')`, vanillaOnlyGroup).Scan(&count))
	require.Zero(t, count, "Vanilla Plus bosses stay flavor-specific")
}
