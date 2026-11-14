package parseresult

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
)

func TestBuildJSONRoundTrip(t *testing.T) {
	t.Parallel()
	start := time.Date(2024, 1, 2, 3, 4, 5, 0, time.UTC)
	id := uuid.New()
	streams := encounterevents.NewEvents()
	// Fill every stream, including non-UTF8 bytes. This also detects new
	// source streams missing from the result's explicit copy operation.
	fields := reflect.ValueOf(streams).Elem()
	if fields.NumField() != reflect.TypeOf(EventStreams{}).NumField() {
		t.Fatal("event stream projection does not cover every source field")
	}
	for i := 0; i < fields.NumField(); i++ {
		if fields.Type().Field(i).Name != reflect.TypeOf(EventStreams{}).Field(i).Name {
			t.Fatalf("event stream %d is not aligned with the source", i)
		}
		fields.Field(i).SetBytes([]byte{byte(i), 0xff, 0x00})
	}
	fin := &instances.FinalizedInstance{
		Realm:    &realm.Info{RealmName: "Test Realm"},
		Versions: map[string]string{"addon": "2.1"},
		Encounters: []encounter.Encounter{{
			Name: "Boss", KillType: encounter.KillTypeWipe, Boss: true,
			Combat:        encounter.Fight{EncounterID: id, MapID: 42, Start: start, End: start.Add(9 * time.Second)},
			RankingWindow: &encounter.RankingWindow{Start: start.Add(time.Second), End: start.Add(8 * time.Second)},
		}},
	}
	got, err := Build(Input{Format: database.LogFormat112aCcAddon, Name: "Raid", Finalized: fin, Events: streams})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Raid" || got.RealmName != "Test Realm" || got.Encounters[0].ID != id.String() ||
		*got.Encounters[0].RankingStartOffsetMs != 1000 || *got.Encounters[0].RankingEndOffsetMs != 8000 {
		t.Fatalf("metadata projection: %+v", got)
	}
	copied := reflect.ValueOf(got.Events)
	for i := 0; i < fields.NumField(); i++ {
		if !reflect.DeepEqual(fields.Field(i).Bytes(), copied.Field(i).Bytes()) {
			t.Fatalf("stream %s not copied", fields.Type().Field(i).Name)
		}
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*got, decoded) {
		t.Fatalf("JSON roundtrip changed result: %s", data)
	}
	fields.Field(0).Bytes()[0] = 0xee
	fin.Versions["addon"] = "changed"
	if got.Events.Damage[0] == 0xee || got.Versions["addon"] != "2.1" {
		t.Fatal("result aliases mutable input")
	}
}

func TestBuildRejectsUnsupportedInput(t *testing.T) {
	t.Parallel()
	if _, err := Build(Input{Format: database.LogFormatAzerothcoreMod, Finalized: &instances.FinalizedInstance{}, Events: encounterevents.NewEvents()}); err == nil {
		t.Fatal("unsupported format accepted")
	}
	if _, err := Build(Input{Format: database.LogFormat112aCcAddon}); err == nil {
		t.Fatal("missing parse state accepted")
	}
}

func TestBuildPreservesNilAndEmptyStreams(t *testing.T) {
	t.Parallel()
	events := &encounterevents.Events{Healing: make([]byte, 0)}
	got, err := Build(Input{Format: database.LogFormat112aCcAddon, Finalized: &instances.FinalizedInstance{}, Events: events})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(*got, decoded) {
		t.Fatalf("nil/empty streams changed: %s", data)
	}
}
