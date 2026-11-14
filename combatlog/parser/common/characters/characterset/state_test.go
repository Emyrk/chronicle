package characterset

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func captureCharacter(c *testCharacter) (string, error) {
	return fmt.Sprintf("/characters/%d", c.id), nil
}
func stateBytes(t *testing.T, s *Set[*testCharacter]) []byte {
	t.Helper()
	state, err := s.CaptureState(captureCharacter)
	require.NoError(t, err)
	b, err := state.Encode()
	require.NoError(t, err)
	return b
}
func awakeOrder(s *Set[*testCharacter]) []guid.GUID {
	var ids []guid.GUID
	for p := s.awake.Oldest(); p != nil; p = p.Next() {
		ids = append(ids, p.Key)
	}
	return ids
}
func allOrder(s *Set[*testCharacter]) []guid.GUID {
	var ids []guid.GUID
	for p := s.characters.Oldest(); p != nil; p = p.Next() {
		ids = append(ids, p.Key)
	}
	return ids
}

func TestStatePreservesIndependentOrderAndContinuesDormancy(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	s := New[*testCharacter]()
	originals := map[guid.GUID]*testCharacter{1: {id: 1, endState: period.EndStateSlain}, 2: {id: 2}, 3: {id: 3, active: true}}
	for _, id := range []guid.GUID{1, 2, 3} {
		s.Add(originals[id], now)
	}
	require.NoError(t, s.ForEachAwake(now.Add(SlainDormancy+time.Nanosecond), func(*testCharacter) error { return nil }))
	require.Equal(t, []guid.GUID{2, 3}, awakeOrder(s))
	s.Touch(1, now.Add(6*time.Minute))
	require.Equal(t, []guid.GUID{2, 3, 1}, awakeOrder(s))
	require.Equal(t, []guid.GUID{1, 2, 3}, allOrder(s))
	snapshot, err := s.CaptureState(captureCharacter)
	require.NoError(t, err)
	encoded, err := snapshot.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, encoded)
	require.NoError(t, err)
	restoredCharacters := make(map[string]*testCharacter)
	for _, c := range originals {
		clone := *c
		ref, _ := captureCharacter(c)
		restoredCharacters[ref] = &clone
	}
	calls := []string{}
	restored, err := RestoreState(decoded, func(ref string) (*testCharacter, error) {
		calls = append(calls, ref)
		return restoredCharacters[ref], nil
	})
	require.NoError(t, err)
	require.Equal(t, []string{"/characters/1", "/characters/2", "/characters/3"}, calls)
	require.Equal(t, encoded, stateBytes(t, restored))
	for pair := restored.awake.Oldest(); pair != nil; pair = pair.Next() {
		c, _ := restored.Get(pair.Key)
		require.Same(t, c, pair.Value.character)
	}
	for _, target := range []*Set[*testCharacter]{s, restored} {
		require.NoError(t, target.ForEachAwake(now.Add(11*time.Minute), func(c *testCharacter) error {
			if c.id == 3 {
				c.active = false
			}
			return nil
		}))
		require.Contains(t, awakeOrder(target), guid.GUID(1), "strict deadline equality keeps slain character awake")
		require.NoError(t, target.ForEachAwake(now.Add(11*time.Minute+time.Nanosecond), func(*testCharacter) error { return nil }))
		require.NotContains(t, awakeOrder(target), guid.GUID(1))
		target.Touch(1, now.Add(12*time.Minute))
		require.NoError(t, target.ForEachAwake(now.Add(21*time.Minute), func(*testCharacter) error { return nil }))
	}
	require.Equal(t, stateBytes(t, s), stateBytes(t, restored))
	require.Equal(t, []guid.GUID{3}, awakeOrder(restored))
	after, err := snapshot.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
	again, err := RestoreState(decoded, func(ref string) (*testCharacter, error) { return restoredCharacters[ref], nil })
	require.NoError(t, err)
	require.Equal(t, []guid.GUID{2, 3, 1}, awakeOrder(again))
	require.Equal(t, encoded, stateBytes(t, again))
}

type behaviorForbidden struct{ id guid.GUID }

func (c *behaviorForbidden) ID() guid.GUID               { return c.id }
func (*behaviorForbidden) IsActive() bool                { panic("restore must not query activity") }
func (*behaviorForbidden) LastEndState() period.EndState { panic("restore must not query death") }
func TestStateRestoreDoesNotReplayBehavior(t *testing.T) {
	t.Parallel()
	s := New[*behaviorForbidden]()
	character := &behaviorForbidden{id: 1}
	s.Add(character, time.Time{})
	s.awake.GetPair(1).Value.dormantAfter = -123
	snapshot, err := s.CaptureState(func(*behaviorForbidden) (string, error) { return "/character", nil })
	require.NoError(t, err)
	b, err := snapshot.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, b)
	require.NoError(t, err)
	restored, err := RestoreState(decoded, func(string) (*behaviorForbidden, error) { return character, nil })
	require.NoError(t, err)
	require.Same(t, character, restored.awake.Oldest().Value.character)
	require.Equal(t, int64(-123), restored.awake.Oldest().Value.dormantAfter)
	require.True(t, restored.awake.Oldest().Value.touchedAt.IsZero())
	empty, err := New[*behaviorForbidden]().CaptureState(nil)
	require.NoError(t, err)
	emptyRestored, err := RestoreState[*behaviorForbidden](empty, nil)
	require.NoError(t, err)
	require.Zero(t, emptyRestored.Len())
}

func TestStateRejectsMalformedIndexesAndReferences(t *testing.T) {
	t.Parallel()
	s := New[*testCharacter]()
	s.Add(&testCharacter{id: 1}, time.Time{})
	s.Add(&testCharacter{id: 2}, time.Time{})
	good := stateBytes(t, s)
	for _, mutate := range []func(map[string]any){
		func(v map[string]any) { delete(v, "awake") }, func(v map[string]any) { v["all"] = nil },
		func(v map[string]any) { v["unknown"] = true },
		func(v map[string]any) { rows := v["all"].([]any); v["all"] = append(rows, rows[0]) },
		func(v map[string]any) {
			rows := v["all"].([]any)
			rows[1].(map[string]any)["reference"] = rows[0].(map[string]any)["reference"]
		},
		func(v map[string]any) { v["all"].([]any)[0].(map[string]any)["reference"] = "" },
		func(v map[string]any) { rows := v["awake"].([]any); v["awake"] = append(rows, rows[0]) },
		func(v map[string]any) { v["all"] = []any{} },
		func(v map[string]any) { delete(v["awake"].([]any)[0].(map[string]any), "dormant_after") },
		func(v map[string]any) { v["awake"].([]any)[0].(map[string]any)["touched_at"] = nil },
	} {
		var v map[string]any
		require.NoError(t, json.Unmarshal(good, &v))
		mutate(v)
		bad, err := json.Marshal(v)
		require.NoError(t, err)
		_, err = DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
	for _, bad := range [][]byte{[]byte("null"), append(append([]byte{}, good...), []byte(" {}")...), bytes.Replace(good, []byte(`"dormant_after":0`), []byte(`"dormant_after":0,"dormant_after":0`), 1)} {
		_, err := DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
	_, err := DecodeState(StateVersion+1, good)
	require.Error(t, err)
	snapshot, err := s.CaptureState(captureCharacter)
	require.NoError(t, err)
	for _, resolve := range []func(string) (*testCharacter, error){nil, func(string) (*testCharacter, error) { return nil, nil }, func(string) (*testCharacter, error) { return &testCharacter{id: 99}, nil }, func(ref string) (*testCharacter, error) {
		if ref == "/characters/1" {
			return &testCharacter{id: 1}, nil
		}
		return nil, errors.New("missing reference")
	}} {
		candidate, err := RestoreState(snapshot, resolve)
		require.Error(t, err)
		require.Nil(t, candidate)
		require.Equal(t, good, stateBytes(t, s))
	}
	_, err = s.CaptureState(nil)
	require.Error(t, err)
	_, err = s.CaptureState(func(*testCharacter) (string, error) { return "/same", nil })
	require.Error(t, err)
	_, err = s.CaptureState(func(*testCharacter) (string, error) { return "", errors.New("capture failure") })
	require.Error(t, err)
}
