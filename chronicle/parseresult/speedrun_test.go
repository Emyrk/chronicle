package parseresult

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestBuildSpeedrunJSONAndEligibility(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	proof := []rankings.SpeedrunProof{{Requirement: rankings.SpeedrunRequirement{Name: "Boss", EntryIDs: []uint32{1, 2}, Count: 1}, Kills: []rankings.KillRecord{{EntryID: 1, GUID: guid.GUID(77), Timestamp: at}}, Satisfied: true}}
	fin := &instances.FinalizedInstance{
		Versions: map[string]string{"addon": "1.2"},
		Rankings: &rankings.RankingsResult{Speedrun: &rankings.SpeedrunResult{
			Qualified: true, StartTime: at, CompletionTime: at.Add(time.Minute), Duration: time.Minute,
			RankedStartTime: at.Add(time.Second), RankedCompletionTime: at.Add(time.Minute), RankedDuration: 59 * time.Second,
			BossToBossStartTime: at.Add(2 * time.Second), // incomplete pair must be absent
			Proof:               proof, LevelRange: &rankings.LevelRangeResult{Satisfied: false, Violators: []rankings.LevelViolation{{PlayerName: "High", PlayerGUID: guid.GUID(88), Level: 61}}},
		}},
		Encounters: []encounter.Encounter{{Boss: true, KillType: encounter.KillTypePartial}},
	}
	result, err := Build(Input{Format: database.LogFormat112aCcAddon, Name: "Raid", Finalized: fin, Events: encounterevents.NewEvents()})
	require.NoError(t, err)
	require.Equal(t, 6, result.SchemaVersion)
	require.True(t, result.Speedrun.HasBossKill)
	require.False(t, result.Speedrun.ServerSide)
	require.Equal(t, "1.2", result.Speedrun.AddonVersion)
	require.NotNil(t, result.Speedrun.Ranked)
	require.Nil(t, result.Speedrun.BossToBoss)
	encoded, err := json.Marshal(result)
	require.NoError(t, err)
	var decoded Result
	require.NoError(t, json.Unmarshal(encoded, &decoded))
	require.True(t, reflect.DeepEqual(*result, decoded))
	proof[0].Requirement.EntryIDs[0] = 99
	proof[0].Kills[0].EntryID = 99
	fin.Rankings.Speedrun.LevelRange.Violators[0].Level = 99
	require.Equal(t, uint32(1), result.Speedrun.Proof.Proof[0].Requirement.EntryIDs[0])
	require.Equal(t, uint32(1), result.Speedrun.Proof.Proof[0].Kills[0].EntryID)
	require.Equal(t, int32(61), result.Speedrun.Proof.LevelRange.Violators[0].Level)

	fin.Encounters = nil
	trash, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: fin, Events: encounterevents.NewEvents(), Capabilities: []string{"server-side"}})
	require.NoError(t, err)
	require.NotNil(t, trash.Speedrun)
	require.False(t, trash.Speedrun.HasBossKill)
	require.True(t, trash.Speedrun.ServerSide)
	fin.Rankings = nil
	absent, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: fin, Events: encounterevents.NewEvents()})
	require.NoError(t, err)
	require.Nil(t, absent.Speedrun)
}
