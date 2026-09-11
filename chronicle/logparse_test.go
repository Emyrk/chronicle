package chronicle

import (
	"errors"
	"slices"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestInferTalentSubSpec(t *testing.T) {
	t.Parallel()

	feralTalents := []talents.TalentEntry{
		{Name: "Thick Hide", TabIndex: 0},
		{Name: "Feral Charge", TabIndex: 1},
		{Name: "Feral Instinct", TabIndex: 2},
		{Name: "Improved Shred", TabIndex: 3},
	}
	enhancementTalents := []talents.TalentEntry{
		{Name: "Totemic Alignment", TabIndex: 0},
		{Name: "Ancestral Guardian", TabIndex: 1},
		{Name: "Spirit Armor", TabIndex: 2},
		{Name: "Flurry", TabIndex: 3},
	}
	treeData := &talents.TalentTreeData{Classes: map[int32]talents.ClassTalentData{
		7:  {Tabs: []talents.TalentTabData{{Name: "Enhancement", Talents: enhancementTalents}}},
		11: {Tabs: []talents.TalentTabData{{Name: "Feral Combat", Talents: feralTalents}}},
	}}
	flavor := database.WoWFlavor{database.FlavorVanilla, database.FlavorNightmareOfUrsol}

	for _, tt := range []struct {
		name    string
		class   string
		spec    string
		flavor  database.WoWFlavor
		talents *combatant.Talents
		want    string
	}{
		{name: "all bear markers is bear", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 1, 0}, nil}}, want: "Bear"},
		{name: "all bear markers override improved shred", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 1, 1}, nil}}, want: "Bear"},
		{name: "missing thick hide is cat", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {0, 1, 1, 0}, nil}}, want: "Cat"},
		{name: "missing feral charge is cat", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 0, 1, 0}, nil}}, want: "Cat"},
		{name: "missing feral instinct is cat", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 0, 0}, nil}}, want: "Cat"},
		{name: "otherwise cat", class: "DRUID", spec: "Feral", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {0, 0, 0, 1}, nil}}, want: "Cat"},
		{name: "all enhancement tank markers is tank", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 1, 0}, nil}}, want: "Tank"},
		{name: "all enhancement tank markers override dps talent", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 1, 1}, nil}}, want: "Tank"},
		{name: "missing totemic alignment is dps", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {0, 1, 1, 0}, nil}}, want: "DPS"},
		{name: "missing ancestral guardian is dps", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 0, 1, 0}, nil}}, want: "DPS"},
		{name: "missing spirit armor is dps", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 0, 0}, nil}}, want: "DPS"},
		{name: "otherwise enhancement dps", class: "SHAMAN", spec: "Enhancement", flavor: flavor, talents: &combatant.Talents{Trees: [3][]uint8{nil, {0, 0, 0, 1}, nil}}, want: "DPS"},
		{name: "non nightmare has no sub spec", class: "DRUID", spec: "Feral", flavor: database.WoWFlavor{database.FlavorVanilla}, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1}, nil}}},
		{name: "non nightmare enhancement has no sub spec", class: "SHAMAN", spec: "Enhancement", flavor: database.WoWFlavor{database.FlavorVanilla}, talents: &combatant.Talents{Trees: [3][]uint8{nil, {1, 1, 1}, nil}}},
		{name: "non feral has no sub spec", class: "DRUID", spec: "Balance", flavor: flavor, talents: &combatant.Talents{}},
		{name: "non enhancement shaman has no sub spec", class: "SHAMAN", spec: "Restoration", flavor: flavor, talents: &combatant.Talents{}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, tt.want, inferTalentSubSpec(tt.class, tt.spec, tt.talents, tt.flavor, treeData))
		})
	}
}

func TestSlugCollisionFromLookup(t *testing.T) {
	t.Parallel()

	t.Run("existing slug collides", func(t *testing.T) {
		t.Parallel()
		collides, err := slugCollisionFromLookup(nil)
		require.NoError(t, err)
		require.True(t, collides)
	})

	t.Run("missing slug does not collide", func(t *testing.T) {
		t.Parallel()
		collides, err := slugCollisionFromLookup(pgx.ErrNoRows)
		require.NoError(t, err)
		require.False(t, collides)
	})

	t.Run("database errors are not swallowed", func(t *testing.T) {
		t.Parallel()
		lookupErr := errors.New("lookup failed")
		collides, err := slugCollisionFromLookup(lookupErr)
		require.False(t, collides)
		require.ErrorIs(t, err, lookupErr)
		require.ErrorContains(t, err, "check colliding slug")
	})
}

func TestResolveLogFlavor(t *testing.T) {
	t.Parallel()

	base := database.WoWFlavor{database.FlavorWrath, database.FlavorAzerothcore}
	additional := database.WoWFlavor{database.FlavorAzerothcoreProgression}

	for _, tt := range []struct {
		name     string
		current  database.WoWFlavor
		explicit bool
		resolved ResolvedDataset
		want     database.WoWFlavor
		changed  bool
	}{
		{
			name:     "new log uses dataset plus tenant tags",
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
			changed:  true,
		},
		{
			name:     "reparse augments persisted flavor",
			current:  base,
			explicit: true,
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
			changed:  true,
		},
		{
			name:     "already resolved flavor is unchanged",
			current:  base.Merge(additional),
			explicit: true,
			resolved: ResolvedDataset{Flavor: base, AdditionalFlavor: additional},
			want:     base.Merge(additional),
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, changed := resolveLogFlavor(tt.current, tt.explicit, tt.resolved)
			if !slices.Equal(got, tt.want) {
				t.Fatalf("resolveLogFlavor() = %v, want %v", got, tt.want)
			}
			if changed != tt.changed {
				t.Fatalf("resolveLogFlavor() changed = %v, want %v", changed, tt.changed)
			}
		})
	}
}
