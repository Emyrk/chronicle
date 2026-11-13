package chronicle

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbstatic"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type identityRealmStore struct {
	knownID uuid.UUID
}

func (s identityRealmStore) GetWoWServerRealmByName(_ context.Context, name string) (database.WowServerRealm, error) {
	if name == "Known" || name == "Known Alias" {
		return database.WowServerRealm{ID: s.knownID, Name: "Known"}, nil
	}
	return database.WowServerRealm{}, pgx.ErrNoRows
}

func (s identityRealmStore) GetWoWServerRealm(_ context.Context, id uuid.UUID) (database.WowServerRealm, error) {
	return database.WowServerRealm{ID: id, Name: "Configured"}, nil
}

func TestParseIdentityPublicationRealm(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, prescan, finalized string
		explicitUnknown          bool
		wantError                bool
	}{
		{name: "distinct missing names", prescan: "Missing A", finalized: "Missing B", wantError: true},
		{name: "same missing name", prescan: "Missing A", finalized: "Missing A"},
		{name: "missing name case normalization", prescan: "Missing A", finalized: "missing a"},
		{name: "missing finalized name", prescan: "Missing A", wantError: true},
		{name: "known aliases", prescan: "Known Alias", finalized: "Known"},
		{name: "known to unknown", prescan: "Known", finalized: "Missing A", wantError: true},
		{name: "unknown to known", prescan: "Missing A", finalized: "Known", wantError: true},
		{name: "explicit unknown remains authoritative", prescan: "Missing A", finalized: "Missing B", explicitUnknown: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := t.Context()
			db := identityRealmStore{knownID: uuid.New()}
			pre, err := lookupPreParseRealm(ctx, db, tc.prescan)
			require.NoError(t, err)
			var jobRealmID uuid.UUID
			if tc.explicitUnknown {
				jobRealmID = dbstatic.RealmUnknown()
			}
			fence := &parseIdentityFence{realmID: pre.ID}
			fence.captureUnresolvedRealm(pre.Name, jobRealmID)
			publication, err := resolveStrictPublicationRealm(ctx, db, tc.finalized, jobRealmID)
			require.NoError(t, err)
			err = fence.checkPublicationRealm(publication)
			if tc.wantError {
				require.ErrorIs(t, err, ErrParseIdentityChanged)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
