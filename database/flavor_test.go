package database_test

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
)

func TestWoWFlavorHas(t *testing.T) {
	t.Parallel()

	f := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	if !f.Has(database.FlavorWrath) {
		t.Errorf("expected Has(wrath) = true")
	}
	if !f.Has(database.FlavorAzerothcore) {
		t.Errorf("expected Has(azerothcore) = true")
	}
	if f.Has(database.FlavorVanilla) {
		t.Errorf("expected Has(vanilla) = false")
	}
	// nil flavor: Has is always false, never panics.
	var empty database.WoWFlavor
	if empty.Has(database.FlavorWrath) {
		t.Errorf("nil flavor should not contain any tag")
	}
}

// TestLogTypeFlavor pins the bootstrap LogType->flavor derivation.
func TestLogTypeFlavor(t *testing.T) {
	t.Parallel()

	cases := []struct {
		logType database.LogType
		want    []database.FlavorTag
	}{
		{database.LogTypeV1, []database.FlavorTag{database.FlavorVanilla, database.FlavorTurtle}},
		{database.LogTypeV2, []database.FlavorTag{database.FlavorVanilla}},
		{database.LogTypeKronos, []database.FlavorTag{database.FlavorVanilla, database.FlavorKronos}},
		{database.LogTypeWarmane, []database.FlavorTag{database.FlavorWrath}},
		{database.LogTypeEpoch, []database.FlavorTag{database.FlavorWrath, database.FlavorEpoch}},
		{database.LogTypeAzerothcoreClientside, []database.FlavorTag{database.FlavorWrath, database.FlavorAzerothcore}},
		{database.LogTypeAzerothcore, []database.FlavorTag{database.FlavorWrath, database.FlavorAzerothcore}},
	}

	for _, tc := range cases {
		t.Run(string(tc.logType), func(t *testing.T) {
			t.Parallel()
			got := tc.logType.Flavor()
			if len(got) != len(tc.want) {
				t.Fatalf("LogType(%q).Flavor() = %v, want %v", tc.logType, got, tc.want)
			}
			for _, tag := range tc.want {
				if !got.Has(tag) {
					t.Errorf("LogType(%q).Flavor() missing tag %q (got %v)", tc.logType, tag, got)
				}
			}
		})
	}
}

// TestLogTypeFlavorExhaustive: every valid LogType derives a non-empty flavor.
func TestLogTypeFlavorExhaustive(t *testing.T) {
	t.Parallel()

	for _, lt := range database.AllLogTypeValues() {
		if len(lt.Flavor()) == 0 {
			t.Errorf("LogType(%q).Flavor() is empty; add it to LogType.Flavor", lt)
		}
	}
}

// TestUnknownLogTypeFlavor: an unknown LogType derives nil (Has always false).
func TestUnknownLogTypeFlavor(t *testing.T) {
	t.Parallel()

	got := database.LogType("not-a-real-type").Flavor()
	if got != nil {
		t.Fatalf("unknown LogType.Flavor() = %v, want nil", got)
	}
}
