package chroniclesdk

import (
	"encoding/json"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestGUIDStringJSON(t *testing.T) {
	t.Parallel()

	type TestStruct struct {
		ID GUIDString `json:"id"`
	}

	testValue := TestStruct{
		ID: guid.GUID(0xF130000CE0000D3F),
	}

	jsonData, err := json.Marshal(testValue)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"0xF130000CE0000D3F"}`, string(jsonData))
}

func TestInstanceUnitOwnerJSON(t *testing.T) {
	t.Parallel()

	withoutOwner, err := json.Marshal(InstanceUnit{Name: "Boss", Entry: 1})
	require.NoError(t, err)
	require.JSONEq(t, `{"name":"Boss","entry":1}`, string(withoutOwner))

	owner := guid.GUID(0xF140000000000001)
	withOwner, err := json.Marshal(InstanceUnit{Name: "Pet", Owner: &owner, Entry: 2})
	require.NoError(t, err)
	require.JSONEq(t, `{"name":"Pet","owner":"0xF140000000000001","entry":2}`, string(withOwner))
}

func TestWoWAttendanceInstanceJSON(t *testing.T) {
	t.Parallel()

	playerGUID := GUIDString(guid.GUID(0x0000000000000001))
	data, err := json.Marshal(WoWAttendanceInstance{
		Players: map[GUIDString]InstancePlayer{
			playerGUID: {Name: "Player", Level: 60},
		},
	})
	require.NoError(t, err)

	var response map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(data, &response))
	require.Contains(t, response, "players")
	require.JSONEq(t, `null`, string(response["dataset_id"]))
	require.NotContains(t, response, "encounters")
	require.NotContains(t, response, "units")
}
