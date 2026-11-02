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
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM rating_group_boss_policies WHERE group_id = $1
        AND instance_name <> 'Molten Core'`, vanillaGroup).Scan(&count))
	require.Zero(t, count, "vanilla template only defines MC")
}
