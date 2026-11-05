package parseresult

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/overviewmetrics"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/participants"
	"github.com/Emyrk/chronicle/combatlog/parser/common/raidgroups"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

func TestCoreFieldsRoundTrip(t *testing.T) {
	t.Parallel()
	start := time.Date(2024, 2, 1, 12, 0, 0, 0, time.UTC)
	id := guid.GUID(0xF1300039F2000001)
	encID := uuid.New()
	phaseID := uuid.New()
	abilityID := int32(42)
	complete := true
	msg := &messages.Damage{MessageBase: messages.Base(start)}
	moment := &period.Moment{Timestamp: msg, Reason: "first hit"}
	fin := &instances.FinalizedInstance{
		Overview: overviewmetrics.Summary{
			RequirementsComplete: &complete, PlayerDeaths: 2, WipeCount: 1,
			TopIncomingDamageAbilities: []overviewmetrics.DeadliestAbility{{SpellID: &abilityID, Name: "Fire", Damage: 42, Hits: 2}},
			EncounterSpanDuration:      5 * time.Second, TotalCombatDuration: 4 * time.Second,
			TotalBossDuration: 3 * time.Second, MetricsVersion: 3,
		},
		Participants:       &participants.Tracker{Active: map[guid.GUID]bool{id: true}},
		RaidGroupSnapshots: []raidgroups.InstanceSnapshot{{EncounterID: &encID, ObservedAt: start}},
		Encounters: []encounter.Encounter{{
			Name: "Hakkar", Boss: true, Remaining: []guid.GUID{id},
			Combat: encounter.Fight{EncounterID: encID, Start: start, End: start.Add(5 * time.Second),
				Hostiles: map[guid.GUID]encounter.CharacterFight{id: {ID: id, Activity: []period.Period{{Start: moment, End: moment, LastActive: moment, EndState: period.EndStateSlain}}}}},
			Phases: []encounter.Phase{{ID: phaseID, Key: "phase1", Name: "Start", Order: 1, EndOffsetMs: 5000}},
		}},
	}
	units := unitdb.New()
	units.Info[id] = unitinfo.Info{Guid: id, Name: "Hakkar"}
	result, err := Build(Input{Format: database.LogFormat112aCcAddon, Name: "Zul'Gurub", Finalized: fin,
		Events: encounterevents.NewEvents(), Units: units, IdentifyUnit: func(guid.GUID) identifier.Identity { return identifier.Identity{Boss: true} },
		Category: "raid", DifficultyName: "Normal", MaxPlayers: 40, Capabilities: []string{"overheal"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.SchemaVersion != 7 || result.Core.Start != start || result.Core.End != start.Add(5*time.Second) ||
		result.Core.MaxPlayers != 40 || result.Overview.TopIncomingDamageAbilities[0].Damage != 42 ||
		result.Encounters[0].Fights[0].Periods[0].Start.MessageType == "" ||
		result.Encounters[0].Phases[0].ID != phaseID.String() || result.RaidSnapshots[0].EncounterID == nil ||
		len(result.Units) != 1 || result.Units[0].Name != "Hakkar" {
		t.Fatalf("core projection incomplete: %+v", result)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*result, decoded) {
		t.Fatalf("core JSON roundtrip changed result: %s", data)
	}
	fin.Overview.TopIncomingDamageAbilities[0].Damage = 0
	units.Info[id] = unitinfo.Info{Guid: id, Name: "changed"}
	if result.Overview.TopIncomingDamageAbilities[0].Damage != 42 || result.Units[0].Name != "Hakkar" {
		t.Fatal("transport result aliases source state")
	}
}

func TestCorePlayerMetadataUsesLegacyParticipationLevelRules(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	guilds := armory.New(units)
	preferred, fallback, missing := guid.GUID(1), guid.GUID(2), guid.GUID(3)
	guilds.Participant[preferred] = struct{}{}
	guilds.Participant[fallback] = struct{}{}
	guilds.Participant[missing] = struct{}{}
	units.Info[preferred] = unitinfo.Info{Name: "unit name", Level: 52}
	units.Info[fallback] = unitinfo.Info{Level: 53}
	level := int32(60)
	units.Players[preferred] = combatant.Combatant{Name: "combatant name", Level: &level, HeroClass: types.HeroClassesMAGE, Race: types.HeroRacesHuman}
	units.Players[fallback] = combatant.Combatant{Name: "fallback", HeroClass: types.HeroClassesWARRIOR}
	result, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: &instances.FinalizedInstance{Guilds: guilds}, Events: encounterevents.NewEvents(), Units: units})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Units) != 3 || !result.Units[0].HasPlayerData || result.Units[0].PlayerLevel != 60 ||
		result.Units[0].PlayerName != "combatant name" || result.Units[0].PlayerClass != "MAGE" || result.Units[0].PlayerRace != "Human" ||
		!result.Units[1].HasPlayerData || result.Units[1].PlayerLevel != 53 || result.Units[2].HasPlayerData {
		t.Fatalf("player projection changed: %+v", result.Units)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Result
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(result.Units, decoded.Units) {
		t.Fatalf("player metadata changed in JSON roundtrip: %+v", decoded.Units)
	}
}

func TestEarlierSchemaDecodesAsUnversioned(t *testing.T) {
	t.Parallel()
	var old Result
	if err := json.Unmarshal([]byte(`{"format":"1.12a-cc-addon","name":"old","events":{}}`), &old); err != nil {
		t.Fatal(err)
	}
	if old.SchemaVersion != 0 || old.Name != "old" {
		t.Fatalf("unexpected old payload: %+v", old)
	}
}
