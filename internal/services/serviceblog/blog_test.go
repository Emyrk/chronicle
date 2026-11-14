package serviceblog

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type testLimiter struct {
	calls   int
	subject string
	result  ratelimit.Result
	err     error
}

func (l *testLimiter) Take(_ context.Context, subject string, _ float64) (ratelimit.Result, error) {
	l.calls++
	l.subject = subject
	return l.result, l.err
}

type testStore struct {
	Store
	votes   int
	saves   int
	own     *Feedback
	created bool
}

func (s *testStore) SetVote(context.Context, string, uuid.UUID, int16) error { s.votes++; return nil }
func (s *testStore) OwnFeedback(context.Context, string, uuid.UUID) (*Feedback, error) {
	return s.own, nil
}
func (s *testStore) SaveFeedback(_ context.Context, f Feedback) (Feedback, bool, error) {
	s.saves++
	return f, s.created, nil
}

type testBans struct{ banned bool }

func (b testBans) Banned(context.Context, uuid.UUID) (bool, error)  { return b.banned, nil }
func (b testBans) SetBanned(context.Context, uuid.UUID, bool) error { return nil }
func TestValidateFeedback(t *testing.T) {
	t.Parallel()
	body, err := ValidateFeedback("  hello 🌍  ", true)
	require.NoError(t, err)
	require.Equal(t, "hello 🌍", body)
	for _, body := range []string{"", "   ", strings.Repeat("🌍", 301), string([]byte{0xff})} {
		_, err := ValidateFeedback(body, true)
		require.ErrorIs(t, err, ErrInvalid)
	}
	_, err = ValidateFeedback("hello", false)
	require.NoError(t, err)
	_, err = ValidateFeedback(strings.Repeat("🌍", 300), true)
	require.NoError(t, err)
}
func TestVoteAdmission(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		enabled  bool
		vote     int16
		limitErr error
		allowed  bool
		want     error
		calls    int
	}{
		{name: "invalid", enabled: true, vote: 2, want: ErrInvalid},
		{name: "disabled", vote: 1, want: ErrDisabled},
		{name: "limiter failure", enabled: true, vote: 1, limitErr: errors.New("database offline"), calls: 1},
		{name: "limited", enabled: true, vote: 1, calls: 1},
		{name: "switch", enabled: true, vote: -1, allowed: true, calls: 1},
		{name: "remove", enabled: true, vote: 0, allowed: true, calls: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &testStore{}
			limiter := &testLimiter{result: ratelimit.Result{Allowed: tc.allowed}, err: tc.limitErr}
			s := New(Options{Store: store, VoteLimiter: limiter, Eligible: func(context.Context, string, string) (bool, error) { return tc.enabled, nil }})
			user := uuid.New()
			err := s.Vote(context.Background(), "post", user, tc.vote)
			if tc.want != nil {
				require.ErrorIs(t, err, tc.want)
			} else if tc.allowed {
				require.NoError(t, err)
				require.Equal(t, 1, store.votes)
			} else {
				require.Error(t, err)
				require.Zero(t, store.votes)
			}
			require.Equal(t, tc.calls, limiter.calls)
			if tc.calls > 0 {
				require.Equal(t, ratelimit.UserSubject(user.String()), limiter.subject)
			}
		})
	}
}
func TestFeedbackAdmissionAndHook(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name                     string
		banned, deleted, created bool
		want                     error
	}{
		{name: "banned", banned: true, want: ErrBanned}, {name: "reserved", deleted: true, want: ErrReserved}, {name: "first", created: true}, {name: "edit"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &testStore{created: tc.created}
			if tc.deleted {
				store.own = &Feedback{Deleted: true}
			}
			limiter := &testLimiter{result: ratelimit.Result{Allowed: true}}
			hooks := 0
			s := New(Options{Store: store, Bans: testBans{tc.banned}, FeedbackLimiter: limiter, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }, FeedbackCreated: func(context.Context, Feedback) error { hooks++; return nil }})
			f, err := s.Save(context.Background(), "post", uuid.New(), uuid.New(), " body ", true)
			if tc.want != nil {
				require.ErrorIs(t, err, tc.want)
				require.Zero(t, limiter.calls)
				require.Zero(t, store.saves)
				require.Zero(t, hooks)
			} else {
				require.NoError(t, err)
				require.Equal(t, "body", f.Body)
				require.Equal(t, "pending", f.Status)
				if tc.created {
					require.Equal(t, 1, hooks)
				} else {
					require.Zero(t, hooks)
				}
			}
		})
	}
}

func (s *testStore) DeleteOwnFeedback(context.Context, string, uuid.UUID) error { return nil }
func TestBanDoesNotAffectVoteOrDelete(t *testing.T) {
	t.Parallel()
	limiter := &testLimiter{result: ratelimit.Result{Allowed: true}}
	s := New(Options{Store: &testStore{own: &Feedback{}}, Bans: testBans{banned: true}, VoteLimiter: limiter, FeedbackLimiter: limiter, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }})
	user := uuid.New()
	require.NoError(t, s.Vote(context.Background(), "post", user, 1))
	require.NoError(t, s.Delete(context.Background(), "post", user))
	require.Equal(t, 2, limiter.calls)
}

func TestModerationRequiresReviewedRevision(t *testing.T) {
	t.Parallel()
	s := New(Options{})
	require.ErrorIs(t, s.Moderate(context.Background(), uuid.New(), "approve", time.Time{}), ErrInvalid)
	require.ErrorIs(t, s.Moderate(context.Background(), uuid.New(), "reject", time.Time{}), ErrInvalid)
}

func TestFeedbackHookFailureDoesNotFailSavedFeedback(t *testing.T) {
	t.Parallel()
	store := &testStore{created: true}
	s := New(Options{Store: store, Bans: testBans{}, FeedbackLimiter: &testLimiter{result: ratelimit.Result{Allowed: true}}, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }, FeedbackCreated: func(context.Context, Feedback) error { return errors.New("consumer offline") }})
	f, err := s.Save(context.Background(), "post", uuid.New(), uuid.New(), "body", true)
	require.NoError(t, err)
	require.Equal(t, "body", f.Body)
	require.Equal(t, 1, store.saves)
}

func TestPrivateFeedbackPreservesConsent(t *testing.T) {
	t.Parallel()
	s := New(Options{Store: &testStore{created: true}, Bans: testBans{}, FeedbackLimiter: &testLimiter{result: ratelimit.Result{Allowed: true}}, Eligible: func(_ context.Context, _ string, kind string) (bool, error) { return kind == "feedback", nil }})
	user := uuid.New()
	saved, err := s.Save(context.Background(), "post", user, uuid.New(), "private", false)
	require.NoError(t, err)
	require.False(t, saved.Consent)
	require.ErrorIs(t, s.Vote(context.Background(), "post", user, 1), ErrDisabled)
}

func TestFeedbackActionPermissionBeforeAdmission(t *testing.T) {
	t.Parallel()
	for _, editing := range []bool{false, true} {
		store := &testStore{}
		if editing {
			store.own = &Feedback{}
		}
		limiter := &testLimiter{result: ratelimit.Result{Allowed: true}}
		called := false
		s := New(Options{Store: store, Bans: testBans{}, FeedbackLimiter: limiter, Eligible: func(context.Context, string, string) (bool, error) { return true, nil }, AuthorizeFeedback: func(_ context.Context, _ uuid.UUID, isEdit bool) error {
			called = true
			require.Equal(t, editing, isEdit)
			return ErrForbidden
		}})
		_, err := s.Save(context.Background(), "post", uuid.New(), uuid.Nil, "body", false)
		require.ErrorIs(t, err, ErrForbidden)
		require.True(t, called)
		require.Zero(t, limiter.calls)
		require.Zero(t, store.saves)
	}
}
