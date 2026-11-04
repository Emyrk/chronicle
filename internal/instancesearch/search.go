package instancesearch

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/xerrors"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// DefaultStatementTimeout bounds how long one search may run.
const DefaultStatementTimeout = 5 * time.Second

// ErrTimeout is returned when a search hits its statement timeout.
var ErrTimeout = errors.New("instance search timed out")

// SearchOptions configures Search.
type SearchOptions struct {
	Options
	// StatementTimeout bounds the query. Zero uses DefaultStatementTimeout.
	StatementTimeout time.Duration
}

// Search runs an already-compiled query in a read-only transaction.
//
// Tenant scoping comes from the connection's app.tenant_id (row-level
// security on realms), which database.PrepareConnFunc sets from ctx. Compile
// the query with CompileForContext so the tenant bound into parse tables
// comes from the same ctx. Searching with an admin-bypass context is refused:
// it would disable RLS and search every tenant.
func Search(ctx context.Context, db database.Store, compiled Compiled, opts SearchOptions) (Page, error) {
	if servicetenant.IsBypass(ctx) {
		return Page{}, xerrors.New("instance search must not run with tenant RLS bypassed")
	}
	timeout := opts.StatementTimeout
	if timeout <= 0 {
		timeout = DefaultStatementTimeout
	}

	var results []Result
	var cursorValues []*string
	err := db.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.Exec(ctx, "SELECT set_config('statement_timeout', $1::text, true)", strconv.FormatInt(timeout.Milliseconds(), 10)); err != nil {
			return xerrors.Errorf("set statement timeout: %w", err)
		}
		rows, err := tx.Query(ctx, compiled.SQL, compiled.Args...)
		if err != nil {
			return xerrors.Errorf("query: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var (
				r         Result
				slug      pgtype.Text
				guildName pgtype.Text
			)
			var clear pgtype.Int8
			var cursorValue pgtype.Text
			if err := rows.Scan(&r.ID, &slug, &r.Name, &r.RealmID, &r.RealmName, &r.GuildID, &guildName,
				&r.DifficultyName, &r.MaxPlayers, &r.StartedAt, &r.PlayerCount, &r.BossesKilled, &clear, &cursorValue); err != nil {
				return xerrors.Errorf("scan: %w", err)
			}
			if clear.Valid {
				r.ClearTimeMS = &clear.Int64
			}
			r.Slug = slug.String
			r.GuildName = guildName.String
			if cursorValue.Valid {
				value := cursorValue.String
				r.SortValue = &value
			}
			results = append(results, r)
			cursorValues = append(cursorValues, r.SortValue)
		}
		return rows.Err()
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "57014" { // query_canceled
			return Page{}, ErrTimeout
		}
		return Page{}, xerrors.Errorf("instance search: %w", err)
	}

	page := Page{Results: results}
	if len(results) > compiled.Limit {
		page.Results = results[:compiled.Limit]
		lastIndex := len(page.Results) - 1
		last := page.Results[lastIndex]
		page.Next = &Cursor{Value: cursorValues[lastIndex], ID: last.ID, Sort: compiled.Sort}
	}
	if page.Results == nil {
		page.Results = []Result{}
	}
	return page, nil
}

// CompileForContext compiles q with the tenant taken from ctx, matching the
// app.tenant_id the connection will carry.
func CompileForContext(ctx context.Context, q Query, opts Options) (Compiled, error) {
	opts.TenantID = servicetenant.TenantIDFromContext(ctx)
	return Compile(q, opts)
}
