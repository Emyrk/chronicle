package ownergraph

import (
	"encoding/json"
	"errors"
	"github.com/stretchr/testify/require"
	"testing"
)

type testOwner struct {
	Value int
	Next  *testOwner
	Other *testOwner
}
type testValue struct {
	Value int
	Next  string
	Other string
}

func TestCanonicalCyclesAndOnceOnly(t *testing.T) {
	t.Parallel()
	r := NewRegistry()
	captures, inits, loads := 0, 0, 0
	captured := map[*testOwner]int{}
	loaded := map[*testOwner]int{}
	initialized := map[*testOwner]int{}
	require.NoError(t, Register(r, Codec[testOwner]{Type: "test", Version: 1, Init: func() *testOwner { inits++; v := new(testOwner); initialized[v]++; return v }, Capture: func(v *testOwner, c *Capture) ([]byte, error) {
		captures++
		captured[v]++
		next, e := c.Ref(v.Next)
		if e != nil {
			return nil, e
		}
		other, e := c.Ref(v.Other)
		if e != nil {
			return nil, e
		}
		return json.Marshal(testValue{v.Value, next, other})
	}, Restore: func(v *testOwner, _ uint32, b []byte, c *Restore) error {
		loads++
		loaded[v]++
		require.Equal(t, 2, inits)
		var s testValue
		if e := json.Unmarshal(b, &s); e != nil {
			return e
		}
		next, e := c.Resolve(s.Next)
		if e != nil {
			return e
		}
		other, e := c.Resolve(s.Other)
		if e != nil {
			return e
		}
		*v = testOwner{s.Value, next.(*testOwner), other.(*testOwner)}
		return nil
	}}))
	a, b := &testOwner{Value: 1}, &testOwner{Value: 2}
	a.Next = b
	a.Other = b
	b.Next = a
	b.Other = a
	s, e := r.Capture(a)
	require.NoError(t, e)
	require.Equal(t, 2, captures)
	require.Equal(t, map[*testOwner]int{a: 1, b: 1}, captured)
	root, e := r.Restore(s)
	require.NoError(t, e)
	fresh := root.(*testOwner)
	require.Equal(t, 2, loads)
	require.Equal(t, map[*testOwner]int{fresh: 1, fresh.Next: 1}, initialized)
	require.Equal(t, map[*testOwner]int{fresh: 1, fresh.Next: 1}, loaded)
	require.NotSame(t, a, fresh)
	require.Same(t, fresh.Next, fresh.Other)
	require.Same(t, fresh, fresh.Next.Next)
	_, e = r.Capture(new(int))
	require.Error(t, e)
}
func TestFailureDoesNotPublishPartialGraph(t *testing.T) {
	t.Parallel()
	r := NewRegistry()
	require.NoError(t, Register(r, Codec[testOwner]{Type: "test", Version: 1, Init: func() *testOwner { return new(testOwner) }, Capture: func(*testOwner, *Capture) ([]byte, error) { return []byte(`{}`), nil }, Restore: func(*testOwner, uint32, []byte, *Restore) error { return errors.New("invalid owner") }}))
	s, e := r.Capture(new(testOwner))
	require.NoError(t, e)
	root, e := r.Restore(s)
	require.Error(t, e)
	require.Nil(t, root)
}
