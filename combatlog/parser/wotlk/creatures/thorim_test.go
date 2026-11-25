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
	"github.com/Emyrk/chronicle/combatlog/parser/common/phases"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func newThorimTestCharacters() *characters.Characters {
	return characters.NewCharacters(
		unitdb.New(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		NewCharacterFactories(database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath}),
		identifier.NewIdentifier(map[uint32]identifier.Identity{}),
	)
}

func TestThorimPhaseDefinitions(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Thorim", ThorimPhaseDefinitions.EncounterName)
	require.Equal(t, []phases.Definition{
		{Key: ThorimPhaseKeyP1, Name: "Arena", Order: 0},
		{Key: ThorimPhaseKeyP2, Name: "Gauntlet", Order: 1},
		{Key: ThorimPhaseKeyP3, Name: "Thorim", Order: 2},
	}, ThorimPhaseDefinitions.Definitions)
}

func TestThorimPhaseTransitions(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldier := creatureGUID(32883)
	guard := creatureGUID(32874)
	thorim := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldier))
	require.NoError(t, err)

	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) {
		transitions = append(transitions, transition)
	})

	_, err = all.Process(testDamage(start.Add(10*time.Second), player, guard))
	require.NoError(t, err)
	require.Len(t, transitions, 1)
	require.Equal(t, soldier, transitions[0].SourceGUID)
	require.Equal(t, ThorimPhaseKeyP2, transitions[0].ToPhaseKey)

	immune := testDamage(start.Add(15*time.Second), player, thorim)
	immune.HitType = types.HitTypeImmune
	_, err = all.Process(immune)
	require.NoError(t, err)
	require.Len(t, transitions, 1)

	_, err = all.Process(testDamage(start.Add(20*time.Second), player, thorim))
	require.NoError(t, err)
	require.Len(t, transitions, 2)
	require.Equal(t, soldier, transitions[1].SourceGUID)
	require.Equal(t, ThorimPhaseKeyP3, transitions[1].ToPhaseKey)
}

func TestThorimActivityDoesNotKeepUnrelatedAddsAlive(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	commonerID := creatureGUID(32904)
	championID := creatureGUID(32876)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, commonerID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(30*time.Second), player, championID))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(61 * time.Second)))
	require.NoError(t, err)

	commoner, ok := all.Get(commonerID)
	require.True(t, ok)
	require.False(t, commoner.IsActive())
	require.Equal(t, start.Add(time.Minute), commoner.Periods()[0].End.Timestamp.Date())

	champion, ok := all.Get(championID)
	require.True(t, ok)
	require.True(t, champion.IsActive())
}

func TestThorimPolymorphRemovalDoesNotSplitArena(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	acolyteID := creatureGUID(32886)
	start := time.Date(2026, time.August, 3, 23, 19, 38, 929000000, time.UTC)

	_, err := all.Process(testDamage(start, acolyteID, player))
	require.NoError(t, err)

	// Observed 43z1htJBandK59kS: the same Dark Rune Acolyte was repeatedly
	// polymorphed between arena waves. Each removal previously entered the generic
	// five-second reset grace and produced another Thorim reset encounter.
	processPolymorph := func(appliedAt time.Duration) {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(appliedAt)),
			Target:      acolyteID,
			SpellName:   "Polymorph",
			Amount:      1,
			State:       types.AuraStateAdded,
		})
		require.NoError(t, err)
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(appliedAt + 10*time.Second)),
			Target:      acolyteID,
			SpellName:   "Polymorph",
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
		_, err = all.Process(messages.TimedOut(start.Add(appliedAt + 16*time.Second)))
		require.NoError(t, err)
	}

	processPolymorph(42 * time.Second)
	processPolymorph(70 * time.Second)
	// Damage between control applications mirrors the Acolyte's observed Holy
	// Smite activity and keeps the normal 60-second inactivity window alive.
	_, err = all.Process(testDamage(start.Add(100*time.Second), acolyteID, player))
	require.NoError(t, err)
	processPolymorph(140 * time.Second)
	_, err = all.Process(testDamage(start.Add(170*time.Second), acolyteID, player))
	require.NoError(t, err)
	processPolymorph(210 * time.Second)

	acolyte, ok := all.Get(acolyteID)
	require.True(t, ok)
	require.True(t, acolyte.IsActive())
	require.Equal(t, period.EndStateNone, acolyte.LastEndState())
	require.Len(t, acolyte.Periods(), 1)
}

func TestThorimOverkillMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldierID := creatureGUID(32883)
	thorimID := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldierID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, thorimID))
	require.NoError(t, err)

	defeat := testDamage(start.Add(2*time.Second), player, thorimID)
	defeat.Overkill = 939
	_, err = all.Process(defeat)
	require.NoError(t, err)

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.False(t, thorim.IsActive())
	require.Equal(t, period.EndStateSlain, thorim.LastEndState())

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.False(t, soldier.IsActive())
	require.Equal(t, period.EndStateSlain, soldier.LastEndState())
}

func TestThorimEvadeMarksSurrenderAsSlain(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldierID := creatureGUID(32883)
	thorimID := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldierID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, thorimID))
	require.NoError(t, err)

	defeat := testDamage(start.Add(2*time.Second), player, thorimID)
	defeat.Amount = 0
	defeat.HitType = types.HitTypeEvade
	_, err = all.Process(defeat)
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(defeat.Date().Add(thorimEvadeConfirmationWindow)))
	require.NoError(t, err)

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.False(t, thorim.IsActive())
	require.Equal(t, period.EndStateSlain, thorim.LastEndState())

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.False(t, soldier.IsActive())
	require.Equal(t, period.EndStateSlain, soldier.LastEndState())
}

func TestThorimTransientEvadeDoesNotSplitActivePull(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldierID := creatureGUID(32883)
	thorimID := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 15, 18, 5, 40, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldierID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, thorimID))
	require.NoError(t, err)

	evade := testDamage(start.Add(2*time.Second), player, thorimID)
	evade.Amount = 0
	evade.HitType = types.HitTypeEvade
	_, err = all.Process(evade)
	require.NoError(t, err)

	// Observed nUL110Lu8bKMiYNO: an unrelated event arrived after the generic
	// 500ms confirmation window, then Thorim resumed attacking about three seconds
	// after the evade. This is a transient encounter mechanic, not a surrender.
	_, err = all.Process(&messages.Aura{
		MessageBase: messages.Base(start.Add(3 * time.Second)),
		Target:      player,
		SpellName:   "Moonkin Aura",
		State:       types.AuraStateRemoved,
	})
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(5*time.Second), thorimID, player))
	require.NoError(t, err)
	_, err = all.Process(messages.TimedOut(start.Add(8 * time.Second)))
	require.NoError(t, err)

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.True(t, thorim.IsActive())
	require.Equal(t, period.EndStateNone, thorim.LastEndState())
	require.Len(t, thorim.Periods(), 1)

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.True(t, soldier.IsActive())
	require.Equal(t, period.EndStateNone, soldier.LastEndState())
}

func TestThorimWipeAuraCleanupDoesNotMarkSurrender(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	soldierID := creatureGUID(32883)
	thorimID := creatureGUID(thorimEntry)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, player, soldierID))
	require.NoError(t, err)
	_, err = all.Process(testDamage(start.Add(time.Second), player, thorimID))
	require.NoError(t, err)

	for i := range scriptedKeeperAuraCleanupThreshold {
		_, err = all.Process(&messages.Aura{
			MessageBase: messages.Base(start.Add(time.Second + 50*time.Millisecond + time.Duration(i)*time.Millisecond)),
			Target:      thorimID,
			SpellName:   fmt.Sprintf("Debuff %d", i),
			State:       types.AuraStateRemoved,
		})
		require.NoError(t, err)
	}

	thorim, ok := all.Get(thorimID)
	require.True(t, ok)
	require.True(t, thorim.IsActive())
	require.Equal(t, period.EndStateNone, thorim.LastEndState())

	soldier, ok := all.Get(soldierID)
	require.True(t, ok)
	require.True(t, soldier.IsActive())
	require.Equal(t, period.EndStateNone, soldier.LastEndState())
}

func TestSifIsNeverActive(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	player := guid.GUID(1)
	sifID := creatureGUID(33196)
	start := time.Date(2026, time.August, 28, 12, 0, 0, 0, time.UTC)

	_, err := all.Process(testDamage(start, sifID, player))
	require.NoError(t, err)

	sif, ok := all.Get(sifID)
	require.True(t, ok)
	require.IsType(t, characters.NeverActive{}, sif)
	require.False(t, sif.IsActive())
	require.Empty(t, sif.Periods())

	info, ok := all.DB().Get(sifID)
	require.True(t, ok)
	require.Equal(t, "Sif", info.Name)
}

func TestThorimEncounterFactory(t *testing.T) {
	t.Parallel()

	all := newThorimTestCharacters()
	soldier, _ := all.Add(creatureGUID(32883), time.Time{})
	thorim, _ := all.Add(creatureGUID(thorimEntry), time.Time{})
	sif, _ := all.Add(creatureGUID(33196), time.Time{})

	require.IsType(t, &thorimCharacter{}, soldier)
	require.IsType(t, &thorimCharacter{}, thorim)
	require.IsType(t, characters.NeverActive{}, sif)
}

func TestThorimWaitsForPositiveIncomingDamage(t *testing.T) {
	t.Parallel()
	all := newThorimTestCharacters()
	player, boss := guid.GUID(1), creatureGUID(thorimEntry)
	start := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	process := func(m messages.Message) { _, err := all.Process(m); require.NoError(t, err) }
	process(testDamage(start, player, creatureGUID(32883)))
	thorim, _ := all.Add(boss, start)
	var transitions []phases.Transition
	all.SetPhaseTransitionCallback(func(transition phases.Transition) { transitions = append(transitions, transition) })
	outgoing := testDamage(start.Add(time.Second), boss, player)
	outgoing.SpellData = &chrondbc.Spell{ID: 62042}
	zero := testDamage(start.Add(2*time.Second), player, boss)
	zero.Amount = 0
	immune := testDamage(start.Add(3*time.Second), player, boss)
	immune.HitType = types.HitTypeImmune
	evade := testDamage(start.Add(4*time.Second), player, boss)
	evade.HitType = types.HitTypeEvade
	for _, m := range []messages.Message{
		outgoing, zero, immune, evade,
		&messages.SpellGo{MessageBase: messages.Base(start.Add(5 * time.Second)), Caster: boss, SpellData: &chrondbc.Spell{ID: 62042}},
		&messages.Aura{MessageBase: messages.Base(start.Add(6 * time.Second)), Target: boss, SpellName: "Polymorph", Amount: 1},
	} {
		process(m)
		require.False(t, thorim.IsActive())
		require.Empty(t, thorim.Periods())
		require.Empty(t, transitions)
	}
	process(testDamage(start.Add(10*time.Second), player, creatureGUID(32874)))
	require.Len(t, transitions, 1)
	require.False(t, thorim.IsActive())
	hitAt := start.Add(20 * time.Second)
	process(testDamage(hitAt, player, boss))
	require.True(t, thorim.IsActive())
	require.Len(t, thorim.Periods(), 1)
	require.Equal(t, hitAt, thorim.Periods()[0].Start.Timestamp.Date())
	require.Len(t, transitions, 2)
	require.Equal(t, ThorimPhaseKeyP3, transitions[1].ToPhaseKey)
	// Once engaged, outgoing damage continues normal activity.
	process(testDamage(start.Add(30*time.Second), boss, player))
	require.True(t, thorim.IsActive())
	// Expiry on an outgoing event must not reopen activity without a fresh hit.
	process(testDamage(start.Add(100*time.Second), boss, player))
	require.False(t, thorim.IsActive())
	require.Len(t, thorim.Periods(), 1)
	process(testDamage(start.Add(101*time.Second), player, boss))
	require.True(t, thorim.IsActive())
	require.Len(t, thorim.Periods(), 2)
	require.Equal(t, start.Add(101*time.Second), thorim.Periods()[1].Start.Timestamp.Date())
}
