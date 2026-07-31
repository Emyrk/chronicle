package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	"github.com/Emyrk/chronicle/database/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/xerrors"
)

type StoreQueries interface {
	sqlcQuerier
}

// Store contains all queryable database functions.
// It extends the generated interface to add transaction support.
type Store interface {
	sqlcQuerier

	Ping(ctx context.Context) (time.Duration, error)
	InTx(ctx context.Context, f func(Store) error, opts *pgx.TxOptions) error
	Close() error
}

// DBTX represents a database connection or transaction.
type DBTX interface {
	Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error)
	Query(context.Context, string, ...interface{}) (pgx.Rows, error)
	QueryRow(context.Context, string, ...interface{}) pgx.Row
	SendBatch(context.Context, *pgx.Batch) pgx.BatchResults
}

type sqlQuerier struct {
	sdb *pgxpool.Pool
	db  DBTX
	// txCtx is the context that started the current transaction (set only when
	// db is a *pgxpool.Tx). Used to detect tenant context mismatches on nested
	// InTx calls — mixing tenant scopes within a single transaction is a bug.
	txCtx context.Context
}

type registerTypes struct {
	migrationsComplete atomic.Bool
}

// CheckNestedTxFunc is called when a nested InTx is entered. It receives the
// context that started the outer transaction and the context of the nested call.
// If the nested context has a different tenant/bypass scope than the outer, it
// should return an error. Set by servicetenant.
//
// If nil, no check is performed.
var CheckNestedTxFunc func(outerCtx, innerCtx context.Context) error

// PrepareConnFunc is a function that is called on every connection acquired from
// the pool, before the connection is used. It receives the caller's context and
// the raw pgx connection. This is used by servicetenant to set RLS session
// variables (app.tenant_id / app.tenant_bypass) on each connection.
//
// If nil, no per-acquire preparation is done.
var PrepareConnFunc func(ctx context.Context, conn *pgx.Conn) error

// ResetConnFunc is called when a connection is released back to the pool.
// It should undo anything PrepareConnFunc set (e.g., RESET session variables).
//
// If nil, no per-release cleanup is done.
var ResetConnFunc func(conn *pgx.Conn)

// PoolOption customizes the pgx pool configuration.
type PoolOption func(*pgxpool.Config)

// WithMaxConns caps the number of connections in the pool. A value of 0 or
// less leaves the pgx default in place (max(4, numCPU)), which is shared by
// the API and every background worker in the process. A pool_max_conns set
// in the connection string takes precedence and is never overridden.
func WithMaxConns(maxConns int32) PoolOption {
	return func(cfg *pgxpool.Config) {
		if maxConns <= 0 {
			return
		}
		if cfg.ConnString() != "" && strings.Contains(cfg.ConnString(), "pool_max_conns") {
			return
		}
		cfg.MaxConns = maxConns
		if cfg.MinConns > maxConns {
			cfg.MinConns = maxConns
		}
	}
}

// https://github.com/jackc/pgx/issues/288#issuecomment-901975396
func PoolConfig(logger *slog.Logger, dbURL string, opts ...PoolOption) (*pgxpool.Config, func(), error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
		var _ = logger
	}
	cfg, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, nil, fmt.Errorf("parse postgres db url: %w", err)
	}

	for _, opt := range opts {
		opt(cfg)
	}

	r := &registerTypes{}
	cfg.AfterConnect = r.RegisterTypes

	// Tenant-aware pool hooks. PrepareConn fires before every connection
	// acquisition (with the caller's context), AfterRelease fires when the
	// connection is returned to the pool.
	cfg.PrepareConn = func(ctx context.Context, conn *pgx.Conn) (bool, error) {
		if PrepareConnFunc != nil {
			if err := PrepareConnFunc(ctx, conn); err != nil {
				return true, err // keep conn alive, fail the query
			}
		}
		return true, nil
	}
	cfg.AfterRelease = func(conn *pgx.Conn) bool {
		if ResetConnFunc != nil {
			ResetConnFunc(conn)
		}
		return true
	}

	return cfg, func() {
		r.migrationsComplete.Store(true)
	}, nil
}

// RegisterTypes registers custom Postgres types (enums, etc.) with pgx.
// After migrations are complete, it also SET ROLEs to the non-superuser
// "chronicle" role so that RLS policies (e.g. tenant isolation) are enforced.
// Superusers bypass RLS unconditionally, so every pooled connection must
// downgrade to this role before serving application queries.
func (r *registerTypes) RegisterTypes(ctx context.Context, conn *pgx.Conn) error {
	if !r.migrationsComplete.Load() {
		return nil
	}

	// Register user_roles enum type so pgx can encode []UserRoles as user_roles[]
	dataTypeNames := []string{}

	for _, typeName := range dataTypeNames {
		dataType, err := conn.LoadType(ctx, typeName)
		if err != nil {
			return fmt.Errorf("load type %q: %w", typeName, err)
		}
		conn.TypeMap().RegisterType(dataType)

		// Also register the array type
		arrayTypeName := "_" + typeName
		arrayType, err := conn.LoadType(ctx, arrayTypeName)
		if err != nil {
			return fmt.Errorf("load array type %q: %w", arrayTypeName, err)
		}
		conn.TypeMap().RegisterType(arrayType)
	}

	// Downgrade from superuser to the non-superuser "chronicle" role so
	// that PostgreSQL RLS policies take effect. This runs once per new
	// pooled connection (AfterConnect), not per acquisition. After
	// pool.Reset() post-migration, every connection gets this role.
	if _, err := conn.Exec(ctx, "SET ROLE chronicle"); err != nil {
		return fmt.Errorf("set role chronicle: %w", err)
	}

	return nil
}

func NewPostgresDB(ctx context.Context, logger *slog.Logger, dbURL string, opts ...PoolOption) (*pgxpool.Pool, error) {
	cfg, migDone, err := PoolConfig(logger, dbURL, opts...)
	if err != nil {
		return nil, fmt.Errorf("parse postgres db url: %w", err)
	}

	logger.Info("connecting to postgres database", "max_conns", cfg.MaxConns)

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	pingCtx, pingCancel := context.WithTimeout(ctx, 15*time.Second)
	defer pingCancel()
	err = pool.Ping(pingCtx)
	if err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	err = migrations.Up(pool)
	if err != nil {
		return nil, fmt.Errorf("migrate up: %w", err)
	}

	migDone()

	// Force pool to create fresh connections that will register types.
	// Existing connections were created before migrations, so they don't
	// have custom types registered.
	pool.Reset()

	logger.Info("connected to postgres database")
	return pool, nil
}

// New creates a new database store using a SQL database connection.
func New(sdb *pgxpool.Pool) Store {
	return &sqlQuerier{
		db:  sdb,
		sdb: sdb,
	}
}

// PGXTx returns the pgx transaction backing a Store callback passed to InTx.
// It is intended for libraries, such as River, that must commit their writes
// atomically with generated application queries.
func PGXTx(store Store) (pgx.Tx, bool) {
	q, ok := store.(*sqlQuerier)
	if !ok {
		return nil, false
	}

	tx, ok := q.db.(*pgxpool.Tx)
	if !ok {
		return nil, false
	}
	return tx, true
}

func (q *sqlQuerier) Close() error {
	q.sdb.Close()
	return nil
}

// Ping returns the time it takes to ping the database.
func (q *sqlQuerier) Ping(ctx context.Context) (time.Duration, error) {
	start := time.Now()
	err := q.sdb.Ping(ctx)
	return time.Since(start), err
}

func (q *sqlQuerier) InTx(ctx context.Context, function func(Store) error, txOpts *pgx.TxOptions) error {
	_, inTx := q.db.(*pgxpool.Tx)
	isolation := pgx.ReadCommitted
	if txOpts != nil {
		isolation = txOpts.IsoLevel
	}

	// If we are not already in a transaction, and we are running in serializable
	// mode, we need to run the transaction in a retry loop. The caller should be
	// prepared to allow retries if using serializable mode.
	// If we are in a transaction already, the parent InTx call will handle the retry.
	// We do not want to duplicate those retries.
	if !inTx && isolation == pgx.Serializable {
		// This is an arbitrarily chosen number.
		const retryAmount = 3
		var err error
		attempts := 0
		for attempts = 0; attempts < retryAmount; attempts++ {
			err = q.runTx(ctx, function, txOpts)
			if err == nil {
				// Transaction succeeded.
				return nil
			}
			if err != nil && !IsSerializedError(err) {
				// We should only retry if the error is a serialization error.
				return err
			}
		}
		// Transaction kept failing in serializable mode.
		return xerrors.Errorf("transaction failed after %d attempts: %w", attempts, err)
	}
	return q.runTx(ctx, function, txOpts)
}

// runTx performs database operations inside a transaction.
func (q *sqlQuerier) runTx(ctx context.Context, function func(Store) error, txOpts *pgx.TxOptions) error {
	if _, ok := q.db.(*pgxpool.Tx); ok {
		// If the current inner "db" is already a transaction, we just reuse it.
		// We do not need to handle commit/rollback as the outer tx will handle
		// that.
		//
		// Check for tenant context mismatch: mixing tenant scopes within a
		// single transaction is a bug (e.g., outer is tenant-scoped, inner
		// tries AdminBypass — the connection's SET won't change mid-tx).
		if CheckNestedTxFunc != nil && q.txCtx != nil {
			if err := CheckNestedTxFunc(q.txCtx, ctx); err != nil {
				return xerrors.Errorf("nested InTx tenant mismatch: %w", err)
			}
		}
		err := function(q)
		if err != nil {
			return xerrors.Errorf("execute transaction: %w", err)
		}
		return nil
	}

	opts := txOpts
	if opts == nil {
		opts = &pgx.TxOptions{
			IsoLevel: pgx.ReadCommitted,
		}
	}

	// Use the caller's context for BeginTx so that pgxpool's PrepareConn hook
	// receives the tenant context and can SET app.tenant_id on the connection.
	// Note: per pgx docs, the context only affects the begin command — there is
	// no auto-rollback on context cancellation.
	transaction, err := q.sdb.BeginTx(ctx, *opts)
	if err != nil {
		return xerrors.Errorf("begin transaction: %w", err)
	}
	defer func() {
		rerr := transaction.Rollback(context.Background())
		if rerr == nil || errors.Is(rerr, sql.ErrTxDone) {
			// no need to do anything, tx committed successfully
			return
		}
		// couldn't roll back for some reason, extend returned error
		err = xerrors.Errorf("defer (%s): %w", rerr.Error(), err)
	}()
	err = function(&sqlQuerier{db: transaction, txCtx: ctx})
	if err != nil {
		return xerrors.Errorf("execute transaction: %w", err)
	}
	err = transaction.Commit(context.Background())
	if err != nil {
		return xerrors.Errorf("commit transaction: %w", err)
	}
	return nil
}
