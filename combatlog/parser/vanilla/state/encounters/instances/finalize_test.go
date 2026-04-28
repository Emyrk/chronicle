package instances

import (
	"context"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/unitdb"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func creatureGUID(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry&0xFFFFFF)<<24 | uint64(seed&0xFFFFFF))
}

// TestFinalize_King_AllAddsKilled_BossAbsent_IsWipe tests the scenario where
// chess-piece adds are killed but the King boss (entry 59967) never appeared in
// the fight. The adds' EncounterNameFn declares boss 59967 as required via
// bossesRequired, so this should be classified as a wipe.
//
// Known bug: the kill-type logic in Finalize does not check aBossRemains when
// all present hostiles are slain (len(Timeouts)==0, Slain>0). It currently
// returns KillTypeClean instead of KillTypeWipe.
func TestFinalize_King_AllAddsKilled_BossAbsent_IsWipe(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	player := guid.GUID(0x1)

	// Only adds — King (59967) is NOT in the fight.
	// Their EncounterNameFn declares boss 59967 as required.
	pawnGUID := creatureGUID(59972, 1)
	queenGUID := creatureGUID(59953, 2)

	startMsg := &messages.Damage{
		MessageBase: messages.Base(base),
		Caster:      &player,
		Target:      pawnGUID,
		Amount:      1,
	}

	slainMoment := func(ts time.Time) *period.Moment {
		return &period.Moment{
			Timestamp: &messages.Slain{
				MessageBase: messages.Base(ts),
				Victim:      pawnGUID,
				Killer:      &player,
			},
			Reason: "slain",
		}
	}

	startMoment := &period.Moment{Timestamp: startMsg, Reason: "damage"}

	fight := Fight{
		EncounterID: uuid.New(),
		Hostiles: map[guid.GUID]CharacterFight{
			pawnGUID: {
				ID: pawnGUID,
				Activity: []period.Period{{
					Start:    startMoment,
					End:      slainMoment(base.Add(30 * time.Second)),
					EndState: period.EndStateSlain,
				}},
			},
			queenGUID: {
				ID: queenGUID,
				Activity: []period.Period{{
					Start:    startMoment,
					End:      slainMoment(base.Add(45 * time.Second)),
					EndState: period.EndStateSlain,
				}},
			},
		},
		PlayerDeaths: []messages.Message{startMsg}, // player died → wipe not reset
		Start:        base,
		End:          base.Add(45 * time.Second),
	}

	hostiles := TowerOfKarazhanHostiles()
	h := &Hookable{
		Identifier:      NewIdentifier(hostiles),
		units:           unitdb.New(),
		completedFights: []Fight{fight},
	}

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	enc := result.Encounters[0]
	require.Equal(t, "King", enc.Name)
	require.True(t, enc.Boss, "EncounterNameFn marks this as a boss fight")
	require.Equal(t, KillTypeWipe, enc.KillType,
		"adds dead + boss required but absent + player deaths = wipe")
}

func TestFinalize_InconsistentHostileIDMapping_ReturnsError(t *testing.T) {
	t.Parallel()

	realGUID := creatureGUID(59972, 1)
	wrongGUID := creatureGUID(59972, 2)
	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	startMsg := &messages.Damage{
		MessageBase: messages.Base(base),
		Amount:      1,
	}

	h := &Hookable{
		Identifier: NewIdentifier(TowerOfKarazhanHostiles()),
		units:      unitdb.New(),
		completedFights: []Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]CharacterFight{
				wrongGUID: {
					ID: realGUID,
					Activity: []period.Period{{
						Start:    &period.Moment{Timestamp: startMsg, Reason: "damage"},
						End:      &period.Moment{Timestamp: startMsg, Reason: "damage"},
						EndState: period.EndStateTimeout,
					}},
				},
			},
			Start: base,
			End:   base,
		}},
	}

	result, err := h.Finalize(context.Background())
	require.Nil(t, result)
	require.Error(t, err)
	require.Contains(t, err.Error(), "inconsistent hostile ID mapping")
}

func TestFinalize_AQ40OuroSpawnerNamesOuro(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	spawnerGUID := creatureGUID(15957, 1)
	startMsg := &messages.SpellGo{
		MessageBase: messages.Base(base),
		Caster:      spawnerGUID,
	}
	endMsg := &messages.SpellGo{
		MessageBase: messages.Base(base.Add(20 * time.Second)),
		Caster:      spawnerGUID,
	}

	h := &Hookable{
		Identifier: NewIdentifier(TempleOfAhnQirajHostiles()),
		units:      unitdb.New(),
		completedFights: []Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]CharacterFight{
				spawnerGUID: {
					ID: spawnerGUID,
					Activity: []period.Period{{
						Start:    &period.Moment{Timestamp: startMsg, Reason: "creature spell"},
						End:      &period.Moment{Timestamp: endMsg, Reason: "creature spell"},
						EndState: period.EndStateTimeout,
					}},
				},
			},
			Start: base,
			End:   base.Add(20 * time.Second),
		}},
	}

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, "Ouro", result.Encounters[0].Name)
}

func TestFinalize_AQ40PrefersEarliestNamedHostile(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	skeramGUID := creatureGUID(15263, 1)
	ouroGUID := creatureGUID(15517, 2)

	skeramStartMsg := &messages.SpellGo{
		MessageBase: messages.Base(base),
		Caster:      skeramGUID,
	}
	skeramEndMsg := &messages.SpellGo{
		MessageBase: messages.Base(base.Add(30 * time.Second)),
		Caster:      skeramGUID,
	}
	ouroStartMsg := &messages.SpellGo{
		MessageBase: messages.Base(base.Add(2 * time.Minute)),
		Caster:      ouroGUID,
	}
	ouroEndMsg := &messages.SpellGo{
		MessageBase: messages.Base(base.Add(3 * time.Minute)),
		Caster:      ouroGUID,
	}

	h := &Hookable{
		Identifier: NewIdentifier(TempleOfAhnQirajHostiles()),
		units:      unitdb.New(),
		completedFights: []Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]CharacterFight{
				ouroGUID: {
					ID: ouroGUID,
					Activity: []period.Period{{
						Start:    &period.Moment{Timestamp: ouroStartMsg, Reason: "creature spell"},
						End:      &period.Moment{Timestamp: ouroEndMsg, Reason: "creature spell"},
						EndState: period.EndStateTimeout,
					}},
				},
				skeramGUID: {
					ID: skeramGUID,
					Activity: []period.Period{{
						Start:    &period.Moment{Timestamp: skeramStartMsg, Reason: "creature spell"},
						End:      &period.Moment{Timestamp: skeramEndMsg, Reason: "creature spell"},
						EndState: period.EndStateTimeout,
					}},
				},
			},
			Start: base,
			End:   base.Add(3 * time.Minute),
		}},
	}

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, "The Prophet Skeram", result.Encounters[0].Name)
	require.Equal(t, types.EncounterTypeBOSS, result.Encounters[0].Type)
}
