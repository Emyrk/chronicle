package characterset

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters/period"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

type testCharacter struct {
	id       guid.GUID
	active   bool
	endState period.EndState
}

func (c *testCharacter) ID() guid.GUID                 { return c.id }
func (c *testCharacter) IsActive() bool                { return c.active }
func (c *testCharacter) LastEndState() period.EndState { return c.endState }

func TestForEachAwakeRemovesDormantCharacters(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.October, 23, 0, 0, 0, 0, time.UTC)
	set := New[*testCharacter]()
	character := &testCharacter{id: 1, active: true}
	set.Add(character, base)

	require.NoError(t, set.ForEachAwake(base.Add(time.Minute), func(*testCharacter) error {
		character.active = false
		return nil
	}))

	calls := 0
	require.NoError(t, set.ForEachAwake(base.Add(time.Minute+Dormancy+time.Nanosecond), func(*testCharacter) error {
		calls++
		return nil
	}))
	require.Equal(t, 1, calls)

	calls = 0
	require.NoError(t, set.ForEachAwake(base.Add(time.Minute+Dormancy+2*time.Nanosecond), func(*testCharacter) error {
		calls++
		return nil
	}))
	require.Zero(t, calls)
}

func TestForEachAwakeUsesShorterSlainDormancy(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.October, 23, 0, 0, 0, 0, time.UTC)
	set := New[*testCharacter]()
	character := &testCharacter{id: 1, endState: period.EndStateSlain}
	set.Add(character, base)

	require.NoError(t, set.ForEachAwake(base.Add(SlainDormancy+time.Nanosecond), func(*testCharacter) error {
		return nil
	}))

	calls := 0
	require.NoError(t, set.ForEachAwake(base.Add(SlainDormancy+2*time.Nanosecond), func(*testCharacter) error {
		calls++
		return nil
	}))
	require.Zero(t, calls)
}

func TestTouchWakesDormantCharacter(t *testing.T) {
	t.Parallel()

	base := time.Date(2026, time.October, 23, 0, 0, 0, 0, time.UTC)
	set := New[*testCharacter]()
	character := &testCharacter{id: 1}
	set.Add(character, base)

	require.NoError(t, set.ForEachAwake(base.Add(Dormancy+time.Nanosecond), func(*testCharacter) error {
		return nil
	}))
	set.Touch(character.id, base.Add(Dormancy+time.Second))

	calls := 0
	require.NoError(t, set.ForEachAwake(base.Add(Dormancy+2*time.Second), func(got *testCharacter) error {
		calls++
		require.Same(t, character, got)
		return nil
	}))
	require.Equal(t, 1, calls)
}

func BenchmarkForEachAwake(b *testing.B) {
	set := New[*testCharacter]()
	base := time.Date(2026, time.October, 23, 0, 0, 0, 0, time.UTC)
	for id := guid.GUID(1); id <= 500; id++ {
		set.Add(&testCharacter{id: id, active: true}, base)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		now := base.Add(time.Duration(i) * time.Millisecond)
		if err := set.ForEachAwake(now, func(*testCharacter) error { return nil }); err != nil {
			b.Fatal(err)
		}
	}
}
