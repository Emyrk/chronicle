package creatures

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func newIcecrownTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(),
		NewCharacterFactories(database.WoWFlavor{database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestGunshipPositiveOverkillMarksShipDefeated(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	player := guid.GUID(1)
	ship := creatureGUID(orgrimsHammerEntry)
	start := time.Date(2026, time.November, 5, 20, 28, 6, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      ship,
		Amount:      1500,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(4*time.Minute + 44*time.Second)),
		Caster:      &player,
		Target:      ship,
		Amount:      1500,
		Overkill:    1290,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	got, ok := all.Get(ship)
	require.True(t, ok)
	require.False(t, got.IsActive())
	require.Equal(t, period.EndStateSlain, got.LastEndState())
}

func TestGunshipVehicleGUIDUsesScriptedCharacter(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	player := guid.GUID(1)
	ship := vehicleGUID(orgrimsHammerEntry)
	cannon := vehicleGUID(36838)
	start := time.Date(2026, time.October, 25, 13, 1, 0, 0, time.UTC)
	_, err := all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: cannon, Amount: 1, HitType: types.HitTypeHit})
	require.NoError(t, err)
	_, err = all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: ship, Amount: 1500, HitType: types.HitTypeHit})
	require.NoError(t, err)
	_, err = all.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Second)), Caster: &player, Target: ship, Amount: 1500, Overkill: 1499, HitType: types.HitTypeHit})
	require.NoError(t, err)

	got, ok := all.Get(ship)
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, got.LastEndState())
	gotCannon, ok := all.Get(cannon)
	require.True(t, ok)
	require.Equal(t, period.EndStateSlain, gotCannon.LastEndState())
}

func vehicleGUID(entry uint32) guid.GUID {
	return guid.GUID(0xF150000000000001 | uint64(entry)<<24)
}

func TestValithriaDreamwalkersRageMarksVictory(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	attacker := creatureGUID(37868)
	valithria := creatureGUID(valithriaDreamwalkerEntry)
	start := time.Date(2026, time.November, 5, 22, 19, 40, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &attacker,
		Target:      valithria,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	victory := start.Add(7*time.Minute + 41*time.Second)
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(victory),
		Caster:      &valithria,
		Target:      attacker,
		SpellID:     dreamwalkersRageSpellID,
		Amount:      1_000_000,
		Overkill:    999_999,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	got, ok := all.Get(valithria)
	require.True(t, ok)
	require.False(t, got.IsActive())
	require.Equal(t, period.EndStateSlain, got.LastEndState())
}

func TestGunshipVictoryEndsLinkedCrewForBothFactions(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name      string
		shipEntry uint32
		addEntry  uint32
	}{
		{name: "Orgrims Hammer", shipEntry: orgrimsHammerEntry, addEntry: 36957},
		{name: "The Skybreaker", shipEntry: theSkybreakerEntry, addEntry: 36950},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			all := newIcecrownTestCharacters()
			player := guid.GUID(1)
			ship := creatureGUID(tc.shipEntry)
			add := creatureGUID(tc.addEntry)
			start := time.Date(2026, time.October, 31, 20, 35, 0, 0, time.UTC)

			_, err := all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: add, Amount: 1, HitType: types.HitTypeHit})
			require.NoError(t, err)
			_, err = all.Process(&messages.Damage{MessageBase: messages.Base(start.Add(time.Second)), Caster: &player, Target: ship, Amount: 1500, Overkill: 1499, HitType: types.HitTypeHit})
			require.NoError(t, err)

			gotAdd, ok := all.Get(add)
			require.True(t, ok)
			require.False(t, gotAdd.IsActive())
			require.Equal(t, period.EndStateSlain, gotAdd.LastEndState())
		})
	}
}

func TestLichKingScriptedEpilogueDoesNotTimeout(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	player := guid.GUID(1)
	lichKing := creatureGUID(theLichKingEntry)
	start := time.Date(2026, time.October, 31, 22, 29, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: lichKing, Amount: 1, HitType: types.HitTypeHit})
	require.NoError(t, err)
	for i, id := range []chrondbc.SpellID{74270, 72262, 74273, 72262, 72350} {
		_, err = all.Process(&messages.SpellStart{MessageBase: messages.Base(start.Add(time.Duration(i+1) * time.Second)), Caster: lichKing, SpellID: id})
		require.NoError(t, err)
	}
	fury := start.Add(5 * time.Second)
	_, err = all.Process(&messages.SpellGo{MessageBase: messages.Base(fury.Add(79 * time.Second)), Caster: lichKing, SpellID: 71769})
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(fury.Add(79*time.Second + 116*time.Second)))
	require.NoError(t, err)

	got, ok := all.Get(lichKing)
	require.True(t, ok)
	require.True(t, got.IsActive())
}

func TestLichKingOrdinaryAttemptStillUsesDefaultTimeout(t *testing.T) {
	t.Parallel()

	all := newIcecrownTestCharacters()
	player := guid.GUID(1)
	lichKing := creatureGUID(theLichKingEntry)
	start := time.Date(2026, time.October, 25, 14, 41, 19, 0, time.UTC)
	_, err := all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: lichKing, Amount: 1, HitType: types.HitTypeHit})
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(90 * time.Second)))
	require.NoError(t, err)

	got, ok := all.Get(lichKing)
	require.True(t, ok)
	require.False(t, got.IsActive())
}

func TestIcecrownPhaseTransitions(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		bossEntry  uint32
		messages   func(guid.GUID, time.Time) []messages.Message
		wantPhases []string
	}{
		{
			name:      "Lady Deathwhisper",
			bossEntry: ladyDeathwhisperEntry,
			messages: func(boss guid.GUID, at time.Time) []messages.Message {
				return []messages.Message{&messages.Aura{MessageBase: messages.Base(at), Target: boss, SpellID: manaBarrierSpellID, State: types.AuraStateRemoved, Transition: messages.AuraTransitionRemoved}}
			},
			wantPhases: []string{LadyDeathwhisperPhaseKeyP2},
		},
		{
			name:      "Professor Putricide",
			bossEntry: professorPutricideEntry,
			messages: func(boss guid.GUID, at time.Time) []messages.Message {
				return []messages.Message{
					// Create Concoction is not a reliable phase boundary in the supplied logs.
					&messages.SpellStart{MessageBase: messages.Base(at), Caster: boss, SpellID: 72852},
					&messages.SpellStart{MessageBase: messages.Base(at.Add(time.Second)), Caster: boss, SpellID: 73122},
				}
			},
			wantPhases: []string{ProfessorPutricidePhaseKeyP3},
		},
		{
			name:      "Sindragosa",
			bossEntry: sindragosaEntry,
			messages: func(boss guid.GUID, at time.Time) []messages.Message {
				return []messages.Message{&messages.Aura{MessageBase: messages.Base(at), Source: &boss, Target: guid.GUID(2), SpellID: 72530, State: types.AuraStateAdded, Transition: messages.AuraTransitionApplied}}
			},
			wantPhases: []string{SindragosaPhaseKeyP3},
		},
		{
			name:      "The Lich King",
			bossEntry: theLichKingEntry,
			messages: func(boss guid.GUID, at time.Time) []messages.Message {
				ids := []chrondbc.SpellID{74270, 72262, 74273, 72262, 72350}
				result := make([]messages.Message, 0, len(ids))
				for i, id := range ids {
					result = append(result, &messages.SpellStart{MessageBase: messages.Base(at.Add(time.Duration(i) * time.Second)), Caster: boss, SpellID: id})
				}
				return result
			},
			wantPhases: []string{LichKingPhaseKeyTransition1, LichKingPhaseKeyP2, LichKingPhaseKeyTransition2, LichKingPhaseKeyP3, LichKingPhaseKeyEpilogue},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			all := newIcecrownTestCharacters()
			var transitions []phases.Transition
			all.SetPhaseTransitionCallback(func(transition phases.Transition) { transitions = append(transitions, transition) })
			boss := creatureGUID(tc.bossEntry)
			player := guid.GUID(1)
			start := time.Date(2026, time.October, 31, 20, 0, 0, 0, time.UTC)
			_, err := all.Process(&messages.Damage{MessageBase: messages.Base(start), Caster: &player, Target: boss, Amount: 1, HitType: types.HitTypeHit})
			require.NoError(t, err)
			for _, message := range tc.messages(boss, start.Add(time.Second)) {
				_, err = all.Process(message)
				require.NoError(t, err)
			}

			got := make([]string, 0, len(transitions))
			for _, transition := range transitions {
				got = append(got, transition.ToPhaseKey)
			}
			require.Equal(t, tc.wantPhases, got)
		})
	}
}
