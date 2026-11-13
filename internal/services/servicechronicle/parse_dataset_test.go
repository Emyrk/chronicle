package servicechronicle

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicedataset"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type resolutionTestStore struct {
	database.Store
	calls    []string
	realmErr error
	server   database.LockServerDatasetResolutionRow
	tenant   database.LockTenantDatasetResolutionRow
	selected uuid.UUID
	revision int64
}

func (s *resolutionTestStore) LockRealmDatasetResolution(context.Context, uuid.UUID) (uuid.UUID, error) {
	s.calls = append(s.calls, "realm")
	return uuid.New(), s.realmErr
}
func (s *resolutionTestStore) LockServerDatasetResolution(context.Context, uuid.UUID) (database.LockServerDatasetResolutionRow, error) {
	s.calls = append(s.calls, "server")
	return s.server, nil
}
func (s *resolutionTestStore) LockTenantDatasetResolution(context.Context, uuid.UUID) (database.LockTenantDatasetResolutionRow, error) {
	s.calls = append(s.calls, "tenant")
	return s.tenant, nil
}
func (s *resolutionTestStore) LockDatasetForResolution(_ context.Context, id uuid.UUID) (database.LockDatasetForResolutionRow, error) {
	s.calls = append(s.calls, "dataset")
	s.selected = id
	return database.LockDatasetForResolutionRow{Revision: s.revision, DefaultFlavor: []string{"vanilla"}}, nil
}

func TestParseDatasetResolutionLocksPrecedence(t *testing.T) {
	t.Parallel()
	for _, mode := range []string{"default", "tenant", "server"} {
		t.Run(mode, func(t *testing.T) {
			t.Parallel()
			store := &resolutionTestStore{revision: 5}
			want := servicedataset.DefaultDatasetID
			calls := []string{"realm", "server", "dataset"}
			if mode != "default" {
				store.server.TenantID = uuid.NullUUID{UUID: uuid.New(), Valid: true}
				store.tenant.TenantDatasetID = uuid.NullUUID{UUID: uuid.New(), Valid: true}
				store.tenant.AdditionalFlavor = []string{"tbc"}
				want = store.tenant.TenantDatasetID.UUID
				calls = []string{"realm", "server", "tenant", "dataset"}
			}
			if mode == "server" {
				store.server.ServerDatasetID = uuid.NullUUID{UUID: uuid.New(), Valid: true}
				want = store.server.ServerDatasetID.UUID
			}
			resolved, err := resolveParseDataset(t.Context(), store, uuid.New(), true)
			require.NoError(t, err)
			require.Equal(t, want, resolved.DatasetID)
			require.Equal(t, want, store.selected)
			require.Equal(t, int64(5), resolved.Revision)
			require.Equal(t, calls, store.calls)
			if mode != "default" {
				require.Equal(t, database.WoWFlavor{database.FlavorTBC}, resolved.AdditionalFlavor)
			}
		})
	}
}
func TestParseDatasetMissingRealmDoesNotFallback(t *testing.T) {
	t.Parallel()
	store := &resolutionTestStore{realmErr: pgx.ErrNoRows}
	_, err := resolveParseDataset(t.Context(), store, uuid.New(), true)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	require.Equal(t, []string{"realm"}, store.calls)
}
func TestParseDatasetInvalidRevisionFails(t *testing.T) {
	t.Parallel()
	_, err := resolveParseDataset(t.Context(), &resolutionTestStore{}, uuid.New(), true)
	require.ErrorContains(t, err, "invalid parse dataset identity")
}
