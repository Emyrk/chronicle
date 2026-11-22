package db2sdk

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInstancePlayerRealmJSON(t *testing.T) {
	t.Parallel()
	realm := uuid.New()
	known, unknown := guid.GUID(1), guid.GUID(2)
	rows := []database.LogInstancePlayer{
		{UnitGuid: known, Name: "Known", RealmID: uuid.NullUUID{UUID: realm, Valid: true}},
		// Invalid UUID represents legacy, unknown, or ON DELETE SET NULL evidence.
		{UnitGuid: unknown, Name: "Unknown", RealmID: uuid.NullUUID{UUID: uuid.New(), Valid: false}},
	}
	players := InstancePlayers(rows)
	require.Equal(t, &realm, players[known].RealmID)
	require.Nil(t, players[unknown].RealmID)
	instance := database.LogInstancesGuild{RealmID: uuid.New()}
	for _, response := range []any{
		WowAttendanceInstance(instance, rows),
		WowDecoratedInstance(instance, nil, rows, nil, nil, nil),
	} {
		data, err := json.Marshal(response)
		require.NoError(t, err)
		var body struct {
			Players map[string]map[string]json.RawMessage `json:"players"`
		}
		require.NoError(t, json.Unmarshal(data, &body))
		require.JSONEq(t, `"`+realm.String()+`"`, string(body.Players[known.String()]["realm_id"]))
		require.Contains(t, body.Players[unknown.String()], "realm_id")
		require.Equal(t, "null", string(body.Players[unknown.String()]["realm_id"]))
	}
}
