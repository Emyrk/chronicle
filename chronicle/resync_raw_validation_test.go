package chronicle

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestWorkerResyncTimeout(t *testing.T) {
	t.Parallel()

	worker := &WorkerResync{}
	require.Equal(t, time.Duration(-1), worker.Timeout(nil), "wrapper timeout must not preempt the child parse retry policy")
}

func TestResyncParseInsertOpts(t *testing.T) {
	t.Parallel()

	args := ArgsLogParse{LogID: uuid.New(), TenantID: uuid.New()}
	const queueName = "resync-test-log-parse"
	opts := resyncParseInsertOpts(args, queueName)

	require.Equal(t, queueName, opts.Queue)
	require.True(t, opts.Pending, "parse job must be staged before parsed data is deleted")
	require.True(t, opts.UniqueOpts.ByArgs)
	require.True(t, opts.UniqueOpts.ByQueue, "isolated parse must not reuse a production queue job")
	require.Equal(t, 2, opts.MaxAttempts, "isolated parse must retain normal log-parse retry semantics")
}

func TestNewArgsLogParseMatchesTenantReparse(t *testing.T) {
	t.Parallel()

	logID := uuid.New()
	realmID := uuid.New()
	tenantID := uuid.New()
	ctx := servicetenant.WithTenantID(t.Context(), tenantID)

	got := newArgsLogParse(ctx, logID, true, true, realmID)
	require.Equal(t, ArgsLogParse{
		LogID:        logID,
		RealmID:      realmID,
		TenantID:     tenantID,
		Verbose:      true,
		IdentityMode: true,
	}, got)
}

func TestResyncTenantID(t *testing.T) {
	t.Parallel()

	tenantID := uuid.New()
	tenant := uuid.NullUUID{UUID: tenantID, Valid: true}
	otherTenant := uuid.NullUUID{UUID: uuid.New(), Valid: true}

	for _, tt := range []struct {
		name      string
		tenants   []uuid.NullUUID
		want      uuid.UUID
		wantError string
	}{
		{name: "one tenant across multiple realms", tenants: []uuid.NullUUID{tenant, tenant}, want: tenantID},
		{name: "root scope across multiple realms", tenants: []uuid.NullUUID{{}, {}}, want: uuid.Nil},
		{name: "no scopes", wantError: "no tenant scopes"},
		{name: "multiple tenants", tenants: []uuid.NullUUID{tenant, otherTenant}, wantError: "multiple tenant scopes"},
		{name: "tenant and root", tenants: []uuid.NullUUID{tenant, {}}, wantError: "multiple tenant scopes"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := resyncTenantID(tt.tenants)
			if tt.wantError != "" {
				require.ErrorContains(t, err, tt.wantError)
				require.Equal(t, uuid.Nil, got)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestValidateResyncRawFiles(t *testing.T) {
	t.Parallel()

	firstID := uuid.New()
	secondID := uuid.New()
	files := []database.LogFile{{ID: firstID}, {ID: secondID}}

	t.Run("rejects unexpected file count before loading", func(t *testing.T) {
		t.Parallel()

		loads := 0
		err := validateResyncRawFiles(t.Context(), files[:1], 2, func(context.Context, database.LogFile) ([]byte, error) {
			loads++
			return []byte("log"), nil
		})
		require.ErrorContains(t, err, "expected 2 files, found 1")
		require.Zero(t, loads)
	})

	t.Run("rejects an unreadable file", func(t *testing.T) {
		t.Parallel()

		unavailable := errors.New("object unavailable")
		var loaded []uuid.UUID
		err := validateResyncRawFiles(t.Context(), files, 2, func(_ context.Context, file database.LogFile) ([]byte, error) {
			loaded = append(loaded, file.ID)
			if file.ID == secondID {
				return nil, unavailable
			}
			return []byte("log"), nil
		})
		require.ErrorIs(t, err, unavailable)
		require.ErrorContains(t, err, secondID.String())
		require.Equal(t, []uuid.UUID{firstID, secondID}, loaded)
	})

	t.Run("loads every file", func(t *testing.T) {
		t.Parallel()

		var loaded []uuid.UUID
		err := validateResyncRawFiles(t.Context(), files, 2, func(_ context.Context, file database.LogFile) ([]byte, error) {
			loaded = append(loaded, file.ID)
			return []byte("log"), nil
		})
		require.NoError(t, err)
		require.Equal(t, []uuid.UUID{firstID, secondID}, loaded)
	})
}
