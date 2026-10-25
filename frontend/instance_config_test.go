package frontend

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInstanceBackground(t *testing.T) {
	t.Parallel()

	background, ok := InstanceBackground("Molten Core")
	require.True(t, ok)
	require.Equal(t, "/c/images/loadingscreens/LoadScreenMoltenCore.webp", background)

	background, ok = InstanceBackground("molten core")
	require.True(t, ok)
	require.Equal(t, "/c/images/loadingscreens/LoadScreenMoltenCore.webp", background)

	background, ok = InstanceBackground("Unknown Instance")
	require.False(t, ok)
	require.Empty(t, background)
}

func TestInstanceOGImage(t *testing.T) {
	t.Parallel()

	imagePath, ok := InstanceOGImage("Molten Core")
	require.True(t, ok)
	require.Equal(t, "/c/images/og/loadingscreens/LoadScreenMoltenCore.jpg", imagePath)

	imagePath, ok = InstanceOGImage("molten core")
	require.True(t, ok)
	require.Equal(t, "/c/images/og/loadingscreens/LoadScreenMoltenCore.jpg", imagePath)

	imagePath, ok = InstanceOGImage("Unknown Instance")
	require.False(t, ok)
	require.Empty(t, imagePath)
}
