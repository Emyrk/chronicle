package cli_test

import (
	"testing"

	"github.com/Emyrk/chronicle/cmd/chronicled/cli"
	"github.com/stretchr/testify/require"
)

func TestCheckSpellDatasetsCmd(t *testing.T) {
	t.Parallel()

	cmd := cli.CheckSpellDatasetsCmd()
	require.Equal(t, "check-spell-datasets", cmd.Use)

	var postgresURL, dataset bool
	for _, option := range cmd.Options {
		switch option.Flag {
		case "postgres-url":
			postgresURL = true
		case "dataset":
			dataset = true
		}
	}
	require.True(t, postgresURL)
	require.True(t, dataset)
}

func TestCheckSpellDatasetsCmdRootRegistration(t *testing.T) {
	t.Parallel()

	root := cli.RootCmd()
	for _, child := range root.Children {
		if child.Use == "check-spell-datasets" {
			return
		}
	}
	t.Fatal("check-spell-datasets subcommand not registered")
}
