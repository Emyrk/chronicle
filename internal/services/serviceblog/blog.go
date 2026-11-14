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
	ErrDisabled = errors.New("blog interactions are not available")
	ErrInvalid  = errors.New("invalid blog interaction")
	ErrBanned   = errors.New("feedback submissions are disabled for this account")
	ErrReserved = errors.New("feedback has been deleted and cannot be recreated")
	ErrConflict = errors.New("feedback changed; refresh before retrying")
	ErrNotFound = errors.New("feedback not found")
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
}
type Bans interface {
	Banned(context.Context, uuid.UUID) (bool, error)
	SetBanned(context.Context, uuid.UUID, bool) error
}
type Limiter interface {
	Take(context.Context, string, float64) (ratelimit.Result, error)
}
type Options struct {
	Store           Store
	Bans            Bans
	VoteLimiter     Limiter
	FeedbackLimiter Limiter
	Eligible        func(context.Context, string) (bool, error)
	// FeedbackCreated is inactive by default. It runs best-effort after the first
	// successful insert only, not edits. Delivery is not durable or exactly-once.
	// Consumers must be idempotent. No rewards are issued by this service.
	Logger          *slog.Logger
	FeedbackCreated func(context.Context, Feedback) error
}
type Service struct{ opts Options }

func New(opts Options) *Service { return &Service{opts: opts} }

type RateLimited struct{ Result ratelimit.Result }

func (*RateLimited) Error() string { return "too many blog interactions" }
func (s *Service) eligible(ctx context.Context, slug string) error {
	if s.opts.Eligible == nil {
		return ErrDisabled
	}
	ok, err := s.opts.Eligible(ctx, slug)
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
	Enabled  bool
	Votes    Votes
	Feedback []Feedback
	Own      *Feedback
	Banned   bool
}

func (s *Service) Read(ctx context.Context, slug string, user uuid.UUID) (State, error) {
	out := State{Feedback: []Feedback{}}
	if err := s.eligible(ctx, slug); err != nil {
		if errors.Is(err, ErrDisabled) {
			return out, nil
		}
		return out, err
	}
	out.Enabled = true
	var err error
	out.Votes, err = s.opts.Store.Votes(ctx, slug, user)
	if err != nil {
		return out, err
	}
	out.Feedback, err = s.opts.Store.PublicFeedback(ctx, slug)
	if err != nil {
		return out, err
	}
	if user != uuid.Nil {
		out.Own, err = s.opts.Store.OwnFeedback(ctx, slug, user)
		if err != nil {
			return out, err
		}
		out.Banned, err = s.opts.Bans.Banned(ctx, user)
	}
	return out, err
}
func (s *Service) Vote(ctx context.Context, slug string, user uuid.UUID, vote int16) error {
	if vote < -1 || vote > 1 {
		return ErrInvalid
	}
	if err := s.eligible(ctx, slug); err != nil {
		return err
	}
	if err := take(ctx, s.opts.VoteLimiter, user); err != nil {
		return err
	}
	return s.opts.Store.SetVote(ctx, slug, user, vote)
}
func ValidateFeedback(body string, consent bool) (string, error) {
	body = strings.TrimSpace(body)
	if !consent || !utf8.ValidString(body) || utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > 300 {
		return "", ErrInvalid
	}
	return body, nil
}
func (s *Service) Save(ctx context.Context, slug string, user, tenant uuid.UUID, body string, consent bool) (Feedback, error) {
	body, err := ValidateFeedback(body, consent)
	if err != nil {
		return Feedback{}, err
	}
	if err = s.eligible(ctx, slug); err != nil {
		return Feedback{}, err
	}
	if user == uuid.Nil || tenant == uuid.Nil {
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
	if err = take(ctx, s.opts.FeedbackLimiter, user); err != nil {
		return Feedback{}, err
	}
	feedback, created, err := s.opts.Store.SaveFeedback(ctx, Feedback{ID: uuid.New(), PostSlug: slug, UserID: user, TenantID: tenant, Body: body, Consent: true, Status: "pending"})
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
	if err := s.eligible(ctx, slug); err != nil {
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

// Admin methods are unthrottled; transport must enforce the global user-admin permission.
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
