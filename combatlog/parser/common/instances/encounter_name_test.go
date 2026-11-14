package instances

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/stretchr/testify/require"
)

func TestFightEncounterName(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name          string
		names         []string
		want          string
		boss          bool
		explicit      string
		function      string
		authoritative string
	}{
		{name: "majority counts mobs sharing name not activity periods or entry IDs", names: []string{"Alpha", "Zulu", "Zulu"}, want: "Zulu"},
		{name: "alphabetical tie", names: []string{"Zulu", "Alpha", "Beta"}, want: "Alpha"},
		{name: "empty names ignored", names: []string{"", "", "Zulu"}, want: "Zulu"},
		{name: "all empty", names: []string{"", "", ""}, want: ""},
		{name: "boss overrides trash majority", names: []string{"Zulu Boss", "Alpha", "Alpha"}, want: "Zulu Boss", boss: true},
		{name: "explicit encounter overrides majority", names: []string{"Zulu Boss", "Alpha", "Alpha"}, want: "Named encounter", boss: true, explicit: "Named encounter"},
		{name: "function overrides majority", names: []string{"Zulu Boss", "Alpha", "Alpha"}, want: "Function encounter", function: "Function encounter"},
		{name: "authoritative overrides majority", names: []string{"Zulu Boss", "Alpha", "Alpha"}, want: "Authoritative encounter", authoritative: "Authoritative encounter"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			// Exercise every insertion order; tied starts cannot provide a naming order.
			for _, order := range [][]int{{0, 1, 2}, {0, 2, 1}, {1, 0, 2}, {1, 2, 0}, {2, 0, 1}, {2, 1, 0}} {
				base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
				identities := make(map[uint32]identifier.Identity)
				fight := encounter.Fight{Hostiles: make(map[guid.GUID]encounter.CharacterFight), Start: base, End: base.Add(time.Second), AuthoritativeName: tc.authoritative}
				for _, i := range order {
					entry := uint32(100 + i)
					gid := creatureGUID(entry, uint32(i+1))
					id := identifier.Identity{Name: tc.names[i], Affiliation: types.AffiliationHostile}
					if i == 0 {
						id.Boss = tc.boss
						id.EncounterName = tc.explicit
						if tc.function != "" {
							id.EncounterNameFn = func(encounter.Fight) *identifier.EncounterFuncResult {
								return &identifier.EncounterFuncResult{EncounterName: tc.function}
							}
						}
					}
					identities[entry] = id
					activity := period.Period{Start: &period.Moment{Timestamp: &messages.SpellGo{MessageBase: messages.Base(base), Caster: gid}}, End: &period.Moment{Timestamp: &messages.SpellGo{MessageBase: messages.Base(base.Add(time.Second)), Caster: gid}}, EndState: period.EndStateSlain}
					periods := []period.Period{activity}
					// One highly active mob still contributes only one vote.
					if i == 0 {
						periods = []period.Period{activity, activity, activity, activity}
					}
					fight.Hostiles[gid] = encounter.CharacterFight{ID: gid, Activity: periods}
				}
				h := &Hookable{Identifier: identifier.NewIdentifier(identities)}
				got, err := h.fightEncounter(fight)
				require.NoError(t, err)
				require.Equal(t, tc.want, got.Name, "insertion order %v", order)
				require.Equal(t, tc.boss || tc.function != "" || tc.authoritative != "", got.Boss)
			}
		})
	}
}
