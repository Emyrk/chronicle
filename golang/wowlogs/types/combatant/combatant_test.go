package combatant_test

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
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
			name:    "DoydNoGuid",
			content: "COMBATANT_INFO: 11.11.25 08:58:09&Doyd&ROGUE&Scourge&2&nil&Exalted with Doordash&Friendly&4&8176:0:0:0&61422:0:0:0&9647:0:0:0&60058:0:0:0&83401:18:0:0&14598:0:0:0&8193:18:0:0&9633:18:0:0&7378:0:0:0&4107:17:0:0&9533:0:0:0&60835:0:0:0&60587:0:0:0&58073:0:0:0&6432:0:0:0&9684:0:0:0&61330:0:0:0&55474:0:0:0&5976:0:0:0&005103000000000000}055051000050122231}00000000000000000000",
			exp: combatant.Combatant{
				Seen:      time.Date(2025, 11, 11, 8, 58, 9, 0, time.UTC),
				Name:      "Doyd",
				HeroClass: types.HeroClassesROGUE,
				Gender:    types.HeroGenderMale,
				Race:      types.HeroRacesScourge,
				PetName:   "",
				Guild: &combatant.Guild{
					Name:      "Exalted with Doordash",
					RankName:  "Friendly",
					RankIndex: "4",
				},
				GearSetups: nil,
				Talents:    nil,
			},
		},
		{
			name:    "NotMeGUID",
			content: `COMBATANT_INFO: 20.11.25 22:07:48&Aramarah&WARLOCK&Troll&3&nil&nil&nil&nil&55337:0:0:0&nil&1769:0:0:0&2575:0:0:0&6465:44:0:0&14373:0:0:0&15449:0:0:0&3065:0:0:0&15452:41:0:0&14162:0:761:0&12053:0:0:0&55317:0:0:0&55340:0:0:0&70033:0:0:0&70224:0:0:0&15444:0:0:0&nil&5243:0:0:0&nil&nil&0x00000000000EBF01`,
			exp: combatant.Combatant{
				Name:       "Aramarah",
				Guid:       must(guid.FromString("0x00000000000EBF01")),
				Seen:       time.Date(2025, 11, 20, 22, 7, 48, 0, time.UTC),
				HeroClass:  types.HeroClassesWARLOCK,
				Gender:     types.HeroGenderFemale,
				Race:       types.HeroRacesTroll,
				PetName:    "",
				Guild:      nil,
				GearSetups: nil,
				Talents:    nil,
			},
		},
		{
			name:    "MeDoyd",
			content: `COMBATANT_INFO: 20.11.25 19:33:23&Doyd&ROGUE&Scourge&2&nil&Exalted with Doordash&Friendly&4&8176:0:0:0&60300:0:0:0&9647:0:0:0&60058:0:0:0&83401:18:0:0&13118:0:0:0&60268:1843:0:0&9948:1843:612:0&16710:0:0:0&4107:17:0:0&9533:0:0:0&60835:0:0:0&60587:0:0:0&58073:0:0:0&6432:0:0:0&9684:0:0:0&61330:0:0:0&55474:0:0:0&5976:0:0:0&nil&0x000000000001C7AC`,
			exp: combatant.Combatant{
				Name:      "Doyd",
				Guid:      guid.GUID(0x000000000001C7AC),
				Seen:      time.Date(2025, 11, 12, 19, 33, 23, 0, time.UTC),
				HeroClass: types.HeroClassesROGUE,
				Gender:    types.HeroGenderMale,
				Race:      types.HeroRacesScourge,
				PetName:   "",
				Guild: &combatant.Guild{
					Name:      "Exalted with Doordash",
					RankName:  "",
					RankIndex: "",
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

			c.exp.Seen = c.exp.Seen.Truncate(time.Second)
			player.Seen = player.Seen.Truncate(time.Second)

			require.NoError(t, err)
			require.Equal(t, c.exp, player)
		})
	}
}

func must[T any](t T, err error) T {
	if err != nil {
		panic(err)
	}
	return t
}
