package spells_test

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/spells"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNewFetcherDBOnly_NoDBC(t *testing.T) {
	t.Parallel()

	// NewFetcherDBOnly should not panic and should produce a valid fetcher
	// even without a DBC file or pool.
	f := spells.NewFetcherDBOnly(context.Background(), nil, nil, nil, 100)
	require.NotNil(t, f)

	// TotalSpells and RangeSpells should be safe with nil DBC.
	require.Equal(t, 0, f.TotalSpells())
	require.NoError(t, f.RangeSpells(func(_ *chrondbc.Spell) bool {
		t.Fatal("should not be called")
		return false
	}))
}

func TestFetcherDBOnly_NoFallback(t *testing.T) {
	t.Parallel()

	// With no pool and DB-only mode, Spell() should return not-found, never
	// panic or attempt DBC fallback.
	f := spells.NewFetcherDBOnly(context.Background(), nil, nil, nil, 100)

	_, err := f.Spell(context.Background(), uuid.New(), 12345)
	require.Error(t, err)
	require.True(t, chrondbc.IsSpellNotFound(err))
}

func TestFetcherDBOnly_CustomSpellsStillWork(t *testing.T) {
	t.Parallel()

	custom := map[chrondbc.SpellID]chrondbc.Spell{
		6603: {ID: 6603}, // auto-attack
	}
	f := spells.NewFetcherDBOnly(context.Background(), nil, custom, nil, 100)

	sp, err := f.Spell(context.Background(), uuid.New(), 6603)
	require.NoError(t, err)
	require.NotNil(t, sp)
	require.Equal(t, chrondbc.SpellID(6603), sp.ID)
}
