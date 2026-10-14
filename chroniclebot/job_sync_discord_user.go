package chroniclebot

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindDiscordSyncUser = "discord-sync-user"

type ArgsSyncDiscordUser struct {
	DiscordID string    `json:"discord_id,omitempty"`
	UserID    uuid.UUID `json:"user_id,omitempty"`
	// ClaimToken identifies a claimed periodic or login membership check.
	ClaimToken uuid.UUID `json:"claim_token,omitempty"`
	// UniqueString is used to dedupe Discord gateway events.
	UniqueString string `json:"unique_string,omitempty"`
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
	if job.Args.ClaimToken != uuid.Nil {
		return b.syncClaimedDiscordUser(ctx, job.Args.UserID, job.Args.ClaimToken)
	}

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

	if err := b.syncDiscordUser(ctx, b.config.Zed, job.Args.DiscordID, link.UserID, uuid.NullUUID{}); err != nil {
		return fmt.Errorf("sync discord user %s: %w", job.Args.DiscordID, err)
	}

	b.logger.Info("synced discord user",
		slog.String("discord_id", job.Args.DiscordID),
		slog.String("user_id", link.UserID.String()),
		slog.String("action", job.Args.UniqueString),
	)
	return nil
}

func (b *Bot) syncClaimedDiscordUser(ctx context.Context, userID, rawClaimToken uuid.UUID) error {
	claimToken := uuid.NullUUID{UUID: rawClaimToken, Valid: true}
	_, err := b.config.DB.GetDiscordMembershipGrantCheckClaim(ctx, database.GetDiscordMembershipGrantCheckClaimParams{
		UserID:     userID,
		ClaimToken: claimToken,
		CheckTime:  database.Timestamptz(time.Now().UTC()),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("validate discord membership sync claim: %w", err)
	}

	link, err := b.config.DB.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID:   userID,
		Provider: "discord",
	})
	if errors.Is(err, sql.ErrNoRows) {
		if err := b.config.DB.DeleteDiscordMembershipGrantCheck(ctx, userID); err != nil {
			return fmt.Errorf("delete unlinked discord membership check: %w", err)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("load discord auth link: %w", err)
	}

	if err := b.syncDiscordUser(ctx, b.config.Zed, link.LinkedID, userID, claimToken); err != nil {
		return fmt.Errorf("sync claimed discord user %s: %w", link.LinkedID, err)
	}
	return nil
}
