package cli_test

import (
	"testing"

	"github.com/Emyrk/chronicle/cmd/chronicled/cli"
	"github.com/stretchr/testify/require"
)

func TestResyncCmd_Help(t *testing.T) {
	t.Parallel()

	cmd := cli.ResyncCmd()
	require.Equal(t, "resync", cmd.Use)
	require.NotEmpty(t, cmd.Short)

	// The command should expose the required flags.
	var (
		foundTargetVersion bool
		foundExecute       bool
		foundResume        bool
		foundWorkers       bool
		foundLimit         bool
		foundPGURL         bool
		foundRemoteURL     bool
		foundStorageType   bool
		foundStoragePath   bool
	)
	for _, opt := range cmd.Options {
		switch opt.Flag {
		case "target-version":
			foundTargetVersion = true
			// Must NOT be Required — defaults to running version.
			require.False(t, opt.Required, "--target-version should not be required")
			require.NotEmpty(t, opt.Default, "--target-version should have a default")
		case "execute":
			foundExecute = true
		case "resume":
			foundResume = true
			require.False(t, opt.Required, "--resume should not be required")
			require.Equal(t, "false", opt.Default)
		case "workers":
			foundWorkers = true
		case "limit":
			foundLimit = true
		case "postgres-url":
			foundPGURL = true
			require.Equal(t, "CHRONICLE_POSTGRES_URL", opt.Env)
		case "remote-url":
			foundRemoteURL = true
			require.Equal(t, "CHRONICLE_REMOTE_URL", opt.Env)
		case "storage-type":
			foundStorageType = true
		case "storage-path":
			foundStoragePath = true
		}
	}
	require.True(t, foundTargetVersion, "missing --target-version flag")
	require.True(t, foundExecute, "missing --execute flag")
	require.True(t, foundResume, "missing --resume flag")
	require.True(t, foundWorkers, "missing --workers flag")
	require.True(t, foundLimit, "missing --limit flag")
	require.True(t, foundPGURL, "missing --postgres-url flag")
	require.True(t, foundRemoteURL, "missing --remote-url flag")
	require.True(t, foundStorageType, "missing --storage-type flag")
	require.True(t, foundStoragePath, "missing --storage-path flag")
}

func TestResyncCmd_RootRegistration(t *testing.T) {
	t.Parallel()

	root := cli.RootCmd()
	var found bool
	for _, sub := range root.Children {
		if sub.Use == "resync" {
			found = true
			break
		}
	}
	require.True(t, found, "resync subcommand not registered in RootCmd")
}
