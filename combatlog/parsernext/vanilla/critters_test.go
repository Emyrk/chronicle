package vanilla_test

import (
	"fmt"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common/critters"
	"github.com/Emyrk/chronicle/combatlog/parsernext/common/units"
	"github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/stretchr/testify/require"
)

func TestClassifyKnownCritters(t *testing.T) {
	t.Parallel()
	for _, entry := range []uint32{4075, 7395, 4076, 2914, 883, 1420, 16030, 3835, 14881, 10441, 13321, 3680, 15010, 25254, 263055, 263061, 263064} {
		t.Run(fmt.Sprint(entry), func(t *testing.T) {
			t.Parallel()
			id := guid.GUID(0xF130000000000000 | uint64(entry)<<24 | 1)
			got, handled := vanilla.ClassifyCritter(id)
			require.True(t, handled)
			require.Equal(t, units.Classification{Kind: units.KindCreature, Category: units.CategoryCritter, Known: true, TrackFight: false, RankedDamageTarget: false}, got)
			label, known := critters.Name(entry)
			require.True(t, known)
			require.NotEmpty(t, label)
		})
	}
}

func TestCritterNonmatchesAreUnhandled(t *testing.T) {
	t.Parallel()
	for name, id := range map[string]guid.GUID{
		"zero":                    0,
		"player":                  guid.GUID(4075<<24 | 1),
		"pet entry collision":     guid.GUID(0xF140000000000000 | 4075<<24 | 1),
		"object entry collision":  guid.GUID(0xF110000000000000 | 4075<<24 | 1),
		"vehicle entry collision": guid.GUID(0xF150000000000000 | 4075<<24 | 1),
		"unrecognized creature":   guid.GUID(0xF130000000000000 | 999999<<24 | 1),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			classification, handled := vanilla.ClassifyCritter(id)
			require.False(t, handled, "continue existing classification; do not report unknown here")
			require.Zero(t, classification)
		})
	}
}

func TestCritterClassificationDoesNotOwnObservations(t *testing.T) {
	t.Parallel()
	// The caller retains identity, labels and events. This demonstrates the data
	// boundary only; parsernext does not yet expose or filter an event pipeline.
	type observation struct {
		guid   guid.GUID
		name   string
		events []string
	}
	id := guid.GUID(0xF130000000000000 | 4075<<24 | 42)
	for _, name := range []string{"", "Observed Rat"} {
		caller := observation{guid: id, name: name, events: []string{"damage", "death"}}
		got, handled := vanilla.ClassifyCritter(caller.guid)
		require.True(t, handled)
		require.True(t, got.Known, "knownness does not depend on an observed name")
		require.False(t, got.TrackFight)
		require.False(t, got.RankedDamageTarget)
		require.Equal(t, id, caller.guid)
		require.Equal(t, name, caller.name)
		require.Equal(t, []string{"damage", "death"}, caller.events)
		entry, ok := caller.guid.GetEntry()
		require.True(t, ok)
		label, known := critters.Name(entry)
		require.True(t, known)
		require.Equal(t, "Rat", label)
	}
}

// This tests the shared data contract, not a vehicle/totem classifier or pipeline wiring.
func TestClassificationKindsAndCategories(t *testing.T) {
	t.Parallel()
	// Existing serialized values stay stable when new distinctions are appended.
	require.Equal(t, []units.Kind{0, 1, 2, 3, 4, 5}, []units.Kind{
		units.KindUnspecified, units.KindPlayer, units.KindCreature, units.KindPet, units.KindObject, units.KindVehicle,
	})
	require.Equal(t, []units.Category{0, 1, 2}, []units.Category{
		units.CategoryUnclassified, units.CategoryCritter, units.CategoryTotem,
	})
	// Category alone must not imply exclusion. Policy can represent a hostile
	// boss totem independently of an unranked, player-owned totem.
	for _, eligible := range []bool{false, true} {
		classification := units.Classification{Kind: units.KindCreature, Category: units.CategoryTotem, Known: true, TrackFight: eligible, RankedDamageTarget: eligible}
		require.Equal(t, units.CategoryTotem, classification.Category)
		require.Equal(t, eligible, classification.TrackFight)
		require.Equal(t, eligible, classification.RankedDamageTarget)
	}
}
