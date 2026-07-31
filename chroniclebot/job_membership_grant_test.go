package chroniclebot

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river/rivertype"
	"github.com/stretchr/testify/require"
)

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
