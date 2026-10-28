package chroniclebot

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

type staleNonMemberCompletionStore struct {
	database.Store
	userID         uuid.UUID
	claimToken     uuid.UUID
	completionSeen bool
}

func (s *staleNonMemberCompletionStore) GetDiscordMembershipGrantCheckClaim(
	_ context.Context,
	params database.GetDiscordMembershipGrantCheckClaimParams,
) (database.DiscordMembershipGrantCheck, error) {
	if params.UserID != s.userID || params.ClaimToken.UUID != s.claimToken {
		return database.DiscordMembershipGrantCheck{}, sql.ErrNoRows
	}
	return database.DiscordMembershipGrantCheck{}, nil
}

func (s *staleNonMemberCompletionStore) GetUserAuthLinkByUserIDAndProvider(
	_ context.Context,
	params database.GetUserAuthLinkByUserIDAndProviderParams,
) (database.UserAuthLink, error) {
	if params.UserID != s.userID || params.Provider != "discord" {
		return database.UserAuthLink{}, sql.ErrNoRows
	}
	return database.UserAuthLink{UserID: s.userID, Provider: "discord", LinkedID: "discord-user"}, nil
}

func (s *staleNonMemberCompletionStore) CompleteDiscordMembershipGrantCheckNonMember(
	_ context.Context,
	params database.CompleteDiscordMembershipGrantCheckNonMemberParams,
) (database.DiscordMembershipGrantCheck, error) {
	s.completionSeen = true
	if params.UserID != s.userID || params.ClaimToken.UUID != s.claimToken {
		return database.DiscordMembershipGrantCheck{}, errors.New("unexpected membership completion parameters")
	}
	return database.DiscordMembershipGrantCheck{}, sql.ErrNoRows
}

func TestCheckDiscordMembershipGrantIgnoresStaleNonMemberCompletion(t *testing.T) {
	t.Parallel()

	userID := uuid.New()
	claimToken := uuid.New()
	store := &staleNonMemberCompletionStore{userID: userID, claimToken: claimToken}

	session, err := discordgo.New("Bot test-token")
	require.NoError(t, err)
	session.Client.Transport = roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusNotFound,
			Status:     "404 Not Found",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"message":"Unknown Member","code":10007}`)),
			Request:    req,
		}, nil
	})

	worker := &WorkerCheckDiscordMembershipGrant{bot: &Bot{
		session: session,
		logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		config: Config{
			GuildID: "chronicle-guild",
			DB:      store,
		},
	}}

	err = worker.Work(context.Background(), &river.Job[ArgsCheckDiscordMembershipGrant]{
		Args: ArgsCheckDiscordMembershipGrant{UserID: userID, ClaimToken: claimToken},
	})
	require.NoError(t, err)
	require.True(t, store.completionSeen)
}

func TestDiscordMembershipJitter(t *testing.T) {
	t.Parallel()

	userID := uuid.MustParse("9eabcb3c-e592-42eb-a0bc-c8b0368ff7d0")
	dueAt := time.Date(2026, time.July, 31, 12, 0, 0, 0, time.UTC)
	first := discordMembershipJitter(userID, dueAt)
	second := discordMembershipJitter(userID, dueAt)

	require.Equal(t, first, second)
	require.GreaterOrEqual(t, first, time.Duration(0))
	require.Less(t, first, 55*time.Minute)
}

func TestDiscordMembershipJobOptions(t *testing.T) {
	t.Parallel()

	opts := ArgsCheckDiscordMembershipGrant{}.InsertOpts()
	require.Equal(t, 1, opts.MaxAttempts)
	require.True(t, opts.UniqueOpts.ByArgs)
	require.Contains(t, opts.UniqueOpts.ByState, rivertype.JobStateRetryable)
}

func TestMembershipGrantClaimLimit(t *testing.T) {
	t.Parallel()

	require.Equal(t, int32(100), (&Bot{}).membershipGrantClaimLimit())
	require.Equal(t, int32(25), (&Bot{config: Config{MembershipGrantChecksPerHour: 25}}).membershipGrantClaimLimit())
	require.Equal(t, int32(500), (&Bot{config: Config{MembershipGrantChecksPerHour: 1000}}).membershipGrantClaimLimit())
}

func TestSanitizeMembershipError(t *testing.T) {
	t.Parallel()

	message := "  " + strings.Repeat("x", discordMembershipErrorLimit+100) + "  "
	sanitized := sanitizeMembershipError(errors.New(message))
	require.Len(t, sanitized, discordMembershipErrorLimit)
	require.NotContains(t, sanitized, "  ")
}
