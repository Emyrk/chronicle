package pageload

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/database"
)

// fakeStore serves one instance and counts its lookups. err, when set, is
// returned by every lookup.
type fakeStore struct {
	InstanceStore
	inst     database.LogInstancesGuild
	unlisted bool
	err      error
	calls    map[string]int
}

func (f *fakeStore) InstanceWithUnlisted(_ context.Context, id uuid.UUID) (database.InstanceWithUnlistedRow, error) {
	f.calls["InstanceWithUnlisted"]++
	if f.err != nil {
		return database.InstanceWithUnlistedRow{}, f.err
	}
	if id != f.inst.ID {
		return database.InstanceWithUnlistedRow{}, pgx.ErrNoRows
	}
	return database.InstanceWithUnlistedRow{LogInstancesGuild: f.inst, Unlisted: f.unlisted}, nil
}

func (f *fakeStore) PublicInstanceBySlug(_ context.Context, slug pgtype.Text) (database.LogInstancesGuild, error) {
	f.calls["PublicInstanceBySlug"]++
	if f.err != nil {
		return database.LogInstancesGuild{}, f.err
	}
	if f.unlisted || slug.String != f.inst.HashedSlug.String {
		return database.LogInstancesGuild{}, pgx.ErrNoRows
	}
	return f.inst, nil
}

func newFake() *fakeStore {
	return &fakeStore{
		inst:  database.LogInstancesGuild{ID: uuid.New(), Name: "Molten Core", HashedSlug: pgtype.Text{String: "slug", Valid: true}},
		calls: map[string]int{},
	}
}

func TestPublicInstanceReusesUnlistedLookup(t *testing.T) {
	t.Parallel()
	store := newFake()
	ctx := WithCache(context.Background())
	id := store.inst.ID.String()

	inst, err := InstanceWithUnlisted(ctx, store, id)
	require.NoError(t, err)
	require.False(t, inst.Unlisted)
	got, err := PublicInstance(ctx, store, id)
	require.NoError(t, err)
	require.Equal(t, store.inst, got)
	require.Equal(t, map[string]int{"InstanceWithUnlisted": 1}, store.calls)

	store.unlisted = true
	ctx = WithCache(context.Background())
	_, err = InstanceWithUnlisted(ctx, store, id)
	require.NoError(t, err)
	_, err = PublicInstance(ctx, store, id)
	require.ErrorIs(t, err, pgx.ErrNoRows, "an unlisted instance is not public")
}

func TestLoadCachesNotFoundButNotFailures(t *testing.T) {
	t.Parallel()
	store := newFake()
	ctx := WithCache(context.Background())

	for range 2 {
		_, err := PublicInstance(ctx, store, "missing")
		require.ErrorIs(t, err, pgx.ErrNoRows)
	}
	require.Equal(t, 1, store.calls["PublicInstanceBySlug"], "not found is cached")

	store.err = context.DeadlineExceeded
	for range 2 {
		_, err := PublicInstance(ctx, store, "slug")
		require.ErrorIs(t, err, context.DeadlineExceeded)
	}
	require.Equal(t, 3, store.calls["PublicInstanceBySlug"], "a timeout is retried")
}

func TestNoCacheQueriesEveryTime(t *testing.T) {
	t.Parallel()
	store := newFake()
	for range 2 {
		_, err := PublicInstance(context.Background(), store, "slug")
		require.NoError(t, err)
	}
	require.Equal(t, 2, store.calls["PublicInstanceBySlug"])
}
