package database_test

import (
	"slices"
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

func TestAllFlavorTagValuesIncludesKnownTags(t *testing.T) {
	t.Parallel()

	all := database.WoWFlavor(database.AllFlavorTagValues())
	for _, tag := range []database.FlavorTag{
		database.FlavorTBC,
		database.FlavorAzerothcoreProgression,
	} {
		if !all.Has(tag) {
			t.Errorf("AllFlavorTagValues() missing %q", tag)
		}
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

// TestServerFlavor checks the build-tag default flavor mapping.
func TestServerFlavor(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		base database.FlavorTag
		want []database.FlavorTag
	}{
		{"turtle", database.FlavorVanilla, []database.FlavorTag{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorTurtle}},
		{"kronos", database.FlavorVanilla, []database.FlavorTag{database.FlavorVanilla, database.FlavorKronos}},
		{"vanillaplus", database.FlavorVanilla, []database.FlavorTag{database.FlavorVanilla, database.FlavorVanillaPlus}},
		{"octowow", database.FlavorVanilla, []database.FlavorTag{database.FlavorVanilla, database.FlavorNightmareOfUrsol, database.FlavorOctoWoW}},
		{"epoch", database.FlavorWrath, []database.FlavorTag{database.FlavorWrath, database.FlavorEpoch}},
		{"azerothcore", database.FlavorWrath, []database.FlavorTag{database.FlavorWrath, database.FlavorAzerothcore}},
		{"ascension", database.FlavorWrath, []database.FlavorTag{database.FlavorWrath, database.FlavorAscension}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := database.ServerFlavor(tc.name, tc.base)
			if len(got) != len(tc.want) {
				t.Fatalf("ServerFlavor(%q, %q) = %v, want %v", tc.name, tc.base, got, tc.want)
			}
			for _, tag := range tc.want {
				if !got.Has(tag) {
					t.Errorf("ServerFlavor(%q, %q) missing %q (got %v)", tc.name, tc.base, tag, got)
				}
			}
		})
	}
}

// TestServerFlavorNoDuplicateBase: if server name equals the base tag, the base
// is not duplicated.
func TestServerFlavorNoDuplicateBase(t *testing.T) {
	t.Parallel()

	got := database.ServerFlavor("vanilla", database.FlavorVanilla)
	if len(got) != 1 || !got.Has(database.FlavorVanilla) {
		t.Fatalf("ServerFlavor(vanilla, vanilla) = %v, want [vanilla]", got)
	}
}

func TestWoWFlavorMerge(t *testing.T) {
	t.Parallel()

	base := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	additional := database.WoWFlavor{database.FlavorAzerothcore, database.FlavorAzerothcoreProgression}

	got := base.Merge(additional)
	want := database.WoWFlavor{
		database.FlavorWrath,
		database.FlavorAzerothcore,
		database.FlavorAzerothcoreProgression,
	}
	if !slices.Equal(got, want) {
		t.Fatalf("Merge() = %v, want %v", got, want)
	}
	if len(base) != 2 || len(additional) != 2 {
		t.Fatal("Merge modified an input slice")
	}
}

// TestFlavorStringsRoundtrip: Strings and FlavorFromStrings are inverses, and
// nil round-trips to nil (NULL column).
func TestFlavorStringsRoundtrip(t *testing.T) {
	t.Parallel()

	f := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	got := database.FlavorFromStrings(f.Strings())
	if len(got) != len(f) {
		t.Fatalf("roundtrip changed length: %v -> %v", f, got)
	}
	for i := range f {
		if got[i] != f[i] {
			t.Errorf("roundtrip mismatch at %d: %q != %q", i, got[i], f[i])
		}
	}

	var nilFlavor database.WoWFlavor
	if nilFlavor.Strings() != nil {
		t.Errorf("nil flavor Strings() should be nil")
	}
	if database.FlavorFromStrings(nil) != nil {
		t.Errorf("FlavorFromStrings(nil) should be nil")
	}
}
