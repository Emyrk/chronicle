package gamedataapi

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
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
