package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestClassBuffIgnores(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitShort)
	pool, _ := dbtestutil.NewPGXPool(t)
	store := database.New(pool)

	require.NoError(t, store.UpsertClassBuffIgnore(ctx, "  Power Word: Fortitude  "))
	require.NoError(t, store.UpsertClassBuffIgnore(ctx, "power word: fortitude"))

	names, err := store.ListClassBuffIgnores(ctx)
	require.NoError(t, err)
	require.Equal(t, []string{"power word: fortitude"}, names)

	require.NoError(t, store.DeleteClassBuffIgnore(ctx, "POWER WORD: FORTITUDE"))
	names, err = store.ListClassBuffIgnores(ctx)
	require.NoError(t, err)
	require.Empty(t, names)
}
