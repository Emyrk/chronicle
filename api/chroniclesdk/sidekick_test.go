package chroniclesdk

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSidekickConfigHashStable(t *testing.T) {
	t.Parallel()

	config := DefaultSidekickConfig()
	payload, err := config.CanonicalJSON()
	require.NoError(t, err)
	require.JSONEq(t, `{"version":1,"auto_upload":{"enabled":false}}`, string(payload))

	hash, err := config.Hash()
	require.NoError(t, err)
	require.Equal(t, "b568659ffa9fe99b312ce1c6ad2724d8b46924833e0641423329c91d9f698be5", hash)
}

func TestSidekickConfigValidateVersion(t *testing.T) {
	t.Parallel()

	config := DefaultSidekickConfig()
	config.Version = 2
	require.ErrorContains(t, config.Validate(), "unsupported Sidekick config version 2")
}
