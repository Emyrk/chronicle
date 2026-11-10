package leaderboardconfig_test

import (
	"context"
	"math"
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/leaderboardconfig"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func careerVariant(t *testing.T, pool leaderboardconfig.CareerPool, name, difficulty string, size int16) leaderboardconfig.CareerVariant {
	t.Helper()
	for _, v := range pool.Variants {
		if v.Instance == name && v.Difficulty == difficulty && v.MaxPlayers == size {
			return v
		}
	}
	t.Fatalf("missing variant %s/%s/%d", name, difficulty, size)
	return leaderboardconfig.CareerVariant{}
}

func TestCareerPool(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	poolDB, _ := dbtestutil.NewPGXPool(t)
	tx, err := poolDB.Begin(ctx)
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(ctx) }()
	// Test-only transaction-local administrative setup, never application SQL.
	_, err = tx.Exec(ctx, "SET LOCAL app.tenant_bypass = 'true'")
	require.NoError(t, err)
	db := database.NewQueries(tx)
	tenant := uuid.New()
	flavors := database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath, database.FlavorNightmareOfUrsol}
	resolve := func() leaderboardconfig.CareerPool {
		p, err := leaderboardconfig.ResolveCareer(ctx, db, tenant, flavors, nil)
		require.NoError(t, err)
		return p
	}
	pool := resolve()
	require.Len(t, pool.Variants, 12)
	require.True(t, pool.AveragesReady()) // no eligible kills, so no active missing weight
	require.Equal(t, pool.Fingerprint, resolve().Fingerprint)
	for _, v := range pool.Variants {
		require.Nil(t, v.Weight)
		require.False(t, v.Active)
		require.Positive(t, v.MaxPlayers)
	}
	os := careerVariant(t, pool, "Obsidian Sanctum", "10 Player", 10)
	require.False(t, os.IncludeAverage)
	require.True(t, os.IncludeRenown)
	require.Empty(t, os.AverageBosses)
	require.Len(t, os.RenownBosses, 4)
	ulduar := careerVariant(t, pool, "Ulduar", "10 Player", 10)
	require.NotContains(t, ulduar.AverageBosses, "Flame Leviathan")
	require.Contains(t, ulduar.RenownBosses, leaderboardconfig.CareerBoss{Name: "Flame Leviathan", Points: 2, HasPoints: true})
	vanilla, err := leaderboardconfig.ResolveCareer(ctx, db, tenant, database.WoWFlavor{database.FlavorVanilla}, nil)
	require.NoError(t, err)
	require.Len(t, vanilla.Variants, 7)
	require.Equal(t, int16(0), careerVariant(t, vanilla, "Naxxramas", "", 0).MaxPlayers)

	fact := database.ReplaceLeaderboardPlayerRenownFactParams{TenantID: tenant, InstanceName: "Ulduar", DifficultyName: "10 Player", MaxPlayers: 10, EncounterName: "Flame Leviathan", RunID: uuid.New(), SourceInstanceID: uuid.New(), RealmID: uuid.New(), PlayerGuid: "player", SourceEncounterID: uuid.New()}
	insert := func(f database.ReplaceLeaderboardPlayerRenownFactParams) {
		db.ReplaceLeaderboardPlayerRenownFact(ctx, []database.ReplaceLeaderboardPlayerRenownFactParams{f}).Exec(func(_ int, err error) { require.NoError(t, err) })
	}
	insert(fact)
	pool = resolve()
	require.True(t, careerVariant(t, pool, "Ulduar", "10 Player", 10).Active)
	require.False(t, careerVariant(t, pool, "Ulduar", "25 Player", 25).Active)
	require.False(t, pool.AveragesReady())
	require.Equal(t, []leaderboardconfig.CareerIssue{{CareerKey: ulduar.CareerKey, Code: leaderboardconfig.CareerMissingWeight}}, pool.Issues)
	require.NotEqual(t, vanilla.Fingerprint, pool.Fingerprint)
	other, err := leaderboardconfig.ResolveCareer(ctx, db, uuid.New(), flavors, nil)
	require.NoError(t, err)
	require.False(t, careerVariant(t, other, "Ulduar", "10 Player", 10).Active)

	config := database.UpsertLeaderboardCareerVariantParams{InstanceName: "Ulduar", DifficultyName: "10 Player", MaxPlayers: 10, RequiredFlavors: []string{"wrath"}, IncludeAverage: true, IncludeRenown: true, Weight: pgtype.Float8{Float64: 2, Valid: true}}
	require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, config)) // test-only weight, not a seed
	weighted := resolve()
	require.True(t, weighted.AveragesReady())
	require.NotEqual(t, pool.Fingerprint, weighted.Fingerprint)
	require.Equal(t, 2.0, *careerVariant(t, weighted, "Ulduar", "10 Player", 10).Weight)
	// A current enabled-boss selection without the killed optional boss deactivates
	// the scope even while the raw fact remains (configuration exclusion).
	active, err := db.LeaderboardCareerVariantActive(ctx, database.LeaderboardCareerVariantActiveParams{TenantID: tenant, InstanceName: "Ulduar", DifficultyName: "10 Player", MaxPlayers: 10, Bosses: ulduar.AverageBosses})
	require.NoError(t, err)
	require.False(t, active)
	require.NoError(t, db.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: tenant, RunID: fact.RunID}))
	require.False(t, careerVariant(t, resolve(), "Ulduar", "10 Player", 10).Active)
	insert(fact)
	require.True(t, careerVariant(t, resolve(), "Ulduar", "10 Player", 10).Active)
	// A guild-only kill also activates a scope, independent of player subjects.
	guildRun := uuid.New()
	db.ReplaceLeaderboardGuildRenownFact(ctx, []database.ReplaceLeaderboardGuildRenownFactParams{{TenantID: tenant, InstanceName: "Obsidian Sanctum", DifficultyName: "25 Player", MaxPlayers: 25, EncounterName: "Sartharion (3 Drakes)", RunID: guildRun, SourceInstanceID: uuid.New(), RealmID: uuid.New(), GuildID: uuid.New(), SourceEncounterID: uuid.New()}}).Exec(func(_ int, err error) { require.NoError(t, err) })
	pool = resolve()
	require.True(t, careerVariant(t, pool, "Obsidian Sanctum", "25 Player", 25).Active)
	require.True(t, pool.AveragesReady()) // no OS weight needed; Renown still included
	require.NoError(t, db.DeleteLeaderboardRunEvidence(ctx, database.DeleteLeaderboardRunEvidenceParams{TenantID: tenant, RunID: guildRun}))
	require.False(t, careerVariant(t, resolve(), "Obsidian Sanctum", "25 Player", 25).Active)
	// Empty default set never silently leaves the denominator.
	vault := fact
	vault.RunID = uuid.New()
	vault.InstanceName = "Vault of Archavon"
	vault.EncounterName = "Archavon the Stone Watcher"
	insert(vault)
	pool = resolve()
	require.False(t, pool.AveragesReady())
	key := leaderboardconfig.CareerKey{Instance: "Vault of Archavon", Difficulty: "10 Player", MaxPlayers: 10}
	require.Contains(t, pool.Issues, leaderboardconfig.CareerIssue{CareerKey: key, Code: leaderboardconfig.CareerEmptyAverage})
	require.Contains(t, pool.Issues, leaderboardconfig.CareerIssue{CareerKey: key, Code: leaderboardconfig.CareerMissingWeight})
}

func TestCareerWeightConstraints(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	db, _ := dbtestutil.NewDB(t)
	arg := database.UpsertLeaderboardCareerVariantParams{InstanceName: "Naxxramas", DifficultyName: "10 Player", MaxPlayers: 10, RequiredFlavors: []string{"wrath"}, IncludeAverage: true, IncludeRenown: true}
	for _, w := range []float64{0, -1, math.Inf(1), math.Inf(-1), math.NaN()} {
		arg.Weight = pgtype.Float8{Float64: w, Valid: true}
		require.Error(t, db.UpsertLeaderboardCareerVariant(ctx, arg))
	}
	arg.Weight = pgtype.Float8{}
	require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, arg))
	arg.Weight = pgtype.Float8{Float64: 0.5, Valid: true}
	require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, arg))
	// Explicit config cannot invent an enabled heroic variant in the shared resolver.
	arg.DifficultyName = "Heroic"
	require.NoError(t, db.UpsertLeaderboardCareerVariant(ctx, arg))
	p, err := leaderboardconfig.ResolveCareer(ctx, db, uuid.New(), database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Len(t, p.Variants, 12)
	for _, v := range p.Variants {
		require.NotEqual(t, "Heroic", v.Difficulty)
	}
	// Once explicitly configured in both catalogs, Heroic is a separate tuple.
	require.NoError(t, db.InsertLeaderboardInstanceVariants(ctx, database.InsertLeaderboardInstanceVariantsParams{InstanceName: "Naxxramas", DifficultyName: "Heroic", MaxPlayers: 10}))
	require.NoError(t, db.InsertLeaderboardVariantOverrides(ctx, database.InsertLeaderboardVariantOverridesParams{LayerKey: "wrath", InstanceName: "Naxxramas", DifficultyName: "Heroic", MaxPlayers: 10, Enabled: true}))
	p, err = leaderboardconfig.ResolveCareer(ctx, db, uuid.New(), database.WoWFlavor{database.FlavorWrath}, nil)
	require.NoError(t, err)
	require.Len(t, p.Variants, 13)
	require.Equal(t, 0.5, *careerVariant(t, p, "Naxxramas", "Heroic", 10).Weight)
	require.Equal(t, 0.5, *careerVariant(t, p, "Naxxramas", "10 Player", 10).Weight)
	require.Nil(t, careerVariant(t, p, "Naxxramas", "25 Player", 25).Weight)
}

type careerCaptureStore struct {
	captureStore
	configs          []database.LeaderboardCareerVariant
	active           bool
	activationBosses []string
}

func (s *careerCaptureStore) ListLeaderboardCareerVariants(_ context.Context, _ []string) ([]database.LeaderboardCareerVariant, error) {
	return s.configs, nil
}
func (s *careerCaptureStore) LeaderboardCareerVariantActive(_ context.Context, arg database.LeaderboardCareerVariantActiveParams) (bool, error) {
	s.activationBosses = arg.Bosses
	return s.active, nil
}

func TestCareerDeterministicMembership(t *testing.T) {
	t.Parallel()
	s := &careerCaptureStore{active: true, configs: []database.LeaderboardCareerVariant{{InstanceName: "raid", DifficultyName: "Normal", MaxPlayers: 10, IncludeAverage: true, IncludeRenown: true, Weight: pgtype.Float8{Float64: 1, Valid: true}}}}
	s.rows = []database.ResolveLeaderboardConfigurationRow{
		{Kind: "instance", InstanceName: "raid"},
		{Kind: "variant", InstanceName: "raid", DifficultyName: "Normal", MaxPlayers: 10},
		{Kind: "boss", InstanceName: "raid", EncounterName: "required", Points: 5, HasPoints: true},
		{Kind: "boss", InstanceName: "raid", EncounterName: "optional", Points: 8, HasPoints: true},
		{Kind: "set", InstanceName: "raid", SetKey: "default"},
		{Kind: "member", InstanceName: "raid", SetKey: "default", EncounterName: "required"},
		{Kind: "member", InstanceName: "raid", SetKey: "other", EncounterName: "optional"},
		{Kind: "boss_variant", InstanceName: "raid", DifficultyName: "Normal", MaxPlayers: 10, EncounterName: "optional", Points: 0, HasPoints: true},
	}
	tenant := uuid.New()
	resolve := func() leaderboardconfig.CareerPool {
		p, err := leaderboardconfig.ResolveCareer(t.Context(), s, tenant, database.WoWFlavor{database.FlavorWrath, database.FlavorVanilla}, nil)
		require.NoError(t, err)
		return p
	}
	first := resolve()
	require.Equal(t, []string{"wrath"}, s.flavors)
	require.Equal(t, []string{"optional", "required"}, s.activationBosses) // explicit zero remains eligible
	require.Equal(t, []string{"required"}, first.Variants[0].AverageBosses)
	require.Equal(t, 0.0, first.Variants[0].RenownBosses[0].Points)
	require.True(t, first.AveragesReady())
	slices.Reverse(s.rows)
	require.Equal(t, first, resolve())
	// Award edits and loss of eligible evidence invalidate a persisted choice scope.
	s.rows[0].Points = 3
	changed := resolve()
	require.NotEqual(t, first.Fingerprint, changed.Fingerprint)
	s.active = false
	require.NotEqual(t, changed.Fingerprint, resolve().Fingerprint)
	// Missing default member does not fall back to another named set or all bosses.
	s.active = true
	s.rows = slices.DeleteFunc(s.rows, func(r database.ResolveLeaderboardConfigurationRow) bool {
		return r.Kind == "member" && r.SetKey == "default"
	})
	require.False(t, resolve().AveragesReady())
	// A conflict is never usable partial configuration.
	s.rows = append(s.rows, database.ResolveLeaderboardConfigurationRow{Kind: "conflict"})
	_, err := leaderboardconfig.ResolveCareer(t.Context(), s, tenant, nil, nil)
	require.ErrorIs(t, err, leaderboardconfig.ErrConflict)
}
