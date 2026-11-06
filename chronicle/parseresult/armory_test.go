package parseresult

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/db2sdk"
	"github.com/Emyrk/chronicle/combatlog/parser/common/armory"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/unitinfo"
	"github.com/Emyrk/chronicle/database"
)

func TestArmoryObservationRoundTripAndCopy(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := armory.New(units)
	a, b := guid.GUID(2), guid.GUID(1)
	enchant, transmog := 23, 45
	talents := &combatant.Talents{Summary: [3]uint8{5}, TabNames: [3]string{"Arms"}}
	talents.Trees[0] = []uint8{2, 3}
	gear := []combatant.GearItem{{ItemID: 123, Name: "Sword", EnchantID: &enchant, TransmogID: &transmog, GemEnchantIDs: [4]int{1, 0, 3}}}
	tracker.Guilds["Z"] = map[guid.GUID]struct{}{a: {}, b: {}}
	tracker.Guilds["A"] = map[guid.GUID]struct{}{b: {}}
	tracker.Participant[a] = struct{}{}
	tracker.Players[a] = combatant.Combatant{Guid: a, Name: "Alice", Seen: time.Date(2025, 1, 2, 0, 0, 0, 0, time.UTC),
		Guild: &combatant.Guild{Name: "Z"}, GearSetups: gear, Talents: talents,
		HeroClass: types.HeroClassesWARRIOR, Gender: types.HeroGenderFemale, Race: types.HeroRacesHuman}
	tracker.Players[b] = combatant.Combatant{Guid: b, Name: "Bob"}
	units.Info[b] = unitinfo.Info{Level: 58}
	fin := &instances.FinalizedInstance{Guilds: tracker}
	build := func() *Result {
		t.Helper()
		got, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: fin, Events: encounterevents.NewEvents(), Units: units, Armory: tracker})
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	got := build()
	if got.SchemaVersion != SchemaVersion || got.Armory.ParticipantCount != 1 || got.Armory.Guilds[0].Name != "A" || got.Armory.Players[0].GUID != b.String() || got.Armory.Players[0].Level != 58 {
		t.Fatalf("ordering or counts: %+v", got.Armory)
	}
	player := got.Armory.Players[1]
	if player.GuildName != "Z" || player.Class != string(db2sdk.HeroClassToDB(types.HeroClassesWARRIOR)) || player.Race != string(db2sdk.HeroRaceToDB(types.HeroRacesHuman)) || player.Gender != string(db2sdk.HeroGenderToDB(types.HeroGenderFemale)) || player.Gear[0].ItemID != 123 || *player.Gear[0].EnchantID != 23 || *player.Gear[0].TransmogID != 45 || player.Gear[0].GemEnchantIDs[2] != 3 || player.Talents.Tabs[0].Ranks != "23" || player.Talents.Tabs[0].PointsSpent != 5 {
		t.Fatalf("missing upsert inputs: %+v", player)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(data, []byte(`"item_id":123`)) {
		t.Fatal("gear observation changed wire field names")
	}
	var decoded Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*got, decoded) {
		t.Fatal("armory JSON roundtrip changed result")
	}
	if !reflect.DeepEqual(got.Armory, build().Armory) {
		t.Fatal("nondeterministic armory projection")
	}
	gear[0].ItemID = 999
	enchant = 999
	transmog = 999
	talents.Trees[0][0] = 9
	tracker.Guilds["Z"][guid.GUID(3)] = struct{}{}
	if got.Armory.Players[1].Gear[0].ItemID != 123 || *got.Armory.Players[1].Gear[0].EnchantID != 23 || got.Armory.Players[1].Talents.Tabs[0].Ranks != "23" || len(got.Armory.Guilds[1].Members) != 2 {
		t.Fatal("armory result aliases tracker")
	}
}

func TestArmoryRejectsOversizedGear(t *testing.T) {
	t.Parallel()
	units := unitdb.New()
	tracker := armory.New(units)
	tracker.Players[guid.GUID(1)] = combatant.Combatant{Guid: guid.GUID(1), GearSetups: make([]combatant.GearItem, 20)}
	_, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: &instances.FinalizedInstance{}, Events: encounterevents.NewEvents(), Units: units, Armory: tracker})
	if err == nil {
		t.Fatal("oversized outfit accepted")
	}
}
