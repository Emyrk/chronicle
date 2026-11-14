package api

import (
	"context"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/frontend"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/serviceblog"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
)

func (a *API) newBlogService() *serviceblog.Service {
	db := database.New(a.Opts.Pool)
	limit := ratelimit.Limit{PerSecond: 2.0 / 1200, Burst: 10}
	return serviceblog.New(serviceblog.Options{
		Logger: a.Opts.Logger,
		AuthorizeFeedback: func(ctx context.Context, user uuid.UUID, editing bool) error {
			action := "create_blog_feedback"
			if editing {
				action = "edit_blog_feedback"
			}
			return checkBlogPermission(ctx, policy.New().User(user), action, func(ctx context.Context, check rel.Relationship) (bool, error) {
				return a.Zed.CheckOne(ctx, nil, check)
			})
		},
		Store:           serviceblog.NewDatabaseStore(db),
		Bans:            blogBans{zed: a.Zed},
		VoteLimiter:     ratelimit.New(db, "blog_vote", limit),
		FeedbackLimiter: ratelimit.New(db, "blog_feedback", limit),
		Eligible: func(ctx context.Context, slug string, kind string) (bool, error) {
			return frontend.BlogInteractionsEnabled(frontend.FS(), slug, a.resolvedSiteFlavor(ctx).Strings(), kind)
		},
	})
}

type blogBans struct{ zed *authz.Authz }

func (b blogBans) Banned(ctx context.Context, user uuid.UUID) (bool, error) {
	p := policy.New()
	allowed, err := b.zed.CheckOne(ctx, nil, p.GlobalChronicle().CanSubmit_blog_feedback_User(p.User(user)))
	return !allowed, err
}
func (b blogBans) SetBanned(ctx context.Context, user uuid.UUID, banned bool) error {
	p := policy.New()
	if banned {
		p.GlobalChronicle().Feedback_banned(p.User(user))
	} else {
		p.GlobalChronicle().Delete().Feedback_banned(p.User(user))
	}
	_, err := b.zed.Write(ctx, *p.Txn())
	return err
}
