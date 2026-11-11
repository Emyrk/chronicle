package creatures

import (
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/stretchr/testify/require"
)

func TestWorgCaptureOwnerRestoreAndTimeout(t *testing.T) {
	t.Parallel()
	at := time.Date(2026, 1, 2, 3, 4, 5, 123456789, time.FixedZone("offset", 3600))
	original := &worgPupCaptures{count: 3, touchedAt: at}
	state, err := original.CaptureState()
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeWorgPupCapturesState(WorgPupCapturesStateVersion, payload)
	require.NoError(t, err)
	restored := InitWorgPupCaptures()
	require.NoError(t, restored.RestoreState(decoded))
	require.Equal(t, 3, restored.count)
	require.True(t, at.Equal(restored.touchedAt))
	all := characters.NewCharacters(unitdb.New(), nil, identifier.NewIdentifier(nil))
	all.Save(worgPupCapturesKey, restored)
	common := characters.NewCommonCharacter(guid.GUID(1), all)
	source := &BloodaxeWorgPup{Common: common, all: all}
	cs, err := source.CaptureState(func(c *characters.Common) (string, error) { require.Same(t, common, c); return "/common", nil })
	require.NoError(t, err)
	encoded, err := cs.Encode()
	require.NoError(t, err)
	cs, err = DecodeCommonOwnerState(CommonOwnerStateVersion, encoded)
	require.NoError(t, err)
	pups := []*BloodaxeWorgPup{new(BloodaxeWorgPup), new(BloodaxeWorgPup)}
	for _, pup := range pups {
		require.NoError(t, pup.RestoreState(cs, all, func(string) (*characters.Common, error) { return common, nil }))
		require.Same(t, common, pup.Common)
		shared, ok := all.Load(worgPupCapturesKey)
		require.True(t, ok)
		require.Same(t, restored, shared)
		require.Equal(t, 3, restored.count)
		require.Same(t, restored, pup.loadCaptures(at.Add(worgPupCaptureTimeout-time.Nanosecond)))
	}
	require.Empty(t, all.DB().Info)
	require.Empty(t, all.ByEntry)
	require.Zero(t, all.All.Len())
	// Exact boundary behavior is unchanged: stale state disappears only on gameplay.
	require.Zero(t, pups[0].loadCaptures(at.Add(worgPupCaptureTimeout)).count)
	_, ok := all.Load(worgPupCapturesKey)
	require.False(t, ok)
	require.Equal(t, 3, restored.count)
	prior := *pups[0]
	require.Error(t, pups[0].RestoreState(cs, all, func(string) (*characters.Common, error) { return nil, nil }))
	require.Equal(t, prior, *pups[0])
}

func TestWorgCaptureStateRejectsMalformed(t *testing.T) {
	t.Parallel()
	for _, payload := range []string{`null`, `{}`, `{"count":null,"touched_at":"0001-01-01T00:00:00Z"}`, `{"count":-1,"touched_at":"0001-01-01T00:00:00Z"}`, `{"count":0,"touched_at":null}`, `{"count":0,"count":1,"touched_at":"0001-01-01T00:00:00Z"}`, `{"count":0,"touched_at":"0001-01-01T00:00:00Z","extra":0}`, `{"count":0,"touched_at":"0001-01-01T00:00:00Z"} {}`} {
		_, err := DecodeWorgPupCapturesState(WorgPupCapturesStateVersion, []byte(payload))
		require.Error(t, err)
	}
	_, err := DecodeWorgPupCapturesState(99, []byte(`{}`))
	require.Error(t, err)
	zero := InitWorgPupCaptures()
	state, err := zero.CaptureState()
	require.NoError(t, err)
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeWorgPupCapturesState(WorgPupCapturesStateVersion, payload)
	require.NoError(t, err)
	require.NoError(t, zero.RestoreState(decoded))
	require.True(t, zero.touchedAt.IsZero())
}
