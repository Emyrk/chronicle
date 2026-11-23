package creatures

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
)

func newHodirTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestHodirOverkillMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirAlternateEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	defeat := &messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      100,
		Overkill:    1,
		HitType:     types.HitTypeHit,
	}
	_, err := all.Process(defeat)
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
}

func TestHodirEvadeMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	evadeAt := start.Add(time.Second)
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(evadeAt),
		Caster:      &player,
		Target:      hodirID,
		HitType:     types.HitTypeEvade,
	})
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(evadeAt.Add(characters.ScriptedDefeatEvadeConfirmationWindow)))
	require.NoError(t, err)

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
	require.Equal(t, evadeAt.Add(characters.ScriptedDefeatEvadeConfirmationWindow), hodir.Periods()[0].End.Timestamp.Date())
}

func TestHodirMassAuraCleanupAfterDamageMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	players := []guid.GUID{1, 2, 3}
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	for offset, player := range players {
		_, err := all.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(time.Duration(offset) * time.Millisecond)),
			Caster:      &player,
			Target:      hodirID,
			Amount:      5513,
			HitType:     types.HitTypeHit,
		})
		require.NoError(t, err)
	}

	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err := all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
	require.Equal(t, start.Add(57*time.Millisecond), hodir.Periods()[0].End.Timestamp.Date())
}

func TestHodirFullWipeAuraCleanupDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	players := []guid.GUID{1, 2, 3}
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.August, 28, 18, 42, 40, 0, time.UTC)

	for offset, player := range players {
		_, err := all.Process(&messages.Damage{
			MessageBase: messages.Base(start.Add(time.Duration(offset) * time.Millisecond)),
			Caster:      &player,
			Target:      hodirID,
			Amount:      5513,
			HitType:     types.HitTypeHit,
		})
		require.NoError(t, err)
	}
	lastDamage := start.Add(time.Second)
	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(lastDamage),
		Caster:      &players[0],
		Target:      hodirID,
		Amount:      633,
		HitType:     types.HitTypePeriodic,
	})
	require.NoError(t, err)
	for offset, player := range players {
		_, err = all.Process(&messages.Slain{
			MessageBase: messages.Base(lastDamage.Add(time.Duration(offset+1) * time.Millisecond)),
			Victim:      player,
		})
		require.NoError(t, err)
	}

	// Observed instance 3gVVsgMBWGnDSwuO: a full wipe removed eight distinct
	// Hodir debuffs 211-218ms after the last incoming damage.
	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(lastDamage.Add(211*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.True(t, hodir.IsActive())
	require.NotEqual(t, period.EndStateSlain, hodir.LastEndState())
}

func TestHodirAuraCleanupIgnoresEarlierPlayerDeaths(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	players := []guid.GUID{1, 2}
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.October, 29, 1, 47, 1, 577000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start.Add(-time.Second)),
		Caster:      &players[0],
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)
	_, err = all.Process(&messages.Slain{
		MessageBase: messages.Base(start),
		Victim:      players[0],
	})
	require.NoError(t, err)

	// Observed instance 5qmPS2lu8uHrbUQn: a player died about two seconds before
	// Hodir surrendered. Player deaths do not distinguish a kill from a wipe.
	lastDamage := start.Add(2 * time.Second)
	_, err = all.Process(&messages.Damage{
		MessageBase: messages.Base(lastDamage),
		Caster:      &players[1],
		Target:      hodirID,
		Amount:      5513,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)
	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(lastDamage.Add(2*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.False(t, hodir.IsActive())
	require.Equal(t, period.EndStateSlain, hodir.LastEndState())
}

func TestHodirAuraCleanupWithNoKnownParticipantsAliveDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	all.SetNoKnownParticipantsAliveProvider(func() bool { return true })
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.November, 5, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Removed debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.True(t, hodir.IsActive())
	require.NotEqual(t, period.EndStateSlain, hodir.LastEndState())
}

func TestHodirAuraCleanupRequiresRecentDamageAndBurst(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name      string
		firstAura time.Duration
		auraStep  time.Duration
	}{
		{name: "cleanup too long after damage", firstAura: time.Second, auraStep: time.Millisecond},
		{name: "removals are not a burst", firstAura: 50 * time.Millisecond, auraStep: 20 * time.Millisecond},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			all := newHodirTestCharacters()
			player := guid.GUID(1)
			hodirID := creatureGUID(hodirEntry)
			start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

			_, err := all.Process(&messages.Damage{
				MessageBase: messages.Base(start),
				Caster:      &player,
				Target:      hodirID,
				Amount:      1,
				HitType:     types.HitTypeHit,
			})
			require.NoError(t, err)

			for i := range scriptedKeeperAuraCleanupThreshold {
				_, err = all.Process(&messages.Aura{
					MessageBase: messages.Base(start.Add(test.firstAura + time.Duration(i)*test.auraStep)),
					Target:      hodirID,
					SpellName:   fmt.Sprintf("Debuff %d", i),
					State:       types.AuraStateRemoved,
				})
				require.NoError(t, err)
			}

			hodir, ok := all.Get(hodirID)
			require.True(t, ok)
			require.True(t, hodir.IsActive())
			require.Equal(t, period.EndStateNone, hodir.LastEndState())
		})
	}
}

func TestHodirWipeAuraCleanupDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	player := guid.GUID(1)
	hodirID := creatureGUID(hodirEntry)
	start := time.Date(2026, time.June, 10, 20, 46, 46, 412000000, time.UTC)

	_, err := all.Process(&messages.Damage{
		MessageBase: messages.Base(start),
		Caster:      &player,
		Target:      hodirID,
		Amount:      1,
		HitType:     types.HitTypeHit,
	})
	require.NoError(t, err)

	// Observed wipe OACkHpz1QQIMUV5o: the reset cleanup began 513ms after
	// the last incoming damage and removed only five distinct auras per 100ms.
	for i := range 5 {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(513 * time.Millisecond)),
			Target:      hodirID,
			SpellName:   fmt.Sprintf("Reset aura %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	hodir, ok := all.Get(hodirID)
	require.True(t, ok)
	require.True(t, hodir.IsActive())
	require.Equal(t, period.EndStateNone, hodir.LastEndState())
}

func TestHodirEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newHodirTestCharacters()
	for _, entry := range []uint32{hodirEntry, hodirAlternateEntry} {
		character, ok := NewHodirEncounterCharacter(creatureGUID(entry), all)
		require.True(t, ok)
		require.IsType(t, &hodirCharacter{}, character)
	}

	character, ok := NewHodirEncounterCharacter(creatureGUID(33213), all)
	require.False(t, ok)
	require.Nil(t, character)
}

// The first Hodir attempt in combatlog-1d0092b9-a4d7-4704-9e09-f2d856d38a52
// ended in a wipe. A reflected hit just before the lethal Frozen Blows brought
// reset cleanup inside the 100ms damage window, even with unknown survivors.
func TestHodirDamageAfterFinalHitRejectsWipeCleanup(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name                  string
		outgoingAmount        int32
		outgoingHitType       types.HitType
		finalHitAfterOutgoing bool
		wantSlain             bool
	}{
		{name: "lethal frozen blows after reflection", outgoingAmount: 31636, outgoingHitType: types.HitTypeHit},
		{name: "nonlethal continued combat", outgoingAmount: 3130, outgoingHitType: types.HitTypeHit},
		{name: "miss is not continued damage", outgoingHitType: types.HitTypeMiss, wantSlain: true},
		{name: "surrender after subsequent hit", outgoingAmount: 3130, outgoingHitType: types.HitTypeHit, finalHitAfterOutgoing: true, wantSlain: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			all := newHodirTestCharacters()
			player := guid.GUID(0x8B9ED)
			hodirID := guid.GUID(0xF13000804D0003D4)
			start := time.Date(2026, time.November, 22, 22, 0, 2, 365000000, time.UTC)
			process := func(m messages.Message) {
				t.Helper()
				_, err := all.Process(m)
				require.NoError(t, err)
			}

			// Log lines 237109-237110: reflection then Frozen Blows, same timestamp.
			process(&messages.Damage{
				MessageBase: messages.Base(start), Caster: &player, Target: hodirID,
				Amount: 163, HitType: types.HitTypeHit,
			})
			process(&messages.Damage{
				MessageBase: messages.Base(start), Caster: &hodirID, Target: player,
				Amount: tc.outgoingAmount, HitType: tc.outgoingHitType,
			})
			if tc.finalHitAfterOutgoing {
				process(&messages.Damage{
					MessageBase: messages.Base(start.Add(time.Millisecond)), Caster: &player, Target: hodirID,
					Amount: 100, HitType: types.HitTypeHit,
				})
			}
			if tc.outgoingAmount == 31636 {
				// UNIT_DIED at 22:00:02.369, line 237129.
				process(&messages.Slain{MessageBase: messages.Base(start.Add(4 * time.Millisecond)), Victim: player})
			}
			// Lines 237130-237137: eight distinct removals 83-84ms later.
			for i, name := range []string{"Deep Wounds", "Judgement of Wisdom", "Frost Vulnerability", "Hunter's Mark", "Blood Corruption", "Deadly Poison IX", "Frozen Blows", "Singed"} {
				process(&messages.Aura{
					MessageBase: messages.Base(start.Add(83*time.Millisecond + time.Duration(i/6)*time.Millisecond)),
					Target:      hodirID, SpellName: name, State: types.AuraStateRemoved,
				})
			}
			process(messages.TimedOut(start.Add(time.Second)))
			hodir, ok := all.Get(hodirID)
			require.True(t, ok)
			require.Equal(t, tc.wantSlain, hodir.LastEndState() == period.EndStateSlain)
		})
	}
}
