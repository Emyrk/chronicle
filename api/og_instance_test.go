package api

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestInstanceOGImageURL(t *testing.T) {
	t.Parallel()

	require.Equal(
		t,
		"https://capy.chronicleclassic.com/c/images/og/loadingscreens/LoadScreenMoltenCore.jpg",
		instanceOGImageURL("capy.chronicleclassic.com", "Molten Core"),
	)
	require.Empty(t, instanceOGImageURL("capy.chronicleclassic.com", "Unknown Instance"))
}
