package api

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
)

func (a *API) newBlogService() *serviceblog.Service {
	db := database.New(a.Opts.Pool)
	limit := ratelimit.Limit{PerSecond: 1.0 / 1200, Burst: 5}
	return serviceblog.New(serviceblog.Options{
		Store:           serviceblog.NewDatabaseStore(db),
		Bans:            blogBans{zed: a.Zed},
		VoteLimiter:     ratelimit.New(db, "blog_vote", limit),
		FeedbackLimiter: ratelimit.New(db, "blog_feedback", limit),
		Eligible: func(ctx context.Context, slug string) (bool, error) {
			if servicetenant.TenantFromContext(ctx) == nil {
				return false, nil
			}
			return frontend.BlogInteractionsEnabled(frontend.FS(), slug, a.resolvedSiteFlavor(ctx).Strings())
		},
	})
}
