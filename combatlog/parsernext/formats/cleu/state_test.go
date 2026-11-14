package cleu

import (
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestDecoderStateStrictShapeAndDetachedRestore(t *testing.T) {
	t.Parallel()
	decoder, err := NewDecoder(Context{Format: "wotlk", Flavor: database.WoWFlavor{"wotlk"}}, Hooks{WarnUnparsed: func(string) { panic("restoration invoked hook") }})
	require.NoError(t, err)
	state := decoder.CaptureState()
	payload, err := state.Encode()
	require.NoError(t, err)
	decoded, err := DecodeState(StateVersion, payload)
	require.NoError(t, err)
	a, err := decoded.Restore()
	require.NoError(t, err)
	b, err := decoded.Restore()
	require.NoError(t, err)
	a.context.Flavor[0] = "changed"
	require.Equal(t, database.FlavorTag("wotlk"), b.context.Flavor[0])
	require.Nil(t, b.hooks.WarnUnparsed)
	for _, payload := range []string{
		`{"Context":{"Format":"wotlk","Flavor":["wotlk"],"Flavor":["wotlk"]}}`,
		`{"Context":{"Format":"wotlk"}}`,
		`{"Context":{"Format":"wotlk","Flavor":["wotlk"]},"Context":{"Format":"wotlk","Flavor":["wotlk"]}}`,
	} {
		_, err := DecodeState(StateVersion, []byte(payload))
		require.Error(t, err)
	}
}
