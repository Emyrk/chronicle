package combatant_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/combatant"
	"github.com/stretchr/testify/require"
)

func TestParseCombatant(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		content string
		expErr  bool

		exp combatant.Combatant
	}{
		{
			name:    "Doyd",
			content: "COMBATANT_INFO: 11.11.25 08:58:09&Doyd&ROGUE&Scourge&2&nil&Exalted with Doordash&Friendly&4&8176:0:0:0&61422:0:0:0&9647:0:0:0&60058:0:0:0&83401:18:0:0&14598:0:0:0&8193:18:0:0&9633:18:0:0&7378:0:0:0&4107:17:0:0&9533:0:0:0&60835:0:0:0&60587:0:0:0&58073:0:0:0&6432:0:0:0&9684:0:0:0&61330:0:0:0&55474:0:0:0&5976:0:0:0&005103000000000000}055051000050122231}00000000000000000000",
			exp: combatant.Combatant{
				Seen:      time.Date(2025, 11, 11, 8, 58, 9, 0, time.UTC),
				Name:      "Doyd",
				HeroClass: "ROGUE",
				Gender:    "2",
				Race:      "Scourge",
				PetName:   "nil",
				Guild: &combatant.Guild{
					Name:      "Exalted with Doordash",
					RankName:  "Friendly",
					RankIndex: "4",
				},
				GearSetups: nil,
				Talents:    nil,
			},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			player, err := combatant.ParseCombatantInfo(c.content)
			if c.expErr {
				require.Error(t, err)
				return
			}

			// Ignore some comparisons if unset
			if c.exp.GearSetups == nil {
				player.GearSetups = nil
			}

			if c.exp.Talents == nil {
				player.Talents = nil
			}

			require.NoError(t, err)
			require.Equal(t, c.exp, player)
		})
	}
}
