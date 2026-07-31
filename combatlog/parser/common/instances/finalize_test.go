package instances

import (
	"bytes"
	"context"
	"log/slog"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounter"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func creatureGUID(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry&0xFFFFFF)<<24 | uint64(seed&0xFFFFFF))
}

const finalizeTestBossEntry uint32 = 900001

type finalizeLifecycleHook struct {
	instancehook.BaseHook
	calls        []string
	timeoutCount int
	cancel       context.CancelFunc
}

func (h *finalizeLifecycleHook) ProcessMessage(_ bool, _ uuid.UUID, m messages.Message) error {
	if _, ok := m.(*messages.Timeout); ok {
		h.timeoutCount++
		h.calls = append(h.calls, "timeout")
		if h.cancel != nil {
			h.cancel()
		}
	}
	return nil
}

func (h *finalizeLifecycleHook) FightEnded(_ uuid.UUID, _ messages.Message) {
	h.calls = append(h.calls, "fight-ended")
}

func (h *finalizeLifecycleHook) Finalize(context.Context) error {
	h.calls = append(h.calls, "finalize")
	return nil
}

func newFinalizeTestHookable(t *testing.T, extraHooks ...instancehook.Hook) *Hookable {
	t.Helper()

	hostiles := make(map[uint32]Identity)
	LoadBosses(hostiles, map[uint32]string{finalizeTestBossEntry: "Final Boss"})
	return NewHookable(context.Background(), slog.Default(), unitdb.New(), zone.Zone{Name: "test instance"}, InstanceParams{
		Name:       "Test Instance",
		Idf:        identifier.NewIdentifier(hostiles),
		ExtraHooks: extraHooks,
	})
}

func startFinalizeTestFight(t *testing.T, h *Hookable, at time.Time) (guid.GUID, guid.GUID) {
	t.Helper()

	player := guid.GUID(1)
	boss := creatureGUID(finalizeTestBossEntry, 1)
	require.NoError(t, h.Process(&messages.Damage{
		MessageBase: messages.Base(at),
		Caster:      &player,
		Target:      boss,
		Amount:      1,
	}))
	require.NotNil(t, h.currentFight)
	require.True(t, h.currentFight.active())
	return player, boss
}

func indexOfCall(calls []string, want string) int {
	for i, call := range calls {
		if call == want {
			return i
		}
	}
	return -1
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

	fight := encounter.Fight{
		EncounterID: uuid.New(),
		Hostiles: map[guid.GUID]encounter.CharacterFight{
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
		Identifier:      identifier.NewIdentifier(hostiles),
		units:           unitdb.New(),
		completedFights: []encounter.Fight{fight},
	}

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)

	enc := result.Encounters[0]
	require.Equal(t, "King", enc.Name)
	require.True(t, enc.Boss, "EncounterNameFn marks this as a boss fight")
	require.Equal(t, encounter.KillTypeWipe, enc.KillType,
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
		Identifier: identifier.NewIdentifier(TowerOfKarazhanHostiles()),
		units:      unitdb.New(),
		completedFights: []encounter.Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]encounter.CharacterFight{
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
		Identifier: identifier.NewIdentifier(TempleOfAhnQirajHostiles()),
		units:      unitdb.New(),
		completedFights: []encounter.Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]encounter.CharacterFight{
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
		Identifier: identifier.NewIdentifier(TempleOfAhnQirajHostiles()),
		units:      unitdb.New(),
		completedFights: []encounter.Fight{{
			EncounterID: uuid.New(),
			Hostiles: map[guid.GUID]encounter.CharacterFight{
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

func TestHookableFinalize_DrainsActiveFightAsReset(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	h := newFinalizeTestHookable(t)
	_, boss := startFinalizeTestFight(t, h, base)

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, encounter.KillTypeReset, result.Encounters[0].KillType)
	require.Contains(t, result.Encounters[0].Remaining, boss)

	activity := result.Encounters[0].Combat.Hostiles[boss].Activity
	require.Len(t, activity, 1)
	require.Equal(t, period.EndStateTimeout, activity[0].EndState)
	require.Equal(t, base.Add(characters.InactivityTimeout), activity[0].End.Timestamp.Date())
	require.Equal(t, base.Add(62*time.Second), h.lastProcessedAt)
}

func TestHookableFinalize_DrainsActiveFightAsWipe(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	h := newFinalizeTestHookable(t)
	player, boss := startFinalizeTestFight(t, h, base)
	require.NoError(t, h.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(10 * time.Second)),
		Victim:      player,
		Killer:      &boss,
	}))

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, encounter.KillTypeWipe, result.Encounters[0].KillType)
	require.Len(t, result.Encounters[0].Combat.PlayerDeaths, 1)
}

func TestHookableFinalize_DrainRunsNormalLifecycleOnce(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	hook := &finalizeLifecycleHook{}
	h := newFinalizeTestHookable(t, hook)
	_, _ = startFinalizeTestFight(t, h, base)

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Positive(t, hook.timeoutCount)
	require.Equal(t, 1, countCall(hook.calls, "fight-ended"))
	require.Equal(t, 1, countCall(hook.calls, "finalize"))
	require.Less(t, indexOfCall(hook.calls, "fight-ended"), indexOfCall(hook.calls, "finalize"))
	require.Nil(t, h.currentFight)

	_, err = h.Finalize(context.Background())
	require.ErrorContains(t, err, "finalization already started")
	require.Equal(t, 1, countCall(hook.calls, "fight-ended"))
	require.Equal(t, 1, countCall(hook.calls, "finalize"))
	require.ErrorContains(t, h.Process(messages.TimedOut(base.Add(time.Hour))), "after instance finalization started")
}

func TestHookableFinalize_DrainHonorsCanceledContext(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	hook := &finalizeLifecycleHook{}
	h := newFinalizeTestHookable(t, hook)
	_, _ = startFinalizeTestFight(t, h, base)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	result, err := h.Finalize(ctx)
	require.Nil(t, result)
	require.ErrorIs(t, err, context.Canceled)
	require.Zero(t, hook.timeoutCount)
}

func TestHookableFinalize_DrainStopsWhenContextCanceled(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	ctx, cancel := context.WithCancel(context.Background())
	hook := &finalizeLifecycleHook{cancel: cancel}
	h := newFinalizeTestHookable(t, hook)
	_, _ = startFinalizeTestFight(t, h, base)

	result, err := h.Finalize(ctx)
	require.Nil(t, result)
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 1, hook.timeoutCount)
}

func TestHookableFinalize_DoesNotTickCompletedFight(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	hook := &finalizeLifecycleHook{}
	h := newFinalizeTestHookable(t, hook)
	player, boss := startFinalizeTestFight(t, h, base)
	require.NoError(t, h.Process(&messages.Slain{
		MessageBase: messages.Base(base.Add(10 * time.Second)),
		Victim:      boss,
		Killer:      &player,
	}))
	require.Nil(t, h.currentFight)

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, encounter.KillTypeClean, result.Encounters[0].KillType)
	require.Zero(t, hook.timeoutCount)
	require.Equal(t, 1, countCall(hook.calls, "fight-ended"))
}

func TestHookableFinalize_UsesPerInstanceLastProcessedTimestamp(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	first := newFinalizeTestHookable(t)
	second := newFinalizeTestHookable(t)
	_, firstBoss := startFinalizeTestFight(t, first, base)
	_, secondBoss := startFinalizeTestFight(t, second, base.Add(3*time.Hour))

	firstResult, err := first.Finalize(context.Background())
	require.NoError(t, err)
	secondResult, err := second.Finalize(context.Background())
	require.NoError(t, err)

	firstActivity := firstResult.Encounters[0].Combat.Hostiles[firstBoss].Activity
	secondActivity := secondResult.Encounters[0].Combat.Hostiles[secondBoss].Activity
	require.Equal(t, base.Add(characters.InactivityTimeout), firstActivity[0].End.Timestamp.Date())
	require.Equal(t, base.Add(3*time.Hour+characters.InactivityTimeout), secondActivity[0].End.Timestamp.Date())
}

func TestHookableFinalize_HonorsCustomTimeout(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	h := newFinalizeTestHookable(t)
	h.Characters = characters.NewCharacters(h.units, []characters.CharacterFactory{
		func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
			if id != creatureGUID(finalizeTestBossEntry, 1) {
				return nil, false
			}
			return characters.NewCommonCharacter(id, all).WithTimeout(65 * time.Second), true
		},
	}, h.Identifier)
	_, boss := startFinalizeTestFight(t, h, base)

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	activity := result.Encounters[0].Combat.Hostiles[boss].Activity
	require.Equal(t, base.Add(65*time.Second), activity[0].End.Timestamp.Date())
	require.Equal(t, base.Add(66*time.Second), h.lastProcessedAt)
}

func TestHookableFinalize_LogsNonfatalDrainExhaustion(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	var logs bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&logs, nil))
	h := newFinalizeTestHookable(t)
	h.logger = logger
	h.Characters = characters.NewCharacters(h.units, []characters.CharacterFactory{
		func(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
			if id != creatureGUID(finalizeTestBossEntry, 1) {
				return nil, false
			}
			return &timeoutIgnoringCharacter{Common: characters.NewCommonCharacter(id, all)}, true
		},
	}, h.Identifier)
	_, _ = startFinalizeTestFight(t, h, base)

	result, err := h.Finalize(context.Background())
	require.NoError(t, err)
	require.Empty(t, result.Encounters)
	require.Contains(t, logs.String(), "fight remained active after finalization ticks")
	require.Contains(t, logs.String(), "instance=\"Test Instance\"")
	require.Equal(t, base.Add(finalizeTickHorizon), h.lastProcessedAt)
}

type timeoutIgnoringCharacter struct {
	*characters.Common
}

func (c *timeoutIgnoringCharacter) Process(m messages.Message) error {
	if _, ok := m.(*messages.Timeout); ok {
		return nil
	}
	return c.Common.Process(m)
}

func countCall(calls []string, want string) int {
	count := 0
	for _, call := range calls {
		if call == want {
			count++
		}
	}
	return count
}
