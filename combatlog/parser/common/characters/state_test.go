package characters

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func stateLookup() *Characters {
	return NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(map[uint32]identifier.Identity{}))
}

func TestCommonStateContinuationAndExplicitWiring(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	originalLookup := stateLookup()
	id := guid.GUID(1)
	original := NewCommonCharacter(id, originalLookup).WithTimeout(time.Second).WithTimeoutAsDeath()
	originalLookup.All.Add(original, now)
	original.Start("initial", messages.TimedOut(now))
	original.Died("first death", messages.TimedOut(now.Add(time.Second)))
	original.Start("second", messages.TimedOut(now.Add(5*time.Second)))
	periodPaths := map[*period.InactivityPeriod]string{}
	periods := map[string]*period.InactivityPeriod{}
	moments := map[*period.Moment]string{}
	momentValues := map[string]period.MomentState{}
	msgs := map[messages.Message]string{}
	messageValues := map[string]period.MessageState{}
	captureMessage := func(m messages.Message) (string, error) {
		if path, ok := msgs[m]; ok {
			return path, nil
		}
		path := fmt.Sprintf("/messages/%d", len(msgs))
		s, err := period.CaptureMessage(m, nil, nil)
		if err != nil {
			return "", err
		}
		msgs[m] = path
		messageValues[path] = s
		return path, nil
	}
	captureMoment := func(m *period.Moment) (string, error) {
		if path, ok := moments[m]; ok {
			return path, nil
		}
		path := fmt.Sprintf("/moments/%d", len(moments))
		s, err := period.CaptureMoment(m, captureMessage)
		if err != nil {
			return "", err
		}
		moments[m] = path
		momentValues[path] = s
		return path, nil
	}
	states := map[string]period.State{}
	snapshot, err := original.CaptureState(func(p *period.InactivityPeriod) (string, error) {
		path := fmt.Sprintf("/periods/%d", len(periodPaths))
		periodPaths[p] = path
		s, err := p.CaptureState(captureMoment, captureMessage)
		states[path] = s
		return path, err
	}, captureMessage)
	require.NoError(t, err)
	encoded, err := snapshot.Encode()
	require.NoError(t, err)
	snapshot, err = DecodeCommonState(CommonStateVersion, encoded)
	require.NoError(t, err)
	restoredMessages := map[string]messages.Message{}
	for path, s := range messageValues {
		m, err := s.Restore(nil, nil)
		require.NoError(t, err)
		restoredMessages[path] = m
	}
	resolveMessage := func(path string) (messages.Message, error) { return restoredMessages[path], nil }
	restoredMoments := map[string]*period.Moment{}
	for path, s := range momentValues {
		m, err := s.Restore(resolveMessage)
		require.NoError(t, err)
		restoredMoments[path] = m
	}
	resolveMoment := func(path string) (*period.Moment, error) { return restoredMoments[path], nil }
	predicateCalls := 0
	for path, s := range states {
		p := &period.InactivityPeriod{}
		require.NoError(t, p.RestoreState(s, resolveMoment, resolveMessage, func() bool { predicateCalls++; return true }))
		periods[path] = p
	}
	lookup := stateLookup()
	baseState, err := snapshot.BaseState()
	require.NoError(t, err)
	base := &Base[*period.InactivityPeriod]{}
	require.NoError(t, base.RestoreState(baseState, lookup, func(path string) (*period.InactivityPeriod, error) { return periods[path], nil }, resolveMessage))
	restored := &Common{}
	require.NoError(t, restored.RestoreState(snapshot, base, func(*Characters) bool { predicateCalls++; return true }))
	require.Zero(t, predicateCalls)
	require.Zero(t, lookup.All.Len())
	require.Empty(t, lookup.DB().Info)
	require.Len(t, restored.Activity.History, 2)
	require.Same(t, base, restored.Base)
	require.Same(t, restored.LastSlain, restored.Activity.History[0].Period.End.Timestamp)
	require.NotSame(t, original.LastSlain, restored.LastSlain)
	hookCalls := 0
	restored.Activity.WireHook(period.HookFunction(func(messages.Message) { hookCalls++ }))
	require.Zero(t, hookCalls)
	// Only explicit composition publishes the candidate into the character set.
	lookup.All.Add(restored, now)
	for _, c := range []*Common{original, restored} {
		require.NoError(t, c.Process(messages.TimedOut(now.Add(6*time.Second))))
		require.True(t, c.IsActive())
		require.NoError(t, c.Process(messages.TimedOut(now.Add(6*time.Second+time.Nanosecond))))
		require.False(t, c.IsActive())
		require.Equal(t, period.EndStateSlain, c.LastEndState())
	}
	require.Equal(t, 1, hookCalls)
	require.Equal(t, 1, predicateCalls)
	require.Equal(t, original.Periods(), restored.Periods())
	after, err := snapshot.Encode()
	require.NoError(t, err)
	require.Equal(t, encoded, after)
	// Reusing this state does not reuse or mutate the first candidate's container.
	other := &Base[*period.InactivityPeriod]{}
	require.NoError(t, other.RestoreState(baseState, lookup, func(path string) (*period.InactivityPeriod, error) { return periods[path], nil }, resolveMessage))
	other.Activity.History = nil
	require.Len(t, restored.Activity.History, 2)
}

func TestCommonRestoreFailuresAreAtomic(t *testing.T) {
	t.Parallel()
	lookup := stateLookup()
	c := NewCommonCharacter(1, lookup)
	c.Start("start", messages.TimedOut(time.Time{}))
	state, err := c.CaptureState(func(*period.InactivityPeriod) (string, error) { return "/period", nil }, nil)
	require.NoError(t, err)
	encoded, err := state.Encode()
	require.NoError(t, err)
	for _, bad := range [][]byte{[]byte("null"), bytes.Replace(encoded, []byte(`"timeout":20000000000,`), nil, 1), append(append([]byte{}, encoded...), []byte(" {}")...)} {
		if bytes.Equal(bad, encoded) {
			continue
		}
		_, err := DecodeCommonState(CommonStateVersion, bad)
		require.Error(t, err)
	}
	var v map[string]any
	require.NoError(t, json.Unmarshal(encoded, &v))
	v["has_timeout_predicate"] = nil
	bad, err := json.Marshal(v)
	require.NoError(t, err)
	_, err = DecodeCommonState(CommonStateVersion, bad)
	require.Error(t, err)
	_, err = DecodeCommonState(CommonStateVersion+1, encoded)
	require.Error(t, err)
	baseState, err := state.BaseState()
	require.NoError(t, err)
	base := NewBaseCharacter[*period.InactivityPeriod](99, lookup)
	err = base.RestoreState(baseState, lookup, func(string) (*period.InactivityPeriod, error) { return nil, errors.New("missing") }, nil)
	require.Error(t, err)
	require.Equal(t, guid.GUID(99), base.ID())
	err = base.RestoreState(baseState, lookup, func(string) (*period.InactivityPeriod, error) { return nil, nil }, nil)
	require.Error(t, err)
	require.Equal(t, guid.GUID(99), base.ID())
	destination := NewCommonCharacter(88, lookup)
	err = destination.RestoreState(state, base, nil)
	require.Error(t, err)
	require.Equal(t, guid.GUID(88), destination.ID())
}

func TestNeverActiveRestoreDoesNotUpdateUnits(t *testing.T) {
	t.Parallel()
	lookup := stateLookup()
	original := NewNamedNeverActive(1, lookup, "Known")
	state := original.CaptureState()
	encoded, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeNeverActiveState(NeverActiveStateVersion, encoded)
	require.NoError(t, err)
	candidate := &NeverActive{}
	require.NoError(t, candidate.RestoreState(decoded))
	require.Equal(t, guid.GUID(1), candidate.ID())
	require.True(t, candidate.PersistInInstance())
	fresh := stateLookup()
	require.Empty(t, fresh.DB().Info)
	require.False(t, candidate.IsActive())
}

func TestWrapperOwnersRestoreCanonicalReferences(t *testing.T) {
	t.Parallel()
	lookup := stateLookup()
	base := NewCommonCharacter(1, lookup)
	capture := func(c CharacterBase) (string, error) { require.Same(t, base, c); return "/base", nil }
	calls := 0
	resolve := func(ref string) (CharacterBase, error) { calls++; require.Equal(t, "/base", ref); return base, nil }
	dead := NewPermanentDeath(base)
	dead.dead = true
	s, err := dead.CaptureState(capture)
	require.NoError(t, err)
	b, err := s.Encode()
	require.NoError(t, err)
	s, err = DecodePermanentDeathState(PermanentDeathStateVersion, b)
	require.NoError(t, err)
	restored := &PermanentDeath{}
	require.NoError(t, restored.RestoreState(s, resolve))
	require.True(t, restored.dead)
	require.Same(t, base, restored.CharacterBase)
	base.Start("start", messages.TimedOut(time.Time{}))
	before := base.Periods()
	require.NoError(t, restored.Process(&messages.Slain{Victim: 1}))
	require.Equal(t, before, base.Periods(), "restored permanent death must skip gameplay")
	ignore := NewIgnoreCastCharacter(base, 17)
	ignore.IgnoreTarget()
	ignore.IgnoreSource()
	is, err := ignore.CaptureState(capture)
	require.NoError(t, err)
	ib, err := is.Encode()
	require.NoError(t, err)
	is, err = DecodeIgnoreCastState(IgnoreCastStateVersion, ib)
	require.NoError(t, err)
	ignored := &IgnoreCast{}
	require.NoError(t, ignored.RestoreState(is, resolve))
	require.True(t, ignored.ignoreSource)
	require.True(t, ignored.ignoreTarget)
	require.Contains(t, ignored.ignoreSpells, chrondbc.SpellID(17))
	delete(ignored.ignoreSpells, 17)
	require.Contains(t, ignore.ignoreSpells, chrondbc.SpellID(17))
	friendly := NewIgnoreFriendlyFire(base, 42)
	fs, err := friendly.CaptureState(capture)
	require.NoError(t, err)
	fr := &IgnoreFriendlyFire{}
	require.NoError(t, fr.RestoreState(fs, resolve))
	delete(fr.friends, 42)
	require.Contains(t, friendly.friends, uint32(42))
	death := &DeathOnCast{CharacterBase: base, spellID: 17}
	ds, err := death.CaptureState(capture)
	require.NoError(t, err)
	dr := &DeathOnCast{}
	require.NoError(t, dr.RestoreState(ds, resolve))
	require.Equal(t, death.spellID, dr.spellID)
	splitter := NewStartsNewFight(base)
	ss, err := splitter.CaptureState(capture)
	require.NoError(t, err)
	sr := &StartsNewFight{}
	require.NoError(t, sr.RestoreState(ss, resolve))
	require.Same(t, base, sr.CharacterBase)
	adds := NewAdsGoWithBossCustomCharacter(base, lookup, 42, 43)
	as, err := adds.CaptureState(capture)
	require.NoError(t, err)
	ar := &AdsGoWithBoss{}
	require.NoError(t, ar.RestoreState(as, resolve, lookup))
	require.Same(t, lookup, ar.all)
	require.Equal(t, uint32(42), ar.bossEntry)
	ar.adds[0] = 44
	require.Equal(t, uint32(43), adds.adds[0])
	require.Equal(t, 6, calls)
	require.NoError(t, ignored.Process(&messages.Damage{MessageBase: messages.Base(time.Time{}), Target: 1, SpellData: &chrondbc.Spell{ID: 18}, HitType: types.HitTypeHit}))
}

func TestWrapperRejectsMissingReferencesWithoutMutatingDestination(t *testing.T) {
	t.Parallel()
	base := NewCommonCharacter(1, stateLookup())
	original := NewPermanentDeath(base)
	state, err := original.CaptureState(func(CharacterBase) (string, error) { return "/base", nil })
	require.NoError(t, err)
	destination := &PermanentDeath{CharacterBase: base, dead: true}
	for _, resolve := range []func(string) (CharacterBase, error){nil, func(string) (CharacterBase, error) { return nil, nil }, func(string) (CharacterBase, error) { return (*Common)(nil), nil }, func(string) (CharacterBase, error) { return nil, errors.New("not found") }} {
		require.Error(t, destination.RestoreState(state, resolve))
		require.True(t, destination.dead)
		require.Same(t, base, destination.CharacterBase)
	}
	for _, payload := range []string{`null`, `{}`, `{"wrapped":"/base","dead":null}`, `{"wrapped":"","dead":false}`, `{"wrapped":"/base","dead":false,"dead":false}`} {
		_, err := DecodePermanentDeathState(PermanentDeathStateVersion, []byte(payload))
		require.Error(t, err)
	}
}
