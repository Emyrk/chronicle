package chronicle

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
)

const (
	KindAccountPurge = "account-purge"

	AccountPurgePending   = "pending"
	AccountPurgeRunning   = "running"
	AccountPurgeSucceeded = "succeeded"
	AccountPurgeFailed    = "failed"

	accountPurgeMaxAttempts = 5
)

// accountPurgeFailedMessage is shown on the public purge status endpoint, so it
// never includes internal error details.
const accountPurgeFailedMessage = "The purge stopped before finishing. Some data may already be deleted. Start the purge again, or contact us if it keeps failing."

type ArgsAccountPurge struct {
	PurgeID uuid.UUID `json:"purge_id"`
}

func (ArgsAccountPurge) Kind() string { return KindAccountPurge }

func (ArgsAccountPurge) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		MaxAttempts: accountPurgeMaxAttempts,
		UniqueOpts:  river.UniqueOpts{ByArgs: true},
	}
}

// WorkerAccountPurge deletes everything a user owns and then the user. Every
// step re-reads what is left, so a retried job resumes where it stopped.
type WorkerAccountPurge struct {
	river.WorkerDefaults[ArgsAccountPurge]
	parent *Chronicle
	// leaveDiscordGuild removes the bot from a Discord server once no Chronicle
	// guild uses it. Nil when the bot is disabled.
	leaveDiscordGuild func(discordGuildID string) error
}

// RejectIfAccountPurging freezes an account while it is being purged. Call it
// after locking the user's row so the check cannot race a purge starting.
func RejectIfAccountPurging(ctx context.Context, tx *authz.AuthzTX, userID uuid.UUID) error {
	_, err := tx.GetActiveAccountPurgeByUser(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("check account purge: %w", err)
	}
	return httpapi.NewAPIError(errors.New("account purge in progress"), "Your account is being purged, so new uploads are disabled.", http.StatusConflict)
}

func (c *Chronicle) NewWorkerAccountPurge(leaveDiscordGuild func(discordGuildID string) error) river.Worker[ArgsAccountPurge] {
	return &WorkerAccountPurge{parent: c, leaveDiscordGuild: leaveDiscordGuild}
}

func (c *Chronicle) EnqueueAccountPurge(ctx context.Context, purgeID uuid.UUID) error {
	if c.queue == nil {
		return errors.New("job queue is unavailable")
	}
	_, err := c.queue.Insert(ctx, ArgsAccountPurge{PurgeID: purgeID}, nil)
	return err
}

func (*WorkerAccountPurge) Timeout(*river.Job[ArgsAccountPurge]) time.Duration {
	return time.Hour
}

func (w *WorkerAccountPurge) Work(ctx context.Context, job *river.Job[ArgsAccountPurge]) error {
	err := w.purge(ctx, job.Args.PurgeID)
	if err == nil {
		return nil
	}
	slog.ErrorContext(ctx, "account purge failed", slog.String("purge_id", job.Args.PurgeID.String()), slog.Int("attempt", job.Attempt), slog.Any("error", err))
	if job.Attempt >= job.MaxAttempts {
		if finishErr := w.parent.Zed.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{
			ID: job.Args.PurgeID, Status: AccountPurgeFailed, Error: accountPurgeFailedMessage,
		}); finishErr != nil {
			return errors.Join(err, finishErr)
		}
	}
	return err
}

func (w *WorkerAccountPurge) purge(ctx context.Context, purgeID uuid.UUID) error {
	db := w.parent.Zed
	purge, err := db.GetAccountPurge(ctx, purgeID)
	if err != nil {
		return fmt.Errorf("get account purge: %w", err)
	}
	if purge.Status == AccountPurgeSucceeded || purge.Status == AccountPurgeFailed {
		return nil
	}
	userID := purge.UserID
	logsDeleted := purge.LogsDeleted
	logsTotal := purge.LogsTotal
	progress := func(step string) error {
		return db.UpdateAccountPurgeProgress(ctx, database.UpdateAccountPurgeProgressParams{
			ID: purgeID, Step: step, LogsTotal: logsTotal, LogsDeleted: logsDeleted,
		})
	}

	logIDs, err := db.ListOwnedLogGroupIDs(ctx, userID)
	if err != nil {
		return fmt.Errorf("list owned logs: %w", err)
	}
	logsTotal = logsDeleted + int32(len(logIDs))
	if err := progress("logs"); err != nil {
		return err
	}
	for _, logID := range logIDs {
		if err := w.parent.DeleteWoWLogGroup(ctx, logID); err != nil {
			return fmt.Errorf("delete log group %s: %w", logID, err)
		}
		logsDeleted++
		if err := progress("logs"); err != nil {
			return err
		}
	}
	if err := db.ReassignAppendedLogFilesToGroupOwner(ctx, userID); err != nil {
		return fmt.Errorf("reassign appended log files: %w", err)
	}

	if err := progress("modules"); err != nil {
		return err
	}
	projectIDs, err := db.ListOwnedLuaProjectIDs(ctx, userID)
	if err != nil {
		return fmt.Errorf("list owned modules: %w", err)
	}
	for _, projectID := range projectIDs {
		err := db.InTx(ctx, func(tx *authz.AuthzTX) error {
			_, err := tx.DeleteLuaProject(ctx, projectID)
			return err
		}, nil)
		if err != nil {
			return fmt.Errorf("delete module %s: %w", projectID, err)
		}
	}

	if err := progress("community"); err != nil {
		return err
	}
	keyIDs, err := db.ListUploadKeyIDsCreatedByUser(ctx, uuid.NullUUID{UUID: userID, Valid: true})
	if err != nil {
		return fmt.Errorf("list upload keys: %w", err)
	}
	for _, keyID := range keyIDs {
		if err := db.DeleteUploadKey(ctx, keyID); err != nil {
			return fmt.Errorf("delete upload key %s: %w", keyID, err)
		}
	}
	guildIDs, err := db.ListGuildIDsWithDiscordInstalledByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("list guild Discord installations: %w", err)
	}
	for _, guildID := range guildIDs {
		installation, err := db.DeleteGuildDiscordInstallation(ctx, guildID)
		if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return fmt.Errorf("delete guild Discord installation %s: %w", guildID, err)
		}
		remaining, err := db.CountGuildDiscordInstallationsByDiscordGuildID(ctx, installation.DiscordGuildID)
		if err != nil {
			return fmt.Errorf("count guild Discord installations: %w", err)
		}
		if remaining == 0 && w.leaveDiscordGuild != nil {
			if err := w.leaveDiscordGuild(installation.DiscordGuildID); err != nil {
				slog.WarnContext(ctx, "failed to remove Discord bot after account purge", slog.String("discord_guild_id", installation.DiscordGuildID), slog.Any("error", err))
			}
		}
	}
	if err := db.DeleteServerApplicationsByInitiator(ctx, userID); err != nil {
		return fmt.Errorf("delete server applications: %w", err)
	}
	if err := db.ClearApplicationReviewsByReviewer(ctx, uuid.NullUUID{UUID: userID, Valid: true}); err != nil {
		return fmt.Errorf("clear application reviews: %w", err)
	}

	if err := progress("account"); err != nil {
		return err
	}
	// Everything else the user owns cascades from the user row. Sessions go in
	// the same transaction, which revokes the user's JWTs immediately.
	return db.InTx(ctx, func(tx *authz.AuthzTX) error {
		locked, err := tx.LockUsersForUpdate(ctx, []uuid.UUID{userID})
		if err != nil {
			return err
		}
		if len(locked) == 1 {
			blockers, err := tx.GetAccountDeletionBlockers(ctx, userID)
			if err != nil {
				return err
			}
			if len(blockers) > 0 {
				// Not retryable: the user has to resolve these first.
				return tx.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{
					ID: purgeID, Status: AccountPurgeFailed,
					Error: "Your account can't be deleted until these are resolved: " + strings.Join(blockers, ", ") + ".",
				})
			}
			if err := tx.DeleteUserAuthSessionsByUserID(ctx, userID); err != nil {
				return err
			}
			if err := tx.DeleteUserAuthLinksByUserID(ctx, userID); err != nil {
				return err
			}
			if err := tx.DeleteUserRelationships(ctx, userID); err != nil {
				return err
			}
			if _, err := tx.DeleteUserAccountRow(ctx, userID); err != nil {
				return fmt.Errorf("delete user: %w", err)
			}
		}
		return tx.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{
			ID: purgeID, Status: AccountPurgeSucceeded,
		})
	}, nil)
}
