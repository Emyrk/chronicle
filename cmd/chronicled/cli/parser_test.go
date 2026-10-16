package cli

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
)

func TestParserCmd(t *testing.T) {
	t.Parallel()

	cmd := ParserCmd()
	require.Equal(t, "parser", cmd.Use)

	flags := make(map[string]bool, len(cmd.Options))
	for _, option := range cmd.Options {
		flags[option.Flag] = true
	}

	for _, flag := range []string{
		"postgres-url",
		"storage-type",
		"spicedb-grpc-url",
		"log-parse-worker-count",
	} {
		require.Truef(t, flags[flag], "missing parser flag --%s", flag)
	}

	for _, flag := range []string{
		"http-address",
		"disable-discord-bot",
	} {
		require.Falsef(t, flags[flag], "unexpected non-parser flag --%s", flag)
	}
}

func TestParserCmdServices(t *testing.T) {
	t.Parallel()

	srvs := services.New()
	registered := parserServices(srvs)

	names := make([]string, 0, len(registered))
	for _, service := range registered {
		names = append(names, service.Name())
	}
	require.ElementsMatch(t, []string{
		services.ServiceAccessURL,
		services.ServiceLogger,
		services.ServicePrometheus,
		services.ServiceCache,
		services.ServiceStorage,
		services.ServicePGXPool,
		services.ServiceTenant,
		services.ServiceDatabase,
		services.ServiceAuthz,
		services.ServiceDataset,
		services.ServiceWoWDB,
		services.ServiceChronicle,
		services.ServiceParser,
	}, names)
	require.NotContains(t, names, services.ServiceAPI)
	require.NotContains(t, names, services.ServiceRiverQueue)
	require.NotContains(t, names, services.ServiceDiscordBot)
}

func TestParserCmdRootRegistration(t *testing.T) {
	t.Parallel()

	root := RootCmd()
	for _, child := range root.Children {
		if child.Use == "parser" {
			return
		}
	}
	t.Fatal("parser subcommand not registered")
}
