package parseresult

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBuildTrashRankingsJSON(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	player, pet := guid.GUID(42), guid.GUID(7)
	id1, id2 := uuid.New(), uuid.New()
	guilds := armory.New(unitdb.New())
	guilds.Players[player] = combatant.Combatant{Name: "Alice", Guid: player}
	guilds.Guilds["Team"] = map[guid.GUID]struct{}{player: {}}
	fin := &instances.FinalizedInstance{Guilds: guilds, RankingRules: &rankings.Rankings{}, Rankings: &rankings.RankingsResult{
		DPS: map[uuid.UUID]*rankings.DPSResult{id1: {Units: map[guid.GUID]*rankings.UnitCombatStats{
			pet: {OwnerGUID: &player, DamageDone: 20}, player: {IsPlayer: true, DamageDone: 80, HealingDone: 5},
		}}, id2: {Units: map[guid.GUID]*rankings.UnitCombatStats{player: {IsPlayer: true, DamageDone: 30}}}},
		Survivability: map[uuid.UUID]*rankings.SurvivabilityResult{id1: {Players: map[guid.GUID]rankings.PlayerSurvivability{player: {AliveDurationSecs: 5, Deaths: 1}}}},
	}, Encounters: []encounter.Encounter{
		{Boss: false, KillType: encounter.KillTypeClean, Combat: encounter.Fight{EncounterID: id1, Start: at, End: at.Add(10 * time.Second)}},
		{Boss: false, KillType: encounter.KillTypeWipe, Combat: encounter.Fight{EncounterID: id2, Start: at, End: at.Add(10 * time.Second)}},
	}}
	input := Input{Format: database.LogFormat112aCcAddon, Name: "Raid", Finalized: fin, Events: encounterevents.NewEvents()}
	first, err := Build(input)
	require.NoError(t, err)
	second, err := Build(input)
	require.NoError(t, err)
	require.Equal(t, 8, first.SchemaVersion)
	require.Len(t, first.TrashRankings.Encounters, 1)
	units := first.TrashRankings.Encounters[0].Units
	require.Equal(t, pet.String(), units[0].GUID)
	require.Equal(t, int64(80), units[1].DamageDone)
	require.Equal(t, 5.0, *units[1].AliveDurationSecs)
	a, err := json.Marshal(first)
	require.NoError(t, err)
	b, err := json.Marshal(second)
	require.NoError(t, err)
	require.Equal(t, string(a), string(b))
	var decoded Result
	require.NoError(t, json.Unmarshal(a, &decoded))
	require.Equal(t, first.TrashRankings, decoded.TrashRankings)
	fin.Rankings.DPS[id1].Units[player].DamageDone = 999
	require.Equal(t, int64(80), first.TrashRankings.Encounters[0].Units[1].DamageDone)
}
