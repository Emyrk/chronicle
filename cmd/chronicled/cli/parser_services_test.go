package cli

import (
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParserServicesAreLean(t *testing.T) {
	t.Parallel()
	broker := parserServices()
	for _, name := range []string{services.ServiceAuthz, services.ServiceChronicle, services.ServicePGXPool, services.ServiceRiverQueue, services.ServiceWoWDB, services.ServiceTenant, services.ServiceAPI, services.ServiceDiscordBot, services.ServiceBilling, services.ServiceDataset} {
		_, err := broker.Get(name)
		require.Error(t, err, "primary service %s must not start in parser role", name)
	}
	for _, opt := range broker.OptionSet() {
		require.NotContains(t, opt.Flag, "discord")
		require.NotContains(t, opt.Flag, "authz")
		require.NotContains(t, opt.Flag, "http")
	}
}

func TestParserFailsClosedBeforeConnectingDatabase(t *testing.T) {
	t.Parallel()
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"binary_identity":"different-executable"}`))
	}))
	defer primary.Close()
	err := ParserCmd().Invoke("--primary-url", primary.URL, "--postgres-url", "not-a-valid-database-url").WithContext(t.Context()).Run()
	require.ErrorContains(t, err, "initial primary compatibility")
}

func TestParserCommandRegistration(t *testing.T) {
	t.Parallel()
	for _, child := range RootCmd().Children {
		if child.Use == "parser" {
			return
		}
	}
	t.Fatal("parser command missing")
}
