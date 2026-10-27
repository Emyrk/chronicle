package chroniclebot

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindDiscordSyncUser = "discord-sync-user"

type ArgsSyncDiscordUser struct {
	DiscordID string `json:"discord_id"`
	// UniqueString is used to dedupe-events
	UniqueString string `json:"unique_string"`
}

func (a ArgsSyncDiscordUser) Kind() string { return KindDiscordSyncUser }

func (a ArgsSyncDiscordUser) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordSync,
		Priority:    riverconst.PriorityDefault,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByArgs: true,
			ByState: []rivertype.JobState{
				rivertype.JobStateScheduled,
				rivertype.JobStatePending,
				rivertype.JobStateAvailable,
				rivertype.JobStateRunning,
				rivertype.JobStateRetryable,
			},
		},
	}
}

type WorkerSyncDiscordUser struct {
	river.WorkerDefaults[ArgsSyncDiscordUser]
	bot *Bot
}

func (b *Bot) NewWorkerSyncDiscordUser() river.Worker[ArgsSyncDiscordUser] {
	return &WorkerSyncDiscordUser{bot: b}
}

func (w *WorkerSyncDiscordUser) Work(ctx context.Context, job *river.Job[ArgsSyncDiscordUser]) error {
	b := w.bot

	link, err := b.config.DB.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
		LinkedID: job.Args.DiscordID,
		Provider: "discord",
	})
	if err != nil {
		b.logger.Debug("sync job: user not found in db",
			slog.String("discord_id", job.Args.DiscordID),
			slog.String("unique", job.Args.UniqueString),
		)
		return nil // not an error — user just isn't in our system
	}
	err = b.SyncDiscordUser(ctx, b.config.Zed, job.Args.DiscordID, link.UserID)
	if err != nil {
		return fmt.Errorf("sync discord user %s: %w", job.Args.DiscordID, err)
	}

	b.logger.Info("synced discord user",
		slog.String("discord_id", job.Args.DiscordID),
		slog.String("user_id", link.UserID.String()),
		slog.String("action", job.Args.UniqueString),
	)

	return nil
}
