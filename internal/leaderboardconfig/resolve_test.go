package leaderboardconfig_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

type captureStore struct {
	flavors []string
	rows    []database.ResolveLeaderboardConfigurationRow
}

func (s *captureStore) ResolveLeaderboardConfiguration(_ context.Context, flavors []string) ([]database.ResolveLeaderboardConfigurationRow, error) {
	s.flavors = flavors
	return s.rows, nil
}

func TestProjectionAndConflict(t *testing.T) {
	t.Parallel()
	db := &captureStore{}
	_, err := leaderboardconfig.Resolve(t.Context(), db, database.WoWFlavor{database.FlavorVanilla, database.FlavorOctoWoW}, database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath, database.FlavorCapybara, database.FlavorRavencraft, "unknown"})
	require.NoError(t, err)
	require.Equal(t, []string{"vanilla", "wrath"}, db.flavors)
	db.rows = []database.ResolveLeaderboardConfigurationRow{{Kind: "conflict", EncounterName: "boss/test", ConflictingProperty: "enabled"}}
	rows, err := leaderboardconfig.Resolve(t.Context(), db, nil, nil)
	require.ErrorIs(t, err, leaderboardconfig.ErrConflict)
	require.Nil(t, rows)
}

type fixture struct {
	t   *testing.T
	ctx context.Context
	db  database.Store
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	f := fixture{t, ctx, db}
	f.layer("fixture-base", []string{"fixture-base"})
	require.NoError(t, db.InsertLeaderboardInstances(ctx, "fixture-instance"))
	require.NoError(t, db.InsertLeaderboardInstanceOverrides(ctx, database.InsertLeaderboardInstanceOverridesParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", Enabled: true}))
	require.NoError(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "fixture-instance", DifficultyName: "Normal", MaxPlayers: 40}))
	require.NoError(t, db.InsertLeaderboardVariantOverrides(ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", DifficultyName: "Normal", MaxPlayers: 40, Enabled: true}))
	require.NoError(t, db.InsertLeaderboardSets(ctx, database.InsertLeaderboardSetsParams{InstanceName: "fixture-instance", SetKey: "default", Name: "Default"}))
	require.NoError(t, db.InsertLeaderboardSetOverrides(ctx, database.InsertLeaderboardSetOverridesParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", SetKey: "default", Enabled: true}))
	for i, boss := range []string{"A", "B", "C"} {
		require.NoError(t, db.InsertLeaderboardBosses(ctx, database.InsertLeaderboardBossesParams{InstanceName: "fixture-instance", EncounterName: boss}))
		f.boss("fixture-base", boss, true)
		require.NoError(t, db.InsertLeaderboardSetMembers(ctx, database.InsertLeaderboardSetMembersParams{InstanceName: "fixture-instance", SetKey: "default", EncounterName: boss}))
		require.NoError(t, db.InsertLeaderboardMemberOverrides(ctx, database.InsertLeaderboardMemberOverridesParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", SetKey: "default", EncounterName: boss, Enabled: pgtype.Bool{Bool: true, Valid: true}, Position: pgtype.Int4{Int32: int32(3 - i), Valid: true}}))
	}
	require.NoError(t, db.InsertLeaderboardBossRenown(ctx, database.InsertLeaderboardBossRenownParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", EncounterName: "A", Points: 5}))
	require.NoError(t, db.InsertLeaderboardBossRenown(ctx, database.InsertLeaderboardBossRenownParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", EncounterName: "C", Points: 0}))
	return f
}
func (f fixture) layer(key string, tags []string) {
	f.t.Helper()
	require.NoError(f.t, f.db.InsertLeaderboardLayers(f.ctx, database.InsertLeaderboardLayersParams{Key: key, RequiredFlavors: tags}))
}
func (f fixture) boss(layer, boss string, enabled bool) {
	f.t.Helper()
	require.NoError(f.t, f.db.InsertLeaderboardBossOverrides(f.ctx, database.InsertLeaderboardBossOverridesParams{LayerKey: layer, InstanceName: "fixture-instance", EncounterName: boss, Enabled: enabled}))
}
func (f fixture) rows(tags ...string) []database.ResolveLeaderboardConfigurationRow {
	f.t.Helper()
	rows, err := f.db.ResolveLeaderboardConfiguration(f.ctx, tags)
	require.NoError(f.t, err)
	return rows
}
func selectKind(rows []database.ResolveLeaderboardConfigurationRow, kind string) []database.ResolveLeaderboardConfigurationRow {
	var out []database.ResolveLeaderboardConfigurationRow
	for _, r := range rows {
		if r.Kind == kind {
			out = append(out, r)
		}
	}
	return out
}

func TestResolution(t *testing.T) {
	t.Parallel()
	t.Run("inactive and subset inheritance", func(t *testing.T) {
		t.Parallel()
		f := newFixture(t)
		require.Empty(t, f.rows("unrelated"))
		rows := f.rows("fixture-base", "extra")
		members := selectKind(rows, "member")
		require.Len(t, members, 3)
		require.Equal(t, []string{"C", "B", "A"}, []string{members[0].EncounterName, members[1].EncounterName, members[2].EncounterName})
		awards := selectKind(rows, "boss_variant")
		require.Len(t, awards, 3)
		require.True(t, awards[0].HasPoints)
		require.Equal(t, float64(5), awards[0].Points)
		require.False(t, awards[1].HasPoints)
		require.True(t, awards[2].HasPoints)
		require.Zero(t, awards[2].Points)
	})
	t.Run("strict superset excludes boss and renown", func(t *testing.T) {
		t.Parallel()
		f := newFixture(t)
		f.layer("specific", []string{"extra", "fixture-base"})
		f.boss("specific", "A", false)
		rows := f.rows("fixture-base", "extra")
		require.Len(t, selectKind(rows, "member"), 2)
		require.Len(t, selectKind(rows, "boss_variant"), 2)
	})
	for _, tags := range [][]string{{"other"}, {"other", "third"}} {
		t.Run("incomparable "+tags[len(tags)-1], func(t *testing.T) {
			t.Parallel()
			f := newFixture(t)
			f.layer("incomparable", tags)
			f.boss("incomparable", "A", false)
			rows := f.rows(append([]string{"fixture-base"}, tags...)...)
			require.NotEmpty(t, rows)
			for _, r := range rows {
				require.Equal(t, "conflict", r.Kind)
			}
		})
	}
	t.Run("compatible incomparable assignments", func(t *testing.T) {
		t.Parallel()
		f := newFixture(t)
		f.layer("compatible", []string{"other", "third"})
		f.boss("compatible", "A", true)
		require.Len(t, selectKind(f.rows("fixture-base", "other", "third"), "member"), 3)
	})
	t.Run("dominating layer resolves conflicting ancestors", func(t *testing.T) {
		t.Parallel()
		f := newFixture(t)
		f.layer("other", []string{"other"})
		f.boss("other", "A", false)
		f.layer("both", []string{"fixture-base", "other"})
		f.boss("both", "A", true)
		require.Len(t, selectKind(f.rows("fixture-base", "other"), "member"), 3)
	})
	t.Run("zero variant override and independent membership", func(t *testing.T) {
		t.Parallel()
		f := newFixture(t)
		require.NoError(t, f.db.InsertLeaderboardVariantRenown(f.ctx, database.InsertLeaderboardVariantRenownParams{LayerKey: "fixture-base", InstanceName: "fixture-instance", EncounterName: "A", DifficultyName: "Normal", MaxPlayers: 40, Points: 0}))
		f.layer("specific", []string{"extra", "fixture-base"})
		require.NoError(t, f.db.InsertLeaderboardMemberOverrides(f.ctx, database.InsertLeaderboardMemberOverridesParams{LayerKey: "specific", InstanceName: "fixture-instance", SetKey: "default", EncounterName: "A", Enabled: pgtype.Bool{Valid: true}}))
		rows := f.rows("fixture-base", "extra")
		require.Len(t, selectKind(rows, "member"), 2)
		awards := selectKind(rows, "boss_variant")
		require.Len(t, awards, 3)
		require.True(t, awards[0].HasPoints)
		require.Zero(t, awards[0].Points)
	})
	for _, parent := range []string{"instance", "set", "variant"} {
		t.Run("disabled "+parent, func(t *testing.T) {
			t.Parallel()
			f := newFixture(t)
			f.layer("specific", []string{"extra", "fixture-base"})
			switch parent {
			case "instance":
				require.NoError(t, f.db.InsertLeaderboardInstanceOverrides(f.ctx, database.InsertLeaderboardInstanceOverridesParams{LayerKey: "specific", InstanceName: "fixture-instance", Enabled: false}))
			case "set":
				require.NoError(t, f.db.InsertLeaderboardSetOverrides(f.ctx, database.InsertLeaderboardSetOverridesParams{LayerKey: "specific", InstanceName: "fixture-instance", SetKey: "default", Enabled: false}))
			case "variant":
				require.NoError(t, f.db.InsertLeaderboardVariantOverrides(f.ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "specific", InstanceName: "fixture-instance", DifficultyName: "Normal", MaxPlayers: 40, Enabled: false}))
			}
			rows := f.rows("fixture-base", "extra")
			switch parent {
			case "instance":
				require.Empty(t, rows)
			case "set":
				require.Empty(t, selectKind(rows, "member"))
				require.Len(t, selectKind(rows, "boss_variant"), 3)
			default:
				require.Empty(t, selectKind(rows, "boss_variant"))
				require.Len(t, selectKind(rows, "boss"), 3)
			}
		})
	}
}
