package servicepgxpool

import (
	"context"
	"errors"
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/dbtestutil"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func TestConnectOnlySharesIdentityAndOptions(t *testing.T) {
	t.Parallel()
	broker := services.New()
	normal, connect := New(broker), NewConnectOnly(broker)
	require.Equal(t, normal.Name(), connect.Name())
	require.Equal(t, normal.DependsOn(), connect.DependsOn())
	require.False(t, normal.connectOnly)
	require.True(t, connect.connectOnly)
	ordinary, headless := normal.Options(), connect.Options()
	require.Len(t, headless, len(ordinary))
	for i, opt := range ordinary {
		require.Equal(t, opt.Flag, headless[i].Flag)
		require.Equal(t, opt.Env, headless[i].Env)
		require.Equal(t, opt.Default, headless[i].Default)
		require.Equal(t, opt.Required, headless[i].Required)
	}
	require.NoError(t, broker.Register(normal))
	require.Error(t, broker.Register(connect), "modes must not create parallel services")
}

func TestPoolModesShareBrokerLifecycle(t *testing.T) {
	t.Parallel()
	// Provision the shared cluster role, then give each mode a fresh empty sandbox.
	dbtestutil.NewPGXPool(t)
	for _, connectOnly := range []bool{false, true} {
		name := "normal"
		if connectOnly {
			name = "connect-only"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx := testutil.Context(t, testutil.WaitLong)
			url, err := dbtestutil.Open(t, dbtestutil.WithDBFrom("template0"))
			require.NoError(t, err)
			broker := services.New()
			srv := New(broker)
			prepared := make(chan struct{}, 8)
			released := make(chan struct{}, 8)
			if connectOnly {
				srv = NewConnectOnly(broker, func(cfg *pgxpool.Config) {
					require.NotNil(t, cfg.AfterConnect, "shared role/type setup must survive role hooks")
					cfg.PrepareConn = func(context.Context, *pgx.Conn) (bool, error) {
						select {
						case prepared <- struct{}{}:
						default:
						}
						return true, nil
					}
					cfg.AfterRelease = func(*pgx.Conn) bool {
						select {
						case released <- struct{}{}:
						default:
						}
						return true
					}
				})
			}
			srv.pgURL = url
			srv.maxConns = 2
			require.NoError(t, broker.Register(servicelogger.New(broker), srv))
			require.NoError(t, broker.Start(ctx, testutil.Logger(t)))
			t.Cleanup(func() { require.NoError(t, broker.Close(context.Background())) })
			require.Same(t, srv.pool, PGXPool(broker))
			require.NotNil(t, srv.diagnostics)
			require.Same(t, srv.diagnostics, srv.pool.Config().ConnConfig.Tracer)
			require.NotNil(t, srv.monitorCancel)
			require.Equal(t, int32(2), srv.pool.Config().MaxConns)
			_, err = database.New(srv.pool).GetWoWLogGroupByID(ctx, uuid.New())
			if connectOnly {
				var pgerr *pgconn.PgError
				require.True(t, errors.As(err, &pgerr), "empty sandbox must remain unmigrated: %v", err)
				require.Equal(t, "42P01", pgerr.Code)
				require.Nil(t, Pubsub(broker))
				select {
				case <-prepared:
				case <-ctx.Done():
					t.Fatal("prepare hook not called")
				}
				select {
				case <-released:
				case <-ctx.Done():
					t.Fatal("release hook not called")
				}
			} else {
				require.ErrorIs(t, err, pgx.ErrNoRows)
				require.NotNil(t, Pubsub(broker))
			}
			require.NoError(t, broker.Close(ctx))
			require.Error(t, srv.pool.Ping(ctx), "broker shutdown must close shared pool")
		})
	}
}
