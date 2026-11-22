package scouting

import (
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/internal/ptr"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestStaticAttributes(t *testing.T) {
	t.Parallel()
	for _, token := range []string{"Human", "Orc", "Dwarf", "NightElf", "Scourge", "Tauren", "Gnome", "Troll", "Goblin", "BloodElf", "Draenei", "Skyborne"} {
		t.Run(token, func(t *testing.T) {
			t.Parallel()
			index, err := New([]Source{{Players: map[string]Player{"Player-1-00000001": {Race: token, Gender: ptr.Ref(2)}}}})
			require.NoError(t, err)
			race, gender := index.StaticAttributes(index.PlayerIDs()[0])
			require.Equal(t, types.HeroRaces(token), race)
			require.Equal(t, types.HeroGenderMale, gender)
		})
	}
	for _, tc := range []struct {
		name    string
		players []Player
		race    types.HeroRaces
		gender  types.HeroGender
	}{
		{"unknown", []Player{{Race: "CustomRace", Gender: ptr.Ref(0)}, {Race: "1", Gender: ptr.Ref(1)}, {Gender: ptr.Ref(99)}}, types.HeroRacesUnknown, types.HeroGenderUnknown},
		{"unknown does not erase", []Player{{}, {Race: "Human", Gender: ptr.Ref(3)}, {Race: "Future", Gender: ptr.Ref(99)}}, types.HeroRacesHuman, types.HeroGenderFemale},
		{"conflicts withheld", []Player{{Race: "Human", Gender: ptr.Ref(2)}, {Race: "Orc", Gender: ptr.Ref(3)}}, types.HeroRacesUnknown, types.HeroGenderUnknown},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			sources := make([]Source, len(tc.players))
			for i, p := range tc.players {
				sources[i] = Source{Players: map[string]Player{"Player-1-00000001": p}}
			}
			index, err := New(sources)
			require.NoError(t, err)
			race, gender := index.StaticAttributes(index.PlayerIDs()[0])
			require.Equal(t, tc.race, race)
			require.Equal(t, tc.gender, gender)
		})
	}
}
