package rankings

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/nextsource"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

func survivabilityStateBytes(t *testing.T, state SurvivabilityTrackerState) []byte {
	t.Helper()
	payload, err := state.Encode()
	require.NoError(t, err)
	return payload
}

func survivabilityMessages(start time.Time, players [2]guid.GUID) []messages.Message {
	return []messages.Message{
		&messages.Slain{MessageBase: messages.Base(start.Add(10 * time.Second)), Victim: players[0]},
		&messages.Slain{MessageBase: messages.Base(start.Add(20 * time.Second)), Victim: players[1]},
		&messages.Resurrection{MessageBase: messages.Base(start.Add(30 * time.Second)), Target: players[0]},
		&messages.Slain{MessageBase: messages.Base(start.Add(40 * time.Second)), Victim: players[0]},
	}
}

func TestSurvivabilityTrackerStateContinuation(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 2, 0, 0, 0, time.UTC)
	previousID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	fightID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	players := [2]guid.GUID{1, 2}

	for split := 0; split <= len(survivabilityMessages(start, players)); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			continuous := NewSurvivabilityTracker()
			continuous.FightStarted(previousID, nil)
			require.NoError(t, continuous.ProcessMessage(true, previousID, &messages.Slain{MessageBase: messages.Base(start.Add(-time.Minute)), Victim: players[1]}))
			continuous.FightFinalized(previousID, start.Add(-2*time.Minute), start.Add(-time.Minute))
			continuous.FightStarted(fightID, nil)
			prefix := survivabilityMessages(start, players)
			for _, message := range prefix[:split] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}

			captured, err := continuous.CaptureState()
			require.NoError(t, err)
			payload := survivabilityStateBytes(t, captured)
			decoded, err := DecodeSurvivabilityTrackerState(SurvivabilityTrackerStateVersion, payload)
			require.NoError(t, err)
			restored, err := decoded.Restore()
			require.NoError(t, err)

			continuousSuffix := survivabilityMessages(start, players)
			restoredSuffix := survivabilityMessages(start, players)
			for _, message := range continuousSuffix[split:] {
				require.NoError(t, continuous.ProcessMessage(true, fightID, message))
			}
			for _, message := range restoredSuffix[split:] {
				require.NoError(t, restored.ProcessMessage(true, fightID, message))
			}
			end := start.Add(50 * time.Second)
			continuous.FightFinalized(fightID, start, end)
			restored.FightFinalized(fightID, start, end)
			require.Equal(t, continuous.Result(), restored.Result())
			continuousState, err := continuous.CaptureState()
			require.NoError(t, err)
			restoredState, err := restored.CaptureState()
			require.NoError(t, err)
			require.Equal(t, survivabilityStateBytes(t, continuousState), survivabilityStateBytes(t, restoredState))
			require.Equal(t, payload, survivabilityStateBytes(t, captured))
			require.Equal(t, payload, survivabilityStateBytes(t, decoded))
		})
	}
}

type survivabilitySourceDB struct {
	gamedb.GameDB
	spell *chrondbc.Spell
}

func (d *survivabilitySourceDB) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	return d.spell, nil
}

func (d *survivabilitySourceDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	return chrondbc.ExtraAttackSpell{}, false
}

func drainSurvivabilitySource(t *testing.T, pipeline *nextsource.Pipeline, lines ...string) []messages.Message {
	t.Helper()
	source, err := pipeline.OpenFile(strings.NewReader(strings.Join(lines, "\n")), 4096)
	require.NoError(t, err)
	var result []messages.Message
	for {
		batch, err := source.Advance(t.Context())
		if err == io.EOF {
			return result
		}
		require.NoError(t, err)
		result = append(result, batch...)
	}
}

func TestSurvivabilityTrackerStatePreservesAcceptedTimestampRegression(t *testing.T) {
	t.Parallel()
	player := guid.GUID(1)
	caster := guid.GUID(2)
	fightID := uuid.MustParse("99999999-9999-9999-9999-999999999999")
	db := &survivabilitySourceDB{spell: &chrondbc.Spell{
		Effects: []chrondbc.SpellEffect{{EffectIndex: 0, Effect: chrondbc.EffectResurrect}},
	}}
	pipeline, err := nextsource.New(t.Context(), nil, db, nil, "")
	require.NoError(t, err)
	prefix := drainSurvivabilitySource(t, pipeline,
		"10000|DEATH|0x0000000000000001",
		"9500|SPELL_GO|0|123|0x0000000000000002|0x0000000000000001|0|1|0",
	)

	continuous := NewSurvivabilityTracker()
	continuous.FightStarted(fightID, nil)
	for _, message := range prefix {
		require.NoError(t, continuous.ProcessMessage(true, fightID, message))
	}
	require.Len(t, continuous.players[player].transitions, 2)
	require.True(t, continuous.players[player].transitions[1].at.Before(continuous.players[player].transitions[0].at))

	captured, err := continuous.CaptureState()
	require.NoError(t, err)
	payload := survivabilityStateBytes(t, captured)
	decoded, err := DecodeSurvivabilityTrackerState(SurvivabilityTrackerStateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore()
	require.NoError(t, err)

	suffix := drainSurvivabilitySource(t, pipeline, "11000|DEATH|0x0000000000000001")
	for _, message := range suffix {
		require.NoError(t, continuous.ProcessMessage(true, fightID, message))
		require.NoError(t, restored.ProcessMessage(true, fightID, message))
	}
	start, end := time.UnixMilli(9000), time.UnixMilli(12000)
	continuous.FightFinalized(fightID, start, end)
	restored.FightFinalized(fightID, start, end)
	require.Equal(t, continuous.Result(), restored.Result())
	result := continuous.Result()[fightID].Players[player]
	require.Equal(t, int32(2), result.Deaths)
	require.Equal(t, float64(2), result.AliveDurationSecs)
	require.InDelta(t, 200.0/3, result.AlivePercentage, 0.000001)
	continuousState, err := continuous.CaptureState()
	require.NoError(t, err)
	restoredState, err := restored.CaptureState()
	require.NoError(t, err)
	require.Equal(t, survivabilityStateBytes(t, continuousState), survivabilityStateBytes(t, restoredState))
	require.Equal(t, payload, survivabilityStateBytes(t, captured))
	require.Equal(t, payload, survivabilityStateBytes(t, decoded))
	require.Equal(t, caster, prefix[1].(*messages.SpellGo).Caster)
}

func TestSurvivabilityTrackerStateDetachedRestore(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 2, 0, 0, 0, time.UTC)
	fightID := uuid.MustParse("33333333-3333-3333-3333-333333333333")
	tracker := NewSurvivabilityTracker()
	tracker.FightStarted(fightID, nil)
	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Slain{MessageBase: messages.Base(start), Victim: 1}))
	tracker.FightFinalized(fightID, start.Add(-time.Second), start.Add(time.Second))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	before := survivabilityStateBytes(t, state)

	tracker.players[1].transitions[0].at = start.Add(time.Hour)
	tracker.results[fightID].Players[1] = PlayerSurvivability{}
	require.Equal(t, before, survivabilityStateBytes(t, state))

	first, err := state.Restore()
	require.NoError(t, err)
	second, err := state.Restore()
	require.NoError(t, err)
	first.players[1].transitions[0].at = start.Add(2 * time.Hour)
	first.results[fightID].Players[1] = PlayerSurvivability{}
	secondState, err := second.CaptureState()
	require.NoError(t, err)
	require.Equal(t, before, survivabilityStateBytes(t, secondState))
	require.Equal(t, before, survivabilityStateBytes(t, state))
}

func TestSurvivabilityTrackerStateRejectsCorruptionAtomically(t *testing.T) {
	t.Parallel()
	start := time.Date(2026, time.November, 12, 2, 0, 0, 0, time.UTC)
	fightID := uuid.MustParse("44444444-4444-4444-4444-444444444444")
	tracker := NewSurvivabilityTracker()
	tracker.FightStarted(fightID, nil)
	require.NoError(t, tracker.ProcessMessage(true, fightID, &messages.Slain{MessageBase: messages.Base(start), Victim: 1}))
	tracker.FightFinalized(fightID, start.Add(-time.Second), start.Add(time.Second))
	state, err := tracker.CaptureState()
	require.NoError(t, err)
	valid := survivabilityStateBytes(t, state)

	for _, version := range []uint32{0, 2, 999} {
		_, err := DecodeSurvivabilityTrackerState(version, valid)
		require.Error(t, err)
	}
	for _, payload := range []string{
		"null", "{}", "{", string(valid) + " {}", `{"players":[],"results":[],"unknown":true}`,
		`{"players":null,"results":[]}`, `{"players":[],"results":[],"results":[]}`,
		`{"players":[{"guid":1,"dead":true,"transitions":[],"dead":false}],"results":[]}`,
		`{"players":[{"guid":1,"transitions":[]}],"results":[]}`,
		`{"players":[{"guid":1,"dead":null,"transitions":[]}],"results":[]}`,
		`{"players":[{"guid":1,"dead":true,"transitions":[{"at":"2026-11-12T02:00:00Z"}]}],"results":[]}`,
		`{"players":[{"guid":1,"dead":true,"transitions":[{"at":"2026-11-12T02:00:00Z","dead":null}]}],"results":[]}`,
		`{"players":[{"guid":1,"dead":true,"transitions":[]}],"results":[]}`,
	} {
		_, err := DecodeSurvivabilityTrackerState(SurvivabilityTrackerStateVersion, []byte(payload))
		require.Error(t, err, payload)
	}

	invalid := state
	invalid.value.Players[0].Transitions[0].Dead = false
	candidate, err := invalid.Restore()
	require.Error(t, err)
	require.Nil(t, candidate)
	original, err := tracker.CaptureState()
	require.NoError(t, err)
	require.Equal(t, valid, survivabilityStateBytes(t, original))

	var root map[string]any
	require.NoError(t, json.Unmarshal(valid, &root))
	root["results"].([]any)[0].(map[string]any)["duration_secs"] = -1.0
	corrupt, err := json.Marshal(root)
	require.NoError(t, err)
	_, err = DecodeSurvivabilityTrackerState(SurvivabilityTrackerStateVersion, corrupt)
	require.Error(t, err)
}

func TestSurvivabilityTrackerStateCaptureRejectsIncompleteTracker(t *testing.T) {
	t.Parallel()
	var tracker *SurvivabilityTracker
	_, err := tracker.CaptureState()
	require.Error(t, err)
	tracker = &SurvivabilityTracker{}
	_, err = tracker.CaptureState()
	require.Error(t, err)
}
