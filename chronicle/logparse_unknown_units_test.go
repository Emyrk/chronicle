package chronicle

import (
	"context"
	"testing"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUnknownUnitsNotificationOptionalAndBestEffort(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	unknown := map[uint32]instances.UnknownUnit{42: {Name: "Unknown summon", Count: 1}}
	worker := &WorkerLogParse{parent: &Chronicle{}}
	require.NotPanics(t, func() { worker.notifyUnknownUnits(ctx, uuid.Nil, database.LogInstance{}, unknown) })
	bot, err := chroniclebot.New(ctx, testutil.Logger(t), chroniclebot.Config{Token: "test", AdminNotificationsChannelID: "admins"})
	require.NoError(t, err)
	worker.bot = bot
	// No queue is a logged, non-fatal error after successful persistence.
	require.NotPanics(t, func() { worker.notifyUnknownUnits(ctx, uuid.Nil, database.LogInstance{}, unknown) })
}
