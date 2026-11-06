package parseresult

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/version"
	"github.com/google/uuid"
)

func TestBuildResolvedIdentityRoundTripAndIsolation(t *testing.T) {
	t.Parallel()
	flavor := database.WoWFlavor{database.FlavorWrath, database.FlavorVanillaPlus}
	datasetID := uuid.New()
	input := Input{Format: database.LogFormat335aCcAddon, Flavor: flavor, DatasetID: datasetID,
		Finalized: &instances.FinalizedInstance{}, Events: encounterevents.NewEvents()}
	result, err := Build(input)
	if err != nil {
		t.Fatal(err)
	}
	flavor[0] = database.FlavorTBC
	if result.SchemaVersion != SchemaVersion || result.DatasetID != datasetID || result.ParserVersion != version.ExactParserVersion() ||
		!reflect.DeepEqual(result.Flavor, database.WoWFlavor{database.FlavorWrath, database.FlavorVanillaPlus}) {
		t.Fatalf("resolved identity missing or aliased: %+v", result)
	}
	data, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var decoded Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.DatasetID != datasetID || decoded.ParserVersion != result.ParserVersion || !reflect.DeepEqual(decoded.Flavor, result.Flavor) {
		t.Fatalf("resolved identity changed after JSON roundtrip: %+v", decoded)
	}
}

func TestBuildPreservesUnknownVersusExplicitEmptyFlavor(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		flavor database.WoWFlavor
	}{
		{name: "unknown", flavor: nil},
		{name: "resolved empty", flavor: database.WoWFlavor{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := Build(Input{Format: database.LogFormat112aCcAddon, Flavor: tc.flavor,
				Finalized: &instances.FinalizedInstance{}, Events: encounterevents.NewEvents()})
			if err != nil {
				t.Fatal(err)
			}
			if (result.Flavor == nil) != (tc.flavor == nil) {
				t.Fatal("flavor resolution state lost")
			}
			if result.DatasetID != uuid.Nil {
				t.Fatal("synthetic build invented dataset")
			}
			data, err := json.Marshal(result)
			if err != nil {
				t.Fatal(err)
			}
			var decoded Result
			if err := json.Unmarshal(data, &decoded); err != nil {
				t.Fatal(err)
			}
			if (decoded.Flavor == nil) != (tc.flavor == nil) {
				t.Fatalf("flavor state changed after JSON roundtrip: %s", data)
			}
		})
	}
}
