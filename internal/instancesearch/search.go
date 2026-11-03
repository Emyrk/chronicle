package instancesearch

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/xerrors"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

// DefaultStatementTimeout bounds how long one search may run.
const DefaultStatementTimeout = 5 * time.Second

// Result is one matching instance.
type Result struct {
	ID             uuid.UUID     `json:"id"`
	Slug           string        `json:"slug,omitempty"`
	Name           string        `json:"name"`
	RealmID        uuid.UUID     `json:"realm_id"`
	RealmName      string        `json:"realm_name"`
	GuildID        uuid.NullUUID `json:"guild_id"`
	GuildName      string        `json:"guild_name,omitempty"`
	DifficultyName string        `json:"difficulty_name"`
	MaxPlayers     int32         `json:"max_players"`
	StartedAt      time.Time     `json:"started_at"`
}

// Page is one page of results.
type Page struct {
	Results []Result `json:"results"`
	// Next is set when more results exist.
	Next *Cursor `json:"next,omitempty"`
}

// SearchOptions configures Search.
type SearchOptions struct {
	Options
	// StatementTimeout bounds the query. Zero uses DefaultStatementTimeout.
	StatementTimeout time.Duration
}

// Search compiles and runs q in a read-only transaction.
//
// Tenant scoping comes from the connection's app.tenant_id (row-level
// security on realms), which database.PrepareConnFunc sets from ctx. The
// tenant used for parse tables is taken from the same ctx, so the two can
// never disagree.
func Search(ctx context.Context, db database.Store, q Query, opts SearchOptions) (Page, error) {
	opts.TenantID = servicetenant.TenantIDFromContext(ctx)
	compiled, err := Compile(q, opts.Options)
	if err != nil {
		return Page{}, err
	}
	timeout := opts.StatementTimeout
	if timeout <= 0 {
		timeout = DefaultStatementTimeout
	}

	var results []Result
	err = db.InTx(ctx, func(tx database.Store) error {
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
			if err := rows.Scan(&r.ID, &slug, &r.Name, &r.RealmID, &r.RealmName, &r.GuildID, &guildName,
				&r.DifficultyName, &r.MaxPlayers, &r.StartedAt); err != nil {
				return xerrors.Errorf("scan: %w", err)
			}
			r.Slug = slug.String
			r.GuildName = guildName.String
			results = append(results, r)
		}
		return rows.Err()
	}, &pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return Page{}, xerrors.Errorf("instance search: %w", err)
	}

	page := Page{Results: results}
	if len(results) > compiled.Limit {
		page.Results = results[:compiled.Limit]
		last := page.Results[len(page.Results)-1]
		page.Next = &Cursor{StartedAt: last.StartedAt, ID: last.ID}
	}
	if page.Results == nil {
		page.Results = []Result{}
	}
	return page, nil
}
