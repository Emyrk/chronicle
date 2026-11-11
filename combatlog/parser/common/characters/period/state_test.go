package period_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/api/chronicleproto/types2proto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounterevents"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Tables model the enclosing graph's canonical Values. Distinct equal-valued
// pointers remain distinct; shared Moment and message pointers resolve once.
type refs struct {
	moments       map[*period.Moment]string
	momentValues  map[string]period.MomentState
	messages      map[messages.Message]string
	messageValues map[string]period.MessageState
	damage        *messages.Damage
}

func newRefs() *refs {
	return &refs{moments: map[*period.Moment]string{}, momentValues: map[string]period.MomentState{}, messages: map[messages.Message]string{}, messageValues: map[string]period.MessageState{}}
}
func (r *refs) message(m messages.Message) (string, error) {
	if d, ok := m.(*messages.Damage); ok {
		r.damage = d
		return "/damage", nil
	}
	if ref, ok := r.messages[m]; ok {
		return ref, nil
	}
	ref := fmt.Sprintf("/messages/%d", len(r.messages))
	r.messages[m] = ref
	state, err := period.CaptureMessage(m, r.message, func(*chrondbc.Spell) (string, error) { return "/spell", nil })
	if err != nil {
		return "", err
	}
	r.messageValues[ref] = state
	return ref, nil
}
func (r *refs) moment(m *period.Moment) (string, error) {
	if ref, ok := r.moments[m]; ok {
		return ref, nil
	}
	ref := fmt.Sprintf("/moments/%d", len(r.moments))
	r.moments[m] = ref
	s, err := period.CaptureMoment(m, r.message)
	if err != nil {
		return "", err
	}
	r.momentValues[ref] = s
	return ref, nil
}
func (r *refs) restore(t *testing.T) (func(string) (*period.Moment, error), func(string) (messages.Message, error)) {
	t.Helper()
	msgs := map[string]messages.Message{}
	moments := map[string]*period.Moment{}
	if r.damage != nil {
		state, err := r.damage.CaptureState("")
		require.NoError(t, err)
		d, err := state.Restore(nil)
		require.NoError(t, err)
		msgs["/damage"] = d
	}
	var resolve func(string) (messages.Message, error)
	resolve = func(ref string) (messages.Message, error) {
		if m, ok := msgs[ref]; ok {
			return m, nil
		}
		s, ok := r.messageValues[ref]
		if !ok {
			return nil, fmt.Errorf("missing message")
		}
		b, err := s.Encode()
		if err != nil {
			return nil, err
		}
		d, err := period.DecodeMessageState(period.MessageStateVersion, b)
		if err != nil {
			return nil, err
		}
		m, err := d.Restore(resolve, func(string) (*chrondbc.Spell, error) { return &chrondbc.Spell{ID: 17}, nil })
		if err == nil {
			msgs[ref] = m
		}
		return m, err
	}
	resolveMoment := func(ref string) (*period.Moment, error) {
		if m, ok := moments[ref]; ok {
			return m, nil
		}
		s, ok := r.momentValues[ref]
		if !ok {
			return nil, fmt.Errorf("missing moment")
		}
		b, err := s.Encode()
		if err != nil {
			return nil, err
		}
		d, err := period.DecodeMomentState(period.MomentStateVersion, b)
		if err != nil {
			return nil, err
		}
		m, err := d.Restore(resolve)
		if err == nil {
			moments[ref] = m
		}
		return m, err
	}
	return resolveMoment, resolve
}
func roundtrip(t *testing.T, p period.IsPeriod, r *refs) period.State {
	t.Helper()
	s, err := period.CaptureState(p, r.moment, r.message)
	require.NoError(t, err)
	b, err := s.Encode()
	require.NoError(t, err)
	d, err := period.DecodeState(period.StateVersion, b)
	require.NoError(t, err)
	return d
}

func TestPeriodAliasesAndResetGraceContinuation(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	aura := &messages.Aura{MessageBase: messages.Base(now), SpellName: "Polymorph", SpellID: 99, SpellData: &chrondbc.Spell{ID: 17}, Target: 1, Amount: 0, State: types.AuraStateRemoved}
	p := period.NewInactivityPeriod(1, time.Minute)
	p.Begin("cc_start", aura)
	p.LastActive = p.Start
	p.EnterResetGracePeriod("cc removed", aura)
	r := newRefs()
	state := roundtrip(t, p, r)
	moments, resolve := r.restore(t)
	var calls []messages.Message
	candidate, err := restoreTestPeriod(state, moments, resolve, period.HookFunction(func(m messages.Message) { calls = append(calls, m) }), nil)
	require.NoError(t, err)
	require.Empty(t, calls)
	restored := candidate.(*period.InactivityPeriod)
	require.Same(t, restored.Start, restored.LastActive)
	require.Same(t, restored.Start.Timestamp, restored.Meta.ResetMessage)
	require.NotSame(t, p.Start, restored.Start)
	restoredAura := restored.Meta.ResetMessage.(*messages.Aura)
	require.Equal(t, chrondbc.SpellID(99), restoredAura.SpellID)
	require.Equal(t, chrondbc.SpellID(17), restoredAura.SpellData.ID)
	require.False(t, restored.HandleTimeout(p.Meta.ResetDeadline))
	require.False(t, p.HandleTimeout(p.Meta.ResetDeadline))
	require.True(t, restored.HandleTimeout(p.Meta.ResetDeadline.Add(time.Nanosecond)))
	require.True(t, p.HandleTimeout(p.Meta.ResetDeadline.Add(time.Nanosecond)))
	require.Equal(t, p.Period.End.Reason, restored.Period.End.Reason)
	require.Equal(t, p.EndState, restored.EndState)
	require.Len(t, calls, 1)
	require.Equal(t, p.Period.End.Timestamp.Date(), restored.Period.End.Timestamp.Date())
	// A second restore is fresh, not the already-ended candidate.
	otherMoments, otherMessages := r.restore(t)
	other, err := restoreTestPeriod(state, otherMoments, otherMessages, nil, nil)
	require.NoError(t, err)
	require.True(t, other.IsActive())
}

func TestRetainedSlainMutationDoesNotRewriteEagerBytes(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	damage := &messages.Damage{MessageBase: messages.Base(now), Amount: 100, Target: 1}
	slain := &messages.Slain{MessageBase: messages.Base(now.Add(time.Second)), Victim: 1, Attribution: damage}
	p := period.NewEmptyPeriod(1)
	p.Begin("start", damage)
	r := newRefs()
	slainRef, err := r.message(slain)
	require.NoError(t, err)
	state := roundtrip(t, p, r)
	moments, resolve := r.restore(t)
	restored, err := restoreTestPeriod(state, moments, resolve, nil, nil)
	require.NoError(t, err)
	retained, err := resolve(slainRef)
	require.NoError(t, err)
	restoredSlain := retained.(*messages.Slain)
	require.Same(t, restored.Get().Start.Timestamp, restoredSlain.Attribution)
	eager := encounterevents.NewBuilder[*messages.Slain, *chronicleproto.Slain]()
	require.NoError(t, encounterevents.AddToBuilder(eager, restoredSlain, 0, types2proto.Slain))
	before, err := eager.CaptureEagerState()
	require.NoError(t, err)
	restored.End("delayed death", restoredSlain, period.EndStateSlain)
	require.Equal(t, messages.ActivitySlain, restoredSlain.Activity()[guid.GUID(1)])
	after, err := eager.CaptureEagerState()
	require.NoError(t, err)
	require.Equal(t, before, after)
	restoredSlain.Attribution.(*messages.Damage).Unranked = 100
	require.Equal(t, int64(100), restored.Get().Start.Timestamp.(*messages.Damage).Unranked)
	require.Zero(t, damage.Unranked)
	_, err = eager.Finalize(uuid.Nil)
	require.NoError(t, err)
}

func TestPeriodInjectedPredicateAndCallbackOrder(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	p := period.NewInactivityPeriod(1, time.Second).WithTimeoutAsDeath(true)
	p.Begin("start", messages.TimedOut(now))
	r := newRefs()
	state := roundtrip(t, p, r)
	moments, resolve := r.restore(t)
	_, err := restoreTestPeriod(state, moments, resolve, nil, nil)
	require.Error(t, err)
	var order []string
	restored, err := restoreTestPeriod(state, moments, resolve, period.HookFunction(func(messages.Message) { order = append(order, "hook") }), func() bool { order = append(order, "predicate"); return true })
	require.NoError(t, err)
	require.Empty(t, order)
	active := restored.(*period.InactivityPeriod)
	require.False(t, active.HandleTimeout(now.Add(time.Second)))
	require.True(t, active.HandleTimeout(now.Add(time.Second+time.Nanosecond)))
	require.Equal(t, []string{"hook", "predicate"}, order)
	require.Equal(t, period.EndStateSlain, active.EndState)
}

func TestPeriodAndMessageStateRejectUnsupportedAndMalformed(t *testing.T) {
	t.Parallel()
	p := period.NewEmptyPeriod(1)
	r := newRefs()
	state := roundtrip(t, p, r)
	b, err := state.Encode()
	require.NoError(t, err)
	for _, bad := range [][]byte{[]byte("null"), bytes.Replace(b, []byte(`"start":"",`), nil, 1), bytes.Replace(b, []byte(`"kind":"empty"`), []byte(`"kind":"custom"`), 1), append(append([]byte{}, b...), []byte(" {}")...)} {
		_, err := period.DecodeState(period.StateVersion, bad)
		require.Error(t, err)
	}
	_, err = period.DecodeState(period.StateVersion+1, b)
	require.Error(t, err)
	_, err = period.CaptureMessage(&messages.Heal{}, nil, nil)
	require.Error(t, err)
	_, err = period.CaptureState(nil, nil, nil)
	require.Error(t, err)
	for _, message := range []messages.Message{&messages.Timeout{MessageBase: messages.Base(time.Time{})}, &messages.EncounterBoundary{MessageBase: messages.Base(time.Time{}), Active: true}} {
		s, err := period.CaptureMessage(message, nil, nil)
		require.NoError(t, err)
		b, err := s.Encode()
		require.NoError(t, err)
		decoded, err := period.DecodeMessageState(period.MessageStateVersion, b)
		require.NoError(t, err)
		out, err := decoded.Restore(nil, nil)
		require.NoError(t, err)
		require.Equal(t, message, out)
		var root map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(b, &root))
		root["payload"] = json.RawMessage(`{}`)
		bad, err := json.Marshal(root)
		require.NoError(t, err)
		_, err = period.DecodeMessageState(period.MessageStateVersion, bad)
		require.Error(t, err)
	}
	p.Begin("start", messages.TimedOut(time.Time{}))
	s := roundtrip(t, p, newRefs())
	candidate, err := restoreTestPeriod(s, nil, nil, nil, nil)
	require.Error(t, err)
	require.Nil(t, candidate)
}

func TestPeriodCancellationKeepsStaleTimerFieldsAndDistinctMessages(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	first := messages.TimedOut(now)
	second := messages.TimedOut(now)
	p := period.NewInactivityPeriod(1, time.Minute)
	p.Begin("start", first)
	p.EnterResetGracePeriod("retained reason", second)
	p.CancelResetGracePeriod()
	require.False(t, p.Meta.PendingReset)
	require.Nil(t, p.Meta.ResetMessage)
	p.LastActive = &period.Moment{Timestamp: second, Reason: "equal timestamp distinct object"}
	r := newRefs()
	s := roundtrip(t, p, r)
	moments, resolve := r.restore(t)
	restored, err := restoreTestPeriod(s, moments, resolve, nil, nil)
	require.NoError(t, err)
	got := restored.(*period.InactivityPeriod)
	require.Equal(t, p.Meta, got.Meta)
	require.NotSame(t, got.Start.Timestamp, got.LastActive.Timestamp)
	require.Equal(t, first, got.Start.Timestamp)
	require.Equal(t, second, got.LastActive.Timestamp)
	p.Begin("unsupported", &messages.Heal{})
	_, err = period.CaptureState(p, r.moment, r.message)
	require.Error(t, err)
}

// Test-only composition. Production has no concrete reconstruction dispatcher.
func restoreTestPeriod(s period.State, moments func(string) (*period.Moment, error), message func(string) (messages.Message, error), hook period.Hook, predicate func() bool) (period.IsPeriod, error) {
	encoded, err := s.Encode()
	if err != nil {
		return nil, err
	}
	var header struct {
		Kind string `json:"kind"`
	}
	if err := json.Unmarshal(encoded, &header); err != nil {
		return nil, err
	}
	var p period.IsPeriod
	if header.Kind == "empty" {
		owner := &period.EmptyPeriod{}
		if err := owner.RestoreState(s, moments); err != nil {
			return nil, err
		}
		p = owner
	} else {
		owner := &period.InactivityPeriod{}
		if err := owner.RestoreState(s, moments, message, predicate); err != nil {
			return nil, err
		}
		p = owner
	}
	p.SetHook(hook)
	return p, nil
}

func TestConcreteRestoreDoesNotInvokeCallbacksOrChangeExternalOwners(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	original := period.NewInactivityPeriod(1, time.Minute).WithTimeoutAsDeath(true)
	message := messages.TimedOut(now)
	original.Begin("start", message)
	refs := newRefs()
	state := roundtrip(t, original, refs)
	moments, messagesResolve := refs.restore(t)
	hookCalls, predicateCalls := 0, 0
	destination := period.NewInactivityPeriod(99, time.Hour)
	destination.SetHook(period.HookFunction(func(messages.Message) { hookCalls++ }))
	err := destination.RestoreState(state, moments, messagesResolve, func() bool { predicateCalls++; return true })
	require.NoError(t, err)
	require.Zero(t, hookCalls)
	require.Zero(t, predicateCalls)
	require.True(t, original.IsActive())
	require.Equal(t, now.Add(time.Minute), original.Meta.NextTimeout)
	require.Equal(t, messages.ActivityStart, message.Activity()[1])
	// Runtime hook wiring is a separate composition step, not a Restore side effect.
	destination.SetHook(period.HookFunction(func(messages.Message) { hookCalls++ }))
	require.True(t, destination.HandleTimeout(now.Add(time.Minute+time.Nanosecond)))
	require.Equal(t, 1, hookCalls)
	require.Equal(t, 1, predicateCalls)
	require.True(t, original.IsActive())
}
