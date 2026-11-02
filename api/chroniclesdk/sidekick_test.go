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
	require.Equal(t, `{"version":1,"archive":{"enabled":true,"retention_days":7},"wow_directories":{}}`, string(payload))

	hash, err := config.Hash()
	require.NoError(t, err)
	require.Equal(t, "03ba74a583c3e096527eb448a456583b975a0f8c32d8517c630ff3954e3528e4", hash)
}

func TestSidekickConfigCanonicalJSONSortsDirectories(t *testing.T) {
	t.Parallel()

	config := DefaultSidekickConfig()
	config.WoWDirectories["wowdir_"+strings.Repeat("b", 64)] = SidekickDirectoryConfig{
		AutoUpload: SidekickAutoUploadDisabled,
	}
	config.WoWDirectories["wowdir_"+strings.Repeat("a", 64)] = SidekickDirectoryConfig{
		AutoUpload: SidekickAutoUploadOnGameExit,
	}

	payload, err := config.CanonicalJSON()
	require.NoError(t, err)
	require.Equal(t, `{"version":1,"archive":{"enabled":true,"retention_days":7},"wow_directories":{"wowdir_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"auto_upload":"on_game_exit"},"wowdir_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":{"auto_upload":"disabled"}}}`, string(payload))
}

func TestSidekickLogFormatValid(t *testing.T) {
	t.Parallel()
	for _, format := range []SidekickLogFormat{
		SidekickLogFormat112aCcAddon,
		SidekickLogFormat335aCcAddon,
		SidekickLogFormat243CcAddon,
		SidekickLogFormatHermesproxy1142Cc,
	} {
		require.True(t, format.Valid())
	}
	require.False(t, SidekickLogFormat("future").Valid())
}

func TestSidekickInspectionValidate(t *testing.T) {
	t.Parallel()
	valid := SidekickInspection{
		Status: SidekickInspectionActionRequired,
		Checks: []SidekickInspectionCheck{{
			ID: "dll.nampower", Category: SidekickInspectionDLL, Name: "nampower.dll",
			Required: true, Status: SidekickInspectionMissing,
		}},
	}
	require.NoError(t, valid.Validate())

	invalid := valid
	invalid.Checks = append(invalid.Checks, invalid.Checks[0])
	require.ErrorContains(t, invalid.Validate(), "unique")
}

func TestSidekickConfigValidate(t *testing.T) {
	t.Parallel()

	t.Run("version", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.Version = 2
		require.ErrorContains(t, config.Validate(), "unsupported Sidekick config version 2")
	})
	t.Run("archive retention too short", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.Archive.RetentionDays = 0
		require.ErrorContains(t, config.Validate(), "archive retention_days must be between 1 and 365")
	})
	t.Run("archive retention too long", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.Archive.RetentionDays = 366
		require.ErrorContains(t, config.Validate(), "archive retention_days must be between 1 and 365")
	})
	t.Run("directory ID", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.WoWDirectories["wowdir_bad"] = SidekickDirectoryConfig{AutoUpload: SidekickAutoUploadDisabled}
		require.ErrorContains(t, config.Validate(), "invalid World of Warcraft directory ID")
	})
	t.Run("auto upload", func(t *testing.T) {
		config := DefaultSidekickConfig()
		config.WoWDirectories["wowdir_"+strings.Repeat("a", 64)] = SidekickDirectoryConfig{AutoUpload: "always"}
		require.ErrorContains(t, config.Validate(), "unsupported auto-upload mode")
	})
}
