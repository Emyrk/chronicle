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
	// notify reports a finished purge to administrators. Optional.
	notify func(context.Context, AccountPurgeNotification) error
}

// AccountPurgeNotification describes a purge that just finished. User details
// are read before anything is deleted.
type AccountPurgeNotification struct {
	PurgeID     uuid.UUID
	UserID      uuid.UUID
	Username    string
	Email       string
	Status      string
	LogsDeleted int32
	Error       string
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

func (c *Chronicle) NewWorkerAccountPurge(
	leaveDiscordGuild func(discordGuildID string) error,
	notify func(context.Context, AccountPurgeNotification) error,
) river.Worker[ArgsAccountPurge] {
	return &WorkerAccountPurge{parent: c, leaveDiscordGuild: leaveDiscordGuild, notify: notify}
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
	purgeID := job.Args.PurgeID
	notification := w.newNotification(ctx, purgeID)
	finished, err := w.purge(ctx, purgeID)
	if err == nil {
		if finished {
			w.sendNotification(ctx, notification)
		}
		return nil
	}
	slog.ErrorContext(ctx, "account purge failed", slog.String("purge_id", purgeID.String()), slog.Int("attempt", job.Attempt), slog.Any("error", err))
	if job.Attempt >= job.MaxAttempts {
		if finishErr := w.parent.Zed.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{
			ID: purgeID, Status: AccountPurgeFailed, Error: accountPurgeFailedMessage,
		}); finishErr != nil {
			return errors.Join(err, finishErr)
		}
		notification.Error = err.Error()
		w.sendNotification(ctx, notification)
	}
	return err
}

// newNotification captures who is being purged while the user still exists.
func (w *WorkerAccountPurge) newNotification(ctx context.Context, purgeID uuid.UUID) AccountPurgeNotification {
	notification := AccountPurgeNotification{PurgeID: purgeID}
	if w.notify == nil {
		return notification
	}
	purge, err := w.parent.Zed.GetAccountPurge(ctx, purgeID)
	if err != nil {
		return notification
	}
	notification.UserID = purge.UserID
	if user, err := w.parent.Zed.GetUserByID(ctx, purge.UserID); err == nil {
		notification.Username = user.Username
		notification.Email = user.Email
	}
	return notification
}

// sendNotification fills in the purge outcome and reports it. Failing to
// notify never fails the purge.
func (w *WorkerAccountPurge) sendNotification(ctx context.Context, notification AccountPurgeNotification) {
	if w.notify == nil {
		return
	}
	if purge, err := w.parent.Zed.GetAccountPurge(ctx, notification.PurgeID); err == nil {
		notification.Status = purge.Status
		notification.LogsDeleted = purge.LogsDeleted
		if notification.Error == "" {
			notification.Error = purge.Error
		}
	}
	if err := w.notify(ctx, notification); err != nil {
		slog.WarnContext(ctx, "failed to notify admins about account purge", slog.String("purge_id", notification.PurgeID.String()), slog.Any("error", err))
	}
}

// purge runs the purge and reports whether it finished, successfully or as a
// failure the user must resolve, during this call.
func (w *WorkerAccountPurge) purge(ctx context.Context, purgeID uuid.UUID) (bool, error) {
	purge, err := w.parent.Zed.GetAccountPurge(ctx, purgeID)
	if err != nil {
		return false, fmt.Errorf("get account purge: %w", err)
	}
	if purge.Status == AccountPurgeSucceeded || purge.Status == AccountPurgeFailed {
		return false, nil
	}
	if err := w.runPurge(ctx, purge); err != nil {
		return false, err
	}
	return true, nil
}

func (w *WorkerAccountPurge) runPurge(ctx context.Context, purge database.AccountPurge) error {
	db := w.parent.Zed
	purgeID := purge.ID
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
	// Servers, realms, and upload keys stay; only the creator is cleared.
	if err := db.ClearServersCreatedByUser(ctx, userID); err != nil {
		return fmt.Errorf("clear server creator: %w", err)
	}
	if err := db.ClearRealmsCreatedByUser(ctx, userID); err != nil {
		return fmt.Errorf("clear realm creator: %w", err)
	}
	if err := db.ClearUploadKeysCreatedByUser(ctx, userID); err != nil {
		return fmt.Errorf("clear upload key creator: %w", err)
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
	deleted := false
	err = db.InTx(ctx, func(tx *authz.AuthzTX) error {
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
			rowsDeleted, err := tx.DeleteUserAccountRow(ctx, userID)
			if err != nil {
				return fmt.Errorf("delete user: %w", err)
			}
			deleted = rowsDeleted > 0
		}
		return tx.FinishAccountPurge(ctx, database.FinishAccountPurgeParams{
			ID: purgeID, Status: AccountPurgeSucceeded,
		})
	}, nil)
	if err != nil {
		return err
	}
	if deleted {
		w.parent.accountMetrics.observeDeletion()
	}
	return nil
}
