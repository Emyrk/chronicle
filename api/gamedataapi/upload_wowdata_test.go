package gamedataapi

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/spelldb"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/Emyrk/chronicle/internal/wowdata"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
)

func TestNonNilItemIDs(t *testing.T) {
	t.Parallel()

	require.Equal(t, []int32{}, nonNilItemIDs(nil))
	require.Equal(t, []int32{1, 2}, nonNilItemIDs([]int32{1, 2}))
}

func TestPersistNormalizedSpellsReplacesDatasetRows(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Modern spells", Slug: "modern-spells", WowVersion: "1.60.1", BuildVersion: 69913,
		DefaultFlavor: []string{}, IconBaseUrl: "",
	})
	require.NoError(t, err)

	first := &wowdata.Import{
		SpellEffects: []wowdata.SpellEffect{{SourceID: 1, SpellID: 999, DifficultyID: 2, EffectIndex: 4, Effect: 6, EffectMiscValue: []int32{7, 8}}},
		SpellPowers:  []wowdata.SpellPower{{SourceID: 2, SpellID: 999, OrderIndex: 1, ManaCost: 42}},
		SpellVariants: []wowdata.SpellVariant{{
			SpellID: 999, DifficultyID: 2,
			Misc:         &wowdata.SpellMisc{SourceID: 3, Attributes: []int32{1, 2, 3}, SchoolMask: 4},
			ClassOptions: &wowdata.SpellClassOptions{SourceID: 4, SpellClassMask: []int32{5, 6, 7, 8}},
		}},
	}
	require.NoError(t, store.InTx(ctx, func(tx database.Store) error { return persistNormalizedSpells(ctx, tx, dataset.ID, first) }, nil))

	var effects, powers, variants int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_effects WHERE dataset_id=$1`, dataset.ID).Scan(&effects))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_powers WHERE dataset_id=$1`, dataset.ID).Scan(&powers))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_variants WHERE dataset_id=$1`, dataset.ID).Scan(&variants))
	require.Equal(t, 1, effects)
	require.Equal(t, 1, powers)
	var classMask []int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT spell_class_mask FROM dbc_spell_variants WHERE dataset_id=$1 AND spell_id=999 AND difficulty_id=2`, dataset.ID).Scan(&classMask))
	require.Equal(t, []int32{5, 6, 7, 8}, classMask)
	require.Equal(t, 1, variants)

	require.NoError(t, store.InTx(ctx, func(tx database.Store) error { return persistNormalizedSpells(ctx, tx, dataset.ID, &wowdata.Import{}) }, nil))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_effects WHERE dataset_id=$1`, dataset.ID).Scan(&effects))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_powers WHERE dataset_id=$1`, dataset.ID).Scan(&powers))
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spell_variants WHERE dataset_id=$1`, dataset.ID).Scan(&variants))
	require.Zero(t, effects)
	require.Zero(t, powers)
	require.Zero(t, variants)
}

func TestPersistWowdataRollsBackLegacyRowsWhenNormalizedInsertFails(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{Name: "Atomic spells", Slug: "atomic-spells", WowVersion: "1.60.1", BuildVersion: 69913, DefaultFlavor: []string{}, IconBaseUrl: ""})
	require.NoError(t, err)

	effect := wowdata.SpellEffect{SourceID: 1, SpellID: 123, DifficultyID: 0, EffectIndex: 0}
	payload := &wowdata.Import{
		Spells:       []spelldb.SpellRow{{SpellID: 123, Name: "Must roll back"}},
		SpellEffects: []wowdata.SpellEffect{effect, effect},
	}
	err = New(nil, nil, pool, nil).persistWowdata(ctx, dataset.ID, payload)
	require.Error(t, err)

	var count int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_spells WHERE dataset_id=$1 AND spell_id=123`, dataset.ID).Scan(&count))
	require.Zero(t, count)
}

func TestPersistWowdataDerivesAndReplacesSpellMetadata(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)
	dataset, err := store.InsertDataset(ctx, database.InsertDatasetParams{
		Name: "Modern derived spells", Slug: "modern-derived-spells", WowVersion: "1.60.1", BuildVersion: 69913,
		DefaultFlavor: []string{}, IconBaseUrl: "",
	})
	require.NoError(t, err)

	const (
		extraAttackID      = 100
		periodicID         = 101
		durationModifierID = 102
		vulnerabilityID    = 103
		cooldownID         = 104
		nondefaultID       = 105
		affectedAuraID     = 106
	)
	payload := &wowdata.Import{
		Spells: []spelldb.SpellRow{
			{SpellID: extraAttackID, Name: "High-index extra attack"},
			{SpellID: periodicID, Name: "Periodic damage"},
			{SpellID: durationModifierID, Name: "Duration modifier", Attributes: []int32{1 << 6}, SpellClassSet: 8},
			{SpellID: vulnerabilityID, Name: "Vulnerability"},
			{SpellID: cooldownID, Name: "Player cooldown", SpellClassSet: int32(chrondbc.SpellClassSetMage), RecoveryTimeMs: 120_000},
			{SpellID: nondefaultID, Name: "Nondefault extra attack"},
			{SpellID: affectedAuraID, Name: "Affected aura", SpellClassSet: 8, SpellClassMask: 1, DurationIndex: 1},
		},
		SpellEffects: []wowdata.SpellEffect{
			{SourceID: 1, SpellID: extraAttackID, DifficultyID: 0, EffectIndex: 7, Effect: int32(chrondbc.EffectAddExtraAttacks), EffectBasePointsF: 2},
			{SourceID: 2, SpellID: periodicID, DifficultyID: 0, EffectIndex: 5, Effect: int32(chrondbc.EffectApplyAura), EffectAura: int32(chrondbc.AuraEffectPeriodicDamage)},
			{SourceID: 3, SpellID: durationModifierID, DifficultyID: 0, EffectIndex: 6, Effect: int32(chrondbc.EffectApplyAura), EffectAura: int32(chrondbc.AuraEffectAddPctModifier), EffectBasePointsF: 25, EffectItemType: 1, EffectMiscValue: []int32{1}},
			{SourceID: 4, SpellID: vulnerabilityID, DifficultyID: 0, EffectIndex: 8, Effect: int32(chrondbc.EffectApplyAura), EffectAura: int32(chrondbc.AuraEffectModDamagePercentTaken), EffectBasePointsF: 10, EffectMiscValue: []int32{4}},
			{SourceID: 5, SpellID: nondefaultID, DifficultyID: 2, EffectIndex: 9, Effect: int32(chrondbc.EffectAddExtraAttacks), EffectBasePointsF: 9},
		},
		SpellDurations: []wowdata.SpellDuration{{ID: 1, Duration: 10_000, MaxDuration: 10_000}},
	}

	h := New(authz.NewDatabaseOnly(testutil.Logger(t), store), nil, pool, nil)
	require.NoError(t, h.persistWowdata(ctx, dataset.ID, payload))

	var extraAttacks int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT num_extra_attacks FROM dbc_extra_attack_spells WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, extraAttackID).Scan(&extraAttacks))
	require.Equal(t, int32(2), extraAttacks)
	var nondefaultCount int
	require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM dbc_extra_attack_spells WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, nondefaultID).Scan(&nondefaultCount))
	require.Zero(t, nondefaultCount, "nondefault difficulty effects must not feed compatibility metadata")

	var hasDirect bool
	require.NoError(t, pool.QueryRow(ctx, `SELECT has_direct FROM dbc_periodic_spells WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, periodicID).Scan(&hasDirect))
	require.False(t, hasDirect)
	var percent, classSet int32
	var classMask int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT percent, spell_class_set, spell_class_mask FROM dbc_duration_modifiers WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, durationModifierID).Scan(&percent, &classSet, &classMask))
	require.Equal(t, int32(25), percent)
	require.Equal(t, int32(8), classSet)
	require.Equal(t, int64(1), classMask)

	var schoolMask int32
	var percentAffect *int32
	require.NoError(t, pool.QueryRow(ctx, `SELECT school_bitmask, percent_affect FROM dbc_vulnerability_spells WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, vulnerabilityID).Scan(&schoolMask, &percentAffect))
	require.Equal(t, int32(4), schoolMask)
	require.Equal(t, int32(10), *percentAffect)
	var recoveryMS int64
	require.NoError(t, pool.QueryRow(ctx, `SELECT recovery_time_ms FROM dbc_cooldown_spells WHERE dataset_id=$1 AND spell_id=$2`, dataset.ID, cooldownID).Scan(&recoveryMS))
	require.Equal(t, int64(120_000), recoveryMS)

	affected, err := store.ListAffectedAuraDurationsByDataset(ctx, dataset.ID)
	require.NoError(t, err)
	require.Len(t, affected, 1)
	require.Equal(t, int32(affectedAuraID), affected[0].SpellID)
	require.Equal(t, int32(durationModifierID), affected[0].ModifierSpellID)
	require.Equal(t, int64(12_500), affected[0].MaxDurationMs)

	require.NoError(t, h.persistWowdata(ctx, dataset.ID, &wowdata.Import{}))
	for _, table := range []string{
		"dbc_extra_attack_spells", "dbc_periodic_spells", "dbc_duration_modifiers",
		"dbc_vulnerability_spells", "dbc_cooldown_spells", "dbc_affected_aura_durations",
	} {
		var count int
		require.NoError(t, pool.QueryRow(ctx, `SELECT count(*) FROM `+table+` WHERE dataset_id=$1`, dataset.ID).Scan(&count))
		require.Zero(t, count, table)
	}
}

func TestUploadWowdataSnapshotRejectsInvalidRequests(t *testing.T) {
	t.Parallel()
	h := New(nil, nil, nil, nil)

	t.Run("dataset ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/datasets/nope/wowdata-snapshot", bytes.NewBufferString(`{}`))
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("gzip", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPut, "/datasets/00000000-0000-0000-0000-000000000001/wowdata-snapshot", bytes.NewBufferString("not gzip"))
		req.Header.Set("Content-Encoding", "gzip")
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("metadata", func(t *testing.T) {
		var body bytes.Buffer
		gz := gzip.NewWriter(&body)
		_, err := gz.Write([]byte(`{"format":"wrong"}`))
		require.NoError(t, err)
		require.NoError(t, gz.Close())
		req := httptest.NewRequest(http.MethodPut, "/datasets/00000000-0000-0000-0000-000000000001/wowdata-snapshot", &body)
		req.Header.Set("Content-Encoding", "gzip")
		rec := httptest.NewRecorder()
		r := chi.NewRouter()
		r.Put("/datasets/{datasetID}/wowdata-snapshot", h.UploadWowdataSnapshot)
		r.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})
}
