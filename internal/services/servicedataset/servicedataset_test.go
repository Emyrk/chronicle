package servicedataset

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type resolveDatasetStore struct {
	DatasetStore
	resolved database.ResolveDatasetByRealmRow
	err      error
}

func (s resolveDatasetStore) ResolveDatasetByRealm(context.Context, uuid.UUID) (database.ResolveDatasetByRealmRow, error) {
	return s.resolved, s.err
}

func TestResolveDatasetForRealm(t *testing.T) {
	t.Parallel()

	serverDatasetID := uuid.New()
	tenantDatasetID := uuid.New()
	tests := []struct {
		name       string
		resolved   database.ResolveDatasetByRealmRow
		err        error
		want       uuid.UUID
		wantLookup bool
	}{
		{
			name: "server dataset",
			resolved: database.ResolveDatasetByRealmRow{
				ServerDatasetID: uuid.NullUUID{UUID: serverDatasetID, Valid: true},
				TenantDatasetID: uuid.NullUUID{UUID: tenantDatasetID, Valid: true},
			},
			want:       serverDatasetID,
			wantLookup: true,
		},
		{
			name: "tenant dataset",
			resolved: database.ResolveDatasetByRealmRow{
				TenantDatasetID: uuid.NullUUID{UUID: tenantDatasetID, Valid: true},
			},
			want:       tenantDatasetID,
			wantLookup: true,
		},
		{
			name: "zero server falls through to tenant dataset",
			resolved: database.ResolveDatasetByRealmRow{
				ServerDatasetID: uuid.NullUUID{UUID: uuid.Nil, Valid: true},
				TenantDatasetID: uuid.NullUUID{UUID: tenantDatasetID, Valid: true},
			},
			want:       tenantDatasetID,
			wantLookup: true,
		},
		{
			name: "null dataset",
			want: DefaultDatasetID,
		},
		{
			name: "zero datasets",
			resolved: database.ResolveDatasetByRealmRow{
				ServerDatasetID: uuid.NullUUID{UUID: uuid.Nil, Valid: true},
				TenantDatasetID: uuid.NullUUID{UUID: uuid.Nil, Valid: true},
			},
			want: DefaultDatasetID,
		},
		{
			name: "query error",
			err:  errors.New("resolve dataset"),
			want: DefaultDatasetID,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			service := &Service{db: resolveDatasetStore{resolved: tt.resolved, err: tt.err}}
			lookup, ok := service.LookupDatasetForRealm(context.Background(), uuid.New())
			require.Equal(t, tt.wantLookup, ok)
			if ok {
				require.Equal(t, tt.want, lookup)
			} else {
				require.Equal(t, uuid.Nil, lookup)
			}
			require.Equal(t, tt.want, service.ResolveDatasetForRealm(context.Background(), uuid.New()))
		})
	}
}
