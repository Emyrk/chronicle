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

func TestBuildBossRankingsDeterministicJSON(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	id, player, pet := uuid.New(), guid.GUID(42), guid.GUID(7)
	talent := &combatant.Talents{Summary: [3]uint8{10, 20, 21}, Trees: [3][]uint8{{1, 2}, {3}, {4}}}
	guilds := armory.New(unitdb.New())
	guilds.Players[player] = combatant.Combatant{Name: "Alice", Guid: player, Talents: talent}
	guilds.Guilds["Guild"] = map[guid.GUID]struct{}{player: {}}
	fin := &instances.FinalizedInstance{Guilds: guilds, RankingRules: &rankings.Rankings{}, Rankings: &rankings.RankingsResult{
		DPS: map[uuid.UUID]*rankings.DPSResult{id: {Units: map[guid.GUID]*rankings.UnitCombatStats{
			pet:    {OwnerGUID: &player, RankedDamageDone: 70, HealingDone: 5},
			player: {IsPlayer: true, RankedDamageDone: 100, UnrankedDamageDone: 10, Talents: talent},
		}}},
		Survivability: map[uuid.UUID]*rankings.SurvivabilityResult{id: {Players: map[guid.GUID]rankings.PlayerSurvivability{player: {Deaths: 1, AlivePercentage: 80}}}},
	}, Encounters: []encounter.Encounter{{Boss: true, KillType: encounter.KillTypePartial, Name: "Boss", Combat: encounter.Fight{EncounterID: id, Start: at, End: at.Add(10 * time.Second)}, RankingWindow: &encounter.RankingWindow{Start: at.Add(time.Second), End: at.Add(9 * time.Second)}}}}
	input := Input{Format: database.LogFormat112aCcAddon, Name: "Raid", Finalized: fin, Events: encounterevents.NewEvents()}
	first, err := Build(input)
	require.NoError(t, err)
	second, err := Build(input)
	require.NoError(t, err)
	a, err := json.Marshal(first)
	require.NoError(t, err)
	b, err := json.Marshal(second)
	require.NoError(t, err)
	require.JSONEq(t, string(a), string(b))
	require.Equal(t, 7, first.SchemaVersion)
	require.True(t, first.BossRankings.HasRules)
	require.True(t, first.BossRankings.HasDPS)
	require.Equal(t, 8.0, first.BossRankings.Encounters[0].DurationSecs)
	require.Equal(t, pet.String(), first.BossRankings.Encounters[0].Units[0].GUID)
	var decoded Result
	require.NoError(t, json.Unmarshal(a, &decoded))
	require.Equal(t, first.BossRankings, decoded.BossRankings)
	talent.Trees[0][0] = 9
	require.Equal(t, uint8(1), first.BossRankings.Encounters[0].Units[1].Talents.Trees[0][0])
}
