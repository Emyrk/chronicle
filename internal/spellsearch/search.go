package spellsearch

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/xerrors"
)

const DefaultStatementTimeout = 5 * time.Second

var ErrTimeout = errors.New("spell search timed out")

type SearchOptions struct{ StatementTimeout time.Duration }

func Search(ctx context.Context, db database.Store, compiled Compiled, opts SearchOptions) (Page, error) {
	timeout := opts.StatementTimeout
	if timeout <= 0 {
		timeout = DefaultStatementTimeout
	}
	var results []Result
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
			var r Result
			if err := rows.Scan(&r.ID, &r.Name, &r.Subtext, &r.Description, &r.SpellLevel, &r.BaseLevel, &r.School, &r.SpellIconID); err != nil {
				return xerrors.Errorf("scan: %w", err)
			}
			results = append(results, r)
		}
		return rows.Err()
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "57014" {
			return Page{}, ErrTimeout
		}
		return Page{}, xerrors.Errorf("spell search: %w", err)
	}
	page := Page{Results: results}
	if len(results) > compiled.Limit {
		page.Results = results[:compiled.Limit]
		page.Next = &Cursor{SpellID: page.Results[len(page.Results)-1].ID}
	}
	if page.Results == nil {
		page.Results = []Result{}
	}
	return page, nil
}
