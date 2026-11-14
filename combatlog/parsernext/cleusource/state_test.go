package cleusource

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type stateSpells struct{}

func (stateSpells) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	panic("unexpected spell callback")
}
func (stateSpells) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	panic("unexpected spell callback")
}

func TestStateRoundTripAndBoundary(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(context.Background(), parsectx.Context{Format: "wotlk", Flavor: database.WoWFlavor{"wotlk"}})
	p, err := New(ctx, nil, stateSpells{}, cleu.NewDecoder)
	require.NoError(t, err)
	_, err = p.CaptureState()
	require.Error(t, err)
	p.SetBaseYear(2025)
	p.SetMaxTimestampRegression(3 * time.Second)
	p.ExcludeEventFromTimestampOrdering("test")
	p.recordGUIDName(42, "player")
	p.missed[123] = MissedSpell{Count: 2, Name: "unknown"}
	_, _, err = p.decodeCompanion(time.Time{}, "[3unfinished")
	require.NoError(t, err)
	source, err := p.OpenFile(strings.NewReader(""), 1024)
	require.NoError(t, err)
	_, err = p.CaptureState()
	require.Error(t, err)
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = source.Advance(cancelled)
	require.ErrorIs(t, err, context.Canceled)
	_, err = source.Advance(ctx)
	require.ErrorIs(t, err, io.EOF)
	state, err := p.CaptureState()
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, payload)
	require.NoError(t, err)
	restored, err := decoded.Restore()
	require.NoError(t, err)
	_, err = restored.OpenFile(strings.NewReader(""), 1024)
	require.Error(t, err)
	calls := 0
	factory := func(c cleu.Context, h cleu.Hooks) (*cleu.Decoder, error) { calls++; return cleu.NewDecoder(c, h) }
	require.Error(t, restored.WireGraphRuntime(context.Background(), nil, stateSpells{}, factory))
	require.Zero(t, calls)
	require.NoError(t, restored.WireGraphRuntime(ctx, nil, stateSpells{}, factory))
	require.Equal(t, 1, calls)
	got, err := restored.CaptureState()
	require.NoError(t, err)
	roundtrip, err := got.Encode()
	require.NoError(t, err)
	require.JSONEq(t, string(payload), string(roundtrip))
	p.guidNames[42] = "changed"
	state.GUIDNames[42] = "changed again"
	name, _ := restored.GUIDName(42)
	require.Equal(t, "player", name)
	second, err := decoded.Restore()
	require.NoError(t, err)
	restored.guidNames[42] = "restore mutation"
	require.Equal(t, "player", second.guidNames[42])
	for _, bad := range [][]byte{
		bytes.Replace(payload, []byte(`"BaseYear":2025,`), nil, 1),
		bytes.Replace(payload, []byte(`"BaseYear":2025`), []byte(`"BaseYear":2025,"BaseYear":2025`), 1),
		bytes.Replace(payload, []byte(`"Context":{`), []byte(`"Context":{"Format":"wotlk",`), 1),
		bytes.Replace(payload, []byte(`"DecodedOrdinal":0,`), nil, 1),
		bytes.Replace(payload, []byte(`"Counter":51`), []byte(`"Counter":51,"Counter":51`), 1),
	} {
		_, err := DecodeState(StateVersion, bad)
		require.Error(t, err, string(bad))
	}
	for _, bad := range [][]byte{[]byte("null"), append(payload, []byte(" {}")...), []byte(strings.Replace(string(payload), `"BaseYear":2025`, `"bogus":2025`, 1))} {
		_, err := DecodeState(StateVersion, bad)
		require.Error(t, err)
	}
	_, err = DecodeState(100, payload)
	require.Error(t, err)
}

type failedReader struct{}

func (failedReader) Read([]byte) (int, error) { return 0, errors.New("failed reader") }
func TestFatalSourceCannotBecomeSnapshot(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(context.Background(), parsectx.Context{Format: "wotlk", Flavor: database.WoWFlavor{"wotlk"}})
	p, err := New(ctx, nil, stateSpells{}, cleu.NewDecoder)
	require.NoError(t, err)
	source, err := p.OpenFile(failedReader{}, 1024)
	require.NoError(t, err)
	for range 2 {
		_, err = source.Advance(ctx)
		require.Error(t, err)
		require.NotErrorIs(t, err, io.EOF)
	}
	_, err = p.CaptureState()
	require.Error(t, err)
}

func TestOrderingFatalCannotReachEOF(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(context.Background(), parsectx.Context{Format: "wotlk", Flavor: database.WoWFlavor{"wotlk"}})
	p, err := New(ctx, nil, stateSpells{}, cleu.NewDecoder)
	require.NoError(t, err)
	p.lastDate = time.Date(2025, 1, 2, 0, 0, 0, 0, time.UTC)
	p.SetBaseYear(2025)
	source, err := p.OpenFile(strings.NewReader("1/1 00:00:00.000  UNKNOWN\n"), 1024)
	require.NoError(t, err)
	for range 2 {
		_, err = source.Advance(ctx)
		require.Error(t, err)
		require.NotErrorIs(t, err, io.EOF)
	}
	_, err = p.CaptureState()
	require.Error(t, err)
}

func TestStateDetachesAllNativeMutableValues(t *testing.T) {
	t.Parallel()
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: "wotlk", Flavor: database.WoWFlavor{"wotlk"}})
	p, e := New(ctx, nil, stateSpells{}, cleu.NewDecoder)
	require.NoError(t, e)
	p.SetRealmClockInfo(&realmclock.Info{LocalTime: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), UTCTime: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)})
	p.ExcludeEventFromTimestampOrdering("event")
	p.guidNames[1] = "original"
	p.missed[2] = MissedSpell{Count: 1, Name: "original"}
	source, e := p.OpenFile(strings.NewReader(""), 1024)
	require.NoError(t, e)
	_, e = source.Advance(ctx)
	require.ErrorIs(t, e, io.EOF)
	state, e := p.CaptureState()
	require.NoError(t, e)
	before, e := state.Encode()
	require.NoError(t, e)
	p.realmClock.Offset = time.Hour
	p.excluded["mutated"] = struct{}{}
	p.guidNames[1] = "mutated"
	p.missed[2] = MissedSpell{Count: 99}
	after, e := state.Encode()
	require.NoError(t, e)
	require.Equal(t, before, after)
	a, e := state.Restore()
	require.NoError(t, e)
	b, e := state.Restore()
	require.NoError(t, e)
	a.realmClock.Offset = time.Hour
	a.excluded["mutated"] = struct{}{}
	a.guidNames[1] = "mutated"
	a.missed[2] = MissedSpell{Count: 99}
	require.Zero(t, b.realmClock.Offset)
	require.NotContains(t, b.excluded, "mutated")
	require.Equal(t, "original", b.guidNames[1])
	require.Equal(t, 1, b.missed[2].Count)
	after, e = state.Encode()
	require.NoError(t, e)
	require.Equal(t, before, after)
}
