package chroniclesdk

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSidekickConfigHashStable(t *testing.T) {
	t.Parallel()

	config := DefaultSidekickConfig()
	payload, err := config.CanonicalJSON()
	require.NoError(t, err)
	require.Equal(t, `{"version":1,"wow_directories":{}}`, string(payload))

	hash, err := config.Hash()
	require.NoError(t, err)
	require.Equal(t, "6cf556c64ba0052d92ec879851a5ff6c5e60756e88f2da5f2eca540cda76497f", hash)
}

func TestSidekickConfigCanonicalJSONSortsDirectories(t *testing.T) {
	t.Parallel()

	config := DefaultSidekickConfig()
	config.WoWDirectories["wowdir_"+strings.Repeat("b", 64)] = SidekickDirectoryConfig{
		GameFormat: SidekickGameFormatWotLK335a,
		AutoUpload: SidekickAutoUploadDisabled,
	}
	config.WoWDirectories["wowdir_"+strings.Repeat("a", 64)] = SidekickDirectoryConfig{
		GameFormat: SidekickGameFormatWotLK335a,
		AutoUpload: SidekickAutoUploadOnGameExit,
	}

	payload, err := config.CanonicalJSON()
	require.NoError(t, err)
	require.Equal(t, `{"version":1,"wow_directories":{"wowdir_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"game_format":"wotlk_3.3.5a","auto_upload":"on_game_exit"},"wowdir_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":{"game_format":"wotlk_3.3.5a","auto_upload":"disabled"}}}`, string(payload))
}

func TestSidekickConfigValidate(t *testing.T) {
	t.Parallel()

	t.Run("version", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.Version = 2
		require.ErrorContains(t, config.Validate(), "unsupported Sidekick config version 2")
	})
	t.Run("directory ID", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.WoWDirectories["wowdir_bad"] = SidekickDirectoryConfig{GameFormat: SidekickGameFormatWotLK335a, AutoUpload: SidekickAutoUploadDisabled}
		require.ErrorContains(t, config.Validate(), "invalid World of Warcraft directory ID")
	})
	t.Run("game format", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.WoWDirectories["wowdir_"+strings.Repeat("a", 64)] = SidekickDirectoryConfig{GameFormat: "vanilla", AutoUpload: SidekickAutoUploadDisabled}
		require.ErrorContains(t, config.Validate(), "unsupported game format")
	})
	t.Run("auto upload", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.WoWDirectories["wowdir_"+strings.Repeat("a", 64)] = SidekickDirectoryConfig{GameFormat: SidekickGameFormatWotLK335a, AutoUpload: "always"}
		require.ErrorContains(t, config.Validate(), "unsupported auto-upload mode")
	})
}
