package cli

import (
	"context"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/services/servicepgxpool"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParserServicesAreLean(t *testing.T) {
	t.Parallel()
	broker := parserServices()
	_, err := broker.Get(services.ServicePGXPool)
	require.NoError(t, err)
	for _, name := range []string{services.ServiceAuthz, services.ServiceChronicle, services.ServiceRiverQueue, services.ServiceWoWDB, services.ServiceTenant, services.ServiceAPI, services.ServiceDiscordBot, services.ServiceBilling, services.ServiceDataset} {
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

func TestParserUsesSharedDatabaseOptions(t *testing.T) {
	t.Parallel()
	shared := servicepgxpool.New(services.New()).Options()
	command := ParserCmd()
	for _, wanted := range shared {
		count := 0
		for _, actual := range command.Options {
			if actual.Flag == wanted.Flag {
				count++
				require.Equal(t, wanted.Env, actual.Env)
				require.Equal(t, wanted.Default, actual.Default)
				require.Equal(t, wanted.Required, actual.Required)
			}
		}
		require.Equal(t, 1, count, "one owner for %s", wanted.Flag)
	}
}

func TestParserPoolHooksPreserveTenantIsolation(t *testing.T) {
	t.Parallel()
	ctx := testutil.Context(t, testutil.WaitLong)
	url := dbtestutil.NewConnectionURL(t)
	broker := services.New()
	poolService := servicepgxpool.NewConnectOnly(broker, parserPoolHooks)
	for _, option := range poolService.Options() {
		switch option.Flag {
		case "postgres-url":
			require.NoError(t, option.Value.Set(url))
		case "db-max-conns":
			require.NoError(t, option.Value.Set("1"))
		}
	}
	require.NoError(t, broker.Register(servicelogger.New(broker), poolService))
	require.NoError(t, broker.Start(ctx, testutil.Logger(t)))
	t.Cleanup(func() { require.NoError(t, broker.Close(context.Background())) })
	pool := servicepgxpool.PGXPool(broker)
	tenant := uuid.New()
	var role, currentTenant string
	require.NoError(t, pool.QueryRow(servicetenant.WithTenantID(ctx, tenant), "SELECT current_user, current_setting('app.tenant_id', true)").Scan(&role, &currentTenant))
	require.Equal(t, "chronicle", role)
	require.Equal(t, tenant.String(), currentTenant)
	require.NoError(t, pool.QueryRow(ctx, "SELECT current_user, current_setting('app.tenant_id', true)").Scan(&role, &currentTenant))
	require.Equal(t, "chronicle", role)
	require.Empty(t, currentTenant, "release must reset previous tenant on the reused connection")
	var bypass string
	require.NoError(t, pool.QueryRow(servicetenant.AdminBypass(ctx), "SELECT current_setting('app.tenant_bypass', true)").Scan(&bypass))
	require.Equal(t, "true", bypass)
	require.NoError(t, pool.QueryRow(ctx, "SELECT current_setting('app.tenant_bypass', true)").Scan(&bypass))
	require.Empty(t, bypass)
}
