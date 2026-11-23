package authz

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type scoutingStore struct {
	database.Store
	calls int
	rows  []database.UpsertScoutedPlayersRow
}

func (s *scoutingStore) UpsertScoutedPlayers(context.Context, []byte) ([]database.UpsertScoutedPlayersRow, error) {
	s.calls++
	return s.rows, nil
}

type scoutingAuthorizer struct {
	Authorizer
	writes []rel.Txn
}

func (a *scoutingAuthorizer) Write(_ context.Context, txn rel.Txn) (string, error) {
	a.writes = append(a.writes, txn)
	return "", nil
}

func TestScoutingBatchRegistersPlayerAndBothGuildRelations(t *testing.T) {
	t.Parallel()
	current, observed := uuid.New(), uuid.New()
	store := &scoutingStore{}
	for i := 1; i <= 1000; i++ {
		store.rows = append(store.rows, database.UpsertScoutedPlayersRow{ID: guid.GUID(i), GuildID: uuid.NullUUID{UUID: current, Valid: true}, ObservedGuildID: uuid.NullUUID{UUID: observed, Valid: true}})
	}
	authorizer := &scoutingAuthorizer{}
	z := interceptor{Store: store, Authorizer: authorizer}
	rows, err := z.UpsertScoutedPlayers(t.Context(), []byte(`[]`))
	require.NoError(t, err)
	require.Len(t, rows, 1000)
	require.Equal(t, 1, store.calls)
	require.Len(t, authorizer.writes, 3)
	var count int
	guilds := make(map[string]bool)
	for _, write := range authorizer.writes {
		require.LessOrEqual(t, len(write.V1Updates), 500)
		count += len(write.V1Updates)
		for _, update := range write.V1Updates {
			resource := update.GetRelationship().GetResource()
			if resource.GetObjectType() == "guild" {
				guilds[resource.GetObjectId()] = true
			}
		}
	}
	require.Equal(t, 1002, count)
	require.True(t, guilds[current.String()])
	require.True(t, guilds[observed.String()])
}
