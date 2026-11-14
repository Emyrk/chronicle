// Package serviceblog owns global blog votes and moderated anonymous feedback.
package serviceblog

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/google/uuid"
)

var (
	ErrForbidden = errors.New("blog action is not permitted")
	ErrDisabled  = errors.New("blog interactions are not available")
	ErrInvalid   = errors.New("invalid blog interaction")
	ErrBanned    = errors.New("feedback submissions are disabled for this account")
	ErrReserved  = errors.New("feedback has been deleted and cannot be recreated")
	ErrConflict  = errors.New("feedback changed; refresh before retrying")
	ErrNotFound  = errors.New("feedback not found")
)

type Feedback struct {
	UpdatedAt time.Time
	ID        uuid.UUID
	PostSlug  string
	UserID    uuid.UUID
	TenantID  uuid.UUID
	Body      string
	Status    string
	Consent   bool
	Deleted   bool
	// Author identity is filled only for moderator listings, never public projections.
	AuthorUsername  string
	AuthorDiscordID string
}

// Summary is the public per-post projection shown on the blog index.
type Summary struct {
	Slug           string
	UpVotes        int64
	PublicFeedback int64
}
type Votes struct {
	Up, Down int64
	Own      int16
}

// Store persists global account/post identity. SaveFeedback must atomically reject a
// deleted reservation, preserve the original tenant, and reset approval on edits.
type Store interface {
	Votes(context.Context, string, uuid.UUID) (Votes, error)
	SetVote(context.Context, string, uuid.UUID, int16) error
	PublicFeedback(context.Context, string) ([]Feedback, error)
	OwnFeedback(context.Context, string, uuid.UUID) (*Feedback, error)
	SaveFeedback(context.Context, Feedback) (Feedback, bool, error)
	DeleteOwnFeedback(context.Context, string, uuid.UUID) error
	ListFeedback(context.Context) ([]Feedback, error)
	Moderate(context.Context, uuid.UUID, string, time.Time) error
	// Summaries returns public totals for every post with at least one upvote or public feedback.
	Summaries(context.Context) ([]Summary, error)
}
type Bans interface {
	Banned(context.Context, uuid.UUID) (bool, error)
	SetBanned(context.Context, uuid.UUID, bool) error
}
type Limiter interface {
	Take(context.Context, string, float64) (ratelimit.Result, error)
}
type Options struct {
	// AuthorizeFeedback checks the dedicated create/edit permission before admission.
	AuthorizeFeedback func(context.Context, uuid.UUID, bool) error
	Store             Store
	Bans              Bans
	VoteLimiter       Limiter
	FeedbackLimiter   Limiter
	Eligible          func(context.Context, string, string) (bool, error)
	// FeedbackCreated is inactive by default. It runs best-effort after the first
	// successful insert only, not edits. Delivery is not durable or exactly-once.
	// Consumers must be idempotent. No rewards are issued by this service.
	Logger          *slog.Logger
	FeedbackCreated func(context.Context, Feedback) error
}
type Service struct{ opts Options }

func New(opts Options) *Service { return &Service{opts: opts} }

type RateLimited struct{ Result ratelimit.Result }

func (*RateLimited) Error() string {
	return "Too many blog interactions. Please wait at least 20 minutes and try again."
}
func (s *Service) eligible(ctx context.Context, slug string, kind string) error {
	if s.opts.Eligible == nil {
		return ErrDisabled
	}
	ok, err := s.opts.Eligible(ctx, slug, kind)
	if err != nil {
		return err
	}
	if !ok {
		return ErrDisabled
	}
	return nil
}
func take(ctx context.Context, limiter Limiter, user uuid.UUID) error {
	if user == uuid.Nil {
		return ErrInvalid
	}
	if limiter == nil {
		return errors.New("blog limiter unavailable")
	}
	result, err := limiter.Take(ctx, ratelimit.UserSubject(user.String()), 1)
	if err != nil {
		return err
	}
	if !result.Allowed {
		return &RateLimited{Result: result}
	}
	return nil
}

type State struct {
	VotingEnabled   bool
	FeedbackEnabled bool
	Enabled         bool
	Votes           Votes
	Feedback        []Feedback
	Own             *Feedback
	Banned          bool
}

func (s *Service) Read(ctx context.Context, slug string, user uuid.UUID) (State, error) {
	return s.ReadWithAccess(ctx, slug, user, true, true)
}

// ReadWithAccess always returns the public projection but only loads authorized own state.
func (s *Service) ReadWithAccess(ctx context.Context, slug string, user uuid.UUID, ownVote, ownFeedback bool) (State, error) {
	out := State{Feedback: []Feedback{}}
	for _, kind := range []string{"vote", "feedback"} {
		if err := s.eligible(ctx, slug, kind); err != nil {
			if errors.Is(err, ErrDisabled) {
				continue
			}
			return out, err
		}
		if kind == "vote" {
			out.VotingEnabled = true
		} else {
			out.FeedbackEnabled = true
		}
	}
	out.Enabled = out.VotingEnabled || out.FeedbackEnabled
	var err error
	if out.VotingEnabled {
		voteUser := uuid.Nil
		if ownVote {
			voteUser = user
		}
		out.Votes, err = s.opts.Store.Votes(ctx, slug, voteUser)
		if err != nil {
			return out, err
		}
	}
	if out.FeedbackEnabled {
		out.Feedback, err = s.opts.Store.PublicFeedback(ctx, slug)
		if err != nil {
			return out, err
		}
		if user != uuid.Nil && ownFeedback {
			out.Own, err = s.opts.Store.OwnFeedback(ctx, slug, user)
			if err != nil {
				return out, err
			}
			out.Banned, err = s.opts.Bans.Banned(ctx, user)
		}
	}
	return out, err
}

// Summaries returns public totals, zeroing each count whose interaction is disabled for the
// post in this context, and omitting posts with nothing left to show.
func (s *Service) Summaries(ctx context.Context) ([]Summary, error) {
	rows, err := s.opts.Store.Summaries(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(rows))
	for _, row := range rows {
		for kind, count := range map[string]*int64{"vote": &row.UpVotes, "feedback": &row.PublicFeedback} {
			if *count == 0 {
				continue
			}
			if err := s.eligible(ctx, row.Slug, kind); err != nil {
				if !errors.Is(err, ErrDisabled) {
					return nil, err
				}
				*count = 0
			}
		}
		if row.UpVotes > 0 || row.PublicFeedback > 0 {
			out = append(out, row)
		}
	}
	return out, nil
}
func (s *Service) Vote(ctx context.Context, slug string, user uuid.UUID, vote int16) error {
	if vote < -1 || vote > 1 {
		return ErrInvalid
	}
	if err := s.eligible(ctx, slug, "vote"); err != nil {
		return err
	}
	if err := take(ctx, s.opts.VoteLimiter, user); err != nil {
		return err
	}
	return s.opts.Store.SetVote(ctx, slug, user, vote)
}
func ValidateFeedback(body string, consent bool) (string, error) {
	body = strings.TrimSpace(body)
	if !utf8.ValidString(body) || utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > 300 {
		return "", ErrInvalid
	}
	return body, nil
}
func (s *Service) Save(ctx context.Context, slug string, user, tenant uuid.UUID, body string, consent bool) (Feedback, error) {
	body, err := ValidateFeedback(body, consent)
	if err != nil {
		return Feedback{}, err
	}
	if err = s.eligible(ctx, slug, "feedback"); err != nil {
		return Feedback{}, err
	}
	if user == uuid.Nil {
		return Feedback{}, ErrInvalid
	}
	banned, err := s.opts.Bans.Banned(ctx, user)
	if err != nil {
		return Feedback{}, err
	}
	if banned {
		return Feedback{}, ErrBanned
	}
	own, err := s.opts.Store.OwnFeedback(ctx, slug, user)
	if err != nil {
		return Feedback{}, err
	}
	if own != nil && own.Deleted {
		return Feedback{}, ErrReserved
	}
	if s.opts.AuthorizeFeedback != nil {
		if err = s.opts.AuthorizeFeedback(ctx, user, own != nil); err != nil {
			return Feedback{}, err
		}
	}
	if err = take(ctx, s.opts.FeedbackLimiter, user); err != nil {
		return Feedback{}, err
	}
	feedback, created, err := s.opts.Store.SaveFeedback(ctx, Feedback{ID: uuid.New(), PostSlug: slug, UserID: user, TenantID: tenant, Body: body, Consent: consent, Status: "pending"})
	if err == nil && created && s.opts.FeedbackCreated != nil {
		if hookErr := s.opts.FeedbackCreated(ctx, feedback); hookErr != nil {
			logger := s.opts.Logger
			if logger == nil {
				logger = slog.Default()
			}
			logger.ErrorContext(ctx, "blog feedback-created hook failed", "feedback_id", feedback.ID, "error", hookErr)
		}
	}
	return feedback, err
}
func (s *Service) Delete(ctx context.Context, slug string, user uuid.UUID) error {
	if err := s.eligible(ctx, slug, "feedback"); err != nil {
		return err
	}
	own, err := s.opts.Store.OwnFeedback(ctx, slug, user)
	if err != nil {
		return err
	}
	if own == nil {
		return ErrNotFound
	}
	if err = take(ctx, s.opts.FeedbackLimiter, user); err != nil {
		return err
	}
	return s.opts.Store.DeleteOwnFeedback(ctx, slug, user)
}

// Admin methods are unthrottled; transport must enforce each dedicated blog permission.
func (s *Service) List(ctx context.Context) ([]Feedback, error) {
	return s.opts.Store.ListFeedback(ctx)
}
func (s *Service) Moderate(ctx context.Context, id uuid.UUID, action string, expected time.Time) error {
	if id == uuid.Nil || (action != "delete" && expected.IsZero()) {
		return ErrInvalid
	}
	switch action {
	case "approve", "reject", "delete":
		return s.opts.Store.Moderate(ctx, id, action, expected)
	default:
		return ErrInvalid
	}
}
func (s *Service) Ban(ctx context.Context, user uuid.UUID, banned bool) error {
	if user == uuid.Nil {
		return ErrInvalid
	}
	return s.opts.Bans.SetBanned(ctx, user, banned)
}

func (s *Service) AdminVotes(ctx context.Context, slug string) (Votes, error) {
	return s.opts.Store.Votes(ctx, slug, uuid.Nil)
}
