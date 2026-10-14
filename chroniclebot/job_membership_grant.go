package chroniclebot

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"hash/fnv"
	"log/slog"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/chronicle/riverqueue/riverconst"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const (
	KindDispatchDiscordMembershipGrantChecks = "dispatch-discord-membership-grant-checks"
	KindCheckDiscordMembershipGrant          = "check-discord-membership-grant"

	defaultDiscordMembershipClaimLimit = 100
	maxDiscordMembershipClaimLimit     = 500
	discordMembershipErrorLimit        = 2048
)

type ArgsDispatchDiscordMembershipGrantChecks struct{}

func (ArgsDispatchDiscordMembershipGrantChecks) Kind() string {
	return KindDispatchDiscordMembershipGrantChecks
}

func (ArgsDispatchDiscordMembershipGrantChecks) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 3,
		UniqueOpts: river.UniqueOpts{
			ByState: activeJobStates(),
		},
	}
}

type ArgsCheckDiscordMembershipGrant struct {
	UserID     uuid.UUID `json:"user_id" river:"unique"`
	ClaimToken uuid.UUID `json:"claim_token" river:"unique"`
}

func (ArgsCheckDiscordMembershipGrant) Kind() string { return KindCheckDiscordMembershipGrant }

func (ArgsCheckDiscordMembershipGrant) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       riverconst.QueueDiscordSync,
		Priority:    riverconst.PriorityLow,
		MaxAttempts: 1,
		UniqueOpts: river.UniqueOpts{
			ByArgs:  true,
			ByState: activeJobStates(),
		},
	}
}

func activeJobStates() []rivertype.JobState {
	return []rivertype.JobState{
		rivertype.JobStateScheduled,
		rivertype.JobStatePending,
		rivertype.JobStateAvailable,
		rivertype.JobStateRunning,
		rivertype.JobStateRetryable,
	}
}

type WorkerDispatchDiscordMembershipGrantChecks struct {
	river.WorkerDefaults[ArgsDispatchDiscordMembershipGrantChecks]
	bot *Bot
}

func (b *Bot) NewWorkerDispatchDiscordMembershipGrantChecks() river.Worker[ArgsDispatchDiscordMembershipGrantChecks] {
	return &WorkerDispatchDiscordMembershipGrantChecks{bot: b}
}

func (w *WorkerDispatchDiscordMembershipGrantChecks) Work(ctx context.Context, _ *river.Job[ArgsDispatchDiscordMembershipGrantChecks]) error {
	if w.bot.disabled || w.bot.queue == nil {
		return nil
	}

	now := time.Now().UTC()
	if _, err := w.bot.config.DB.RepairDiscordMembershipGrantChecks(ctx, database.RepairDiscordMembershipGrantChecksParams{
		CheckTime:  database.Timestamptz(now),
		LimitCount: 10,
	}); err != nil {
		return fmt.Errorf("repair discord membership grant checks: %w", err)
	}

	var claimed int
	var oldestDue time.Time
	err := w.bot.config.DB.InTx(ctx, func(tx database.Store) error {
		rows, err := tx.ClaimDueDiscordMembershipGrantChecks(ctx, database.ClaimDueDiscordMembershipGrantChecksParams{
			CheckTime:  database.Timestamptz(now),
			LimitCount: w.bot.membershipGrantClaimLimit(),
		})
		if err != nil {
			return fmt.Errorf("claim due discord membership grant checks: %w", err)
		}
		if len(rows) == 0 {
			return nil
		}

		pgxTx, ok := database.PGXTx(tx)
		if !ok {
			return fmt.Errorf("discord membership dispatcher requires a pgx transaction")
		}

		params := make([]river.InsertManyParams, 0, len(rows))
		for _, row := range rows {
			if !row.ClaimToken.Valid {
				return fmt.Errorf("claimed discord membership check without claim token")
			}
			if oldestDue.IsZero() || row.NextCheckAt.Time.Before(oldestDue) {
				oldestDue = row.NextCheckAt.Time
			}
			scheduledAt := now.Add(discordMembershipJitter(row.UserID, row.NextCheckAt.Time))
			opts := ArgsCheckDiscordMembershipGrant{}.InsertOpts()
			opts.ScheduledAt = scheduledAt
			params = append(params, river.InsertManyParams{
				Args: ArgsCheckDiscordMembershipGrant{
					UserID:     row.UserID,
					ClaimToken: row.ClaimToken.UUID,
				},
				InsertOpts: &opts,
			})
		}

		if _, err := w.bot.queue.InsertManyTx(ctx, pgxTx, params); err != nil {
			return fmt.Errorf("insert discord membership check jobs: %w", err)
		}
		claimed = len(rows)
		return nil
	}, nil)
	if err != nil {
		return err
	}

	output := map[string]any{"claimed": claimed}
	if !oldestDue.IsZero() {
		output["oldest_due_at"] = oldestDue
	}
	if err := river.RecordOutput(ctx, output); err != nil {
		w.bot.logger.Warn("record discord membership dispatcher output", slog.String("error", err.Error()))
	}
	return nil
}

func (b *Bot) membershipGrantClaimLimit() int32 {
	limit := b.config.MembershipGrantChecksPerHour
	if limit <= 0 {
		return defaultDiscordMembershipClaimLimit
	}
	if limit > maxDiscordMembershipClaimLimit {
		return maxDiscordMembershipClaimLimit
	}
	return int32(limit)
}

func discordMembershipJitter(userID uuid.UUID, dueAt time.Time) time.Duration {
	h := fnv.New64a()
	_, _ = h.Write(userID[:])
	_, _ = h.Write([]byte(dueAt.UTC().Format(time.RFC3339Nano)))
	return time.Duration(h.Sum64() % uint64(55*time.Minute))
}

type WorkerCheckDiscordMembershipGrant struct {
	river.WorkerDefaults[ArgsCheckDiscordMembershipGrant]
	bot *Bot
}

func (b *Bot) NewWorkerCheckDiscordMembershipGrant() river.Worker[ArgsCheckDiscordMembershipGrant] {
	return &WorkerCheckDiscordMembershipGrant{bot: b}
}

func (w *WorkerCheckDiscordMembershipGrant) Work(ctx context.Context, job *river.Job[ArgsCheckDiscordMembershipGrant]) error {
	if w.bot.disabled {
		return nil
	}

	now := time.Now().UTC()
	claimToken := uuid.NullUUID{UUID: job.Args.ClaimToken, Valid: true}
	_, err := w.bot.config.DB.GetDiscordMembershipGrantCheckClaim(ctx, database.GetDiscordMembershipGrantCheckClaimParams{
		UserID:     job.Args.UserID,
		ClaimToken: claimToken,
		CheckTime:  database.Timestamptz(now),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("validate discord membership grant claim: %w", err)
	}

	link, err := w.bot.config.DB.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID:   job.Args.UserID,
		Provider: "discord",
	})
	if errors.Is(err, sql.ErrNoRows) {
		if err := w.bot.config.DB.DeleteDiscordMembershipGrantCheck(ctx, job.Args.UserID); err != nil {
			return fmt.Errorf("delete unlinked discord membership check: %w", err)
		}
		return nil
	}
	if err != nil {
		return fmt.Errorf("load discord auth link: %w", err)
	}

	member, fetchErr := w.bot.GetGuildMember(w.bot.ChronicleGuildID(), link.LinkedID)
	if fetchErr != nil {
		safeError := sanitizeMembershipError(fetchErr)
		_, err := w.bot.config.DB.CompleteDiscordMembershipGrantCheckError(ctx, database.CompleteDiscordMembershipGrantCheckErrorParams{
			CheckedAt:  database.Timestamptz(now),
			LastError:  pgtype.Text{String: safeError, Valid: true},
			UserID:     job.Args.UserID,
			ClaimToken: claimToken,
		})
		if err != nil {
			return fmt.Errorf("record discord membership check error: %w", err)
		}
		_ = river.RecordOutput(ctx, map[string]any{"outcome": "error", "error": safeError})
		return nil
	}

	if member == nil {
		_, err := w.bot.config.DB.CompleteDiscordMembershipGrantCheckNonMember(ctx, database.CompleteDiscordMembershipGrantCheckNonMemberParams{
			CheckedAt:  database.Timestamptz(now),
			UserID:     job.Args.UserID,
			ClaimToken: claimToken,
		})
		if err != nil {
			return fmt.Errorf("record discord non-member check: %w", err)
		}
		_ = river.RecordOutput(ctx, map[string]any{"outcome": "non_member"})
		return nil
	}

	err = w.bot.config.DB.InTx(ctx, func(tx database.Store) error {
		if _, err := tx.CompleteDiscordMembershipGrantCheckMember(ctx, database.CompleteDiscordMembershipGrantCheckMemberParams{
			CheckedAt:  database.Timestamptz(now),
			UserID:     job.Args.UserID,
			ClaimToken: claimToken,
		}); err != nil {
			return fmt.Errorf("complete discord member check: %w", err)
		}
		if _, err := tx.UpsertDataGrant(ctx, storagegrants.DiscordMemberStorageGrant(job.Args.UserID, now)); err != nil {
			return fmt.Errorf("upsert discord membership storage grant: %w", err)
		}
		return nil
	}, nil)
	if err != nil {
		return err
	}
	_ = river.RecordOutput(ctx, map[string]any{"outcome": "member"})
	return nil
}

// ReactivateMembershipGrantCheckOnLogin resumes a check that was suspended by
// an earlier Discord error. New Discord-linked users are also claimed for an
// immediate first check. Enqueue failures leave the row suspended so a later
// login can try again.
func (b *Bot) ReactivateMembershipGrantCheckOnLogin(ctx context.Context, userID uuid.UUID) error {
	if b.disabled || b.queue == nil {
		return nil
	}

	now := time.Now().UTC()
	claim, err := b.config.DB.ActivateDiscordMembershipGrantCheckOnLogin(ctx, database.ActivateDiscordMembershipGrantCheckOnLoginParams{
		UserID:    userID,
		CheckTime: database.Timestamptz(now),
	})
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("activate discord membership grant check: %w", err)
	}
	if !claim.ClaimToken.Valid {
		return fmt.Errorf("activated discord membership check without claim token")
	}

	_, err = b.queue.Insert(ctx, ArgsCheckDiscordMembershipGrant{
		UserID:     userID,
		ClaimToken: claim.ClaimToken.UUID,
	}, nil)
	if err == nil {
		return nil
	}

	safeError := sanitizeMembershipError(fmt.Errorf("enqueue after login: %w", err))
	_, persistErr := b.config.DB.CompleteDiscordMembershipGrantCheckError(ctx, database.CompleteDiscordMembershipGrantCheckErrorParams{
		CheckedAt:  database.Timestamptz(now),
		LastError:  pgtype.Text{String: safeError, Valid: true},
		UserID:     userID,
		ClaimToken: claim.ClaimToken,
	})
	if persistErr != nil {
		return fmt.Errorf("enqueue discord membership check: %w; restore suspension: %v", err, persistErr)
	}
	return fmt.Errorf("enqueue discord membership check: %w", err)
}

func sanitizeMembershipError(err error) string {
	message := strings.TrimSpace(err.Error())
	if len(message) > discordMembershipErrorLimit {
		message = message[:discordMembershipErrorLimit]
	}
	return message
}
