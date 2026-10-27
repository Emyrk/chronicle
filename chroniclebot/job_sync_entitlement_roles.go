package chroniclebot

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/paidtier"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

const KindSyncEntitlementRoles = "discord-sync-entitlement-roles"

type ArgsSyncEntitlementRoles struct {
	UserID uuid.UUID `json:"user_id"`
}

func (ArgsSyncEntitlementRoles) Kind() string { return KindSyncEntitlementRoles }
func (ArgsSyncEntitlementRoles) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       river.QueueDefault,
		MaxAttempts: 5,
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{
			rivertype.JobStateScheduled, rivertype.JobStatePending,
			rivertype.JobStateAvailable, rivertype.JobStateRetryable,
		}},
	}
}

const KindDispatchEntitlementRoleAudits = "discord-dispatch-entitlement-role-audits"

type ArgsDispatchEntitlementRoleAudits struct{}

func (ArgsDispatchEntitlementRoleAudits) Kind() string { return KindDispatchEntitlementRoleAudits }
func (ArgsDispatchEntitlementRoleAudits) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: river.QueueDefault, MaxAttempts: 3, UniqueOpts: river.UniqueOpts{ByState: []rivertype.JobState{
		rivertype.JobStateScheduled, rivertype.JobStatePending,
		rivertype.JobStateAvailable, rivertype.JobStateRunning, rivertype.JobStateRetryable,
	}}}
}

type WorkerDispatchEntitlementRoleAudits struct {
	river.WorkerDefaults[ArgsDispatchEntitlementRoleAudits]
	bot *Bot
}

func (b *Bot) NewWorkerDispatchEntitlementRoleAudits() river.Worker[ArgsDispatchEntitlementRoleAudits] {
	return &WorkerDispatchEntitlementRoleAudits{bot: b}
}

// Include canceled subscriptions so a missed revocation can be repaired.
func (w *WorkerDispatchEntitlementRoleAudits) Work(ctx context.Context, _ *river.Job[ArgsDispatchEntitlementRoleAudits]) error {
	if !w.bot.tierRolesEnabled() {
		return nil
	}
	rows, err := w.bot.config.DB.ListBillingSubscriptionsForReconciliation(ctx)
	if err != nil {
		return fmt.Errorf("list subscribers for Discord role audit: %w", err)
	}
	seen := make(map[uuid.UUID]bool, len(rows))
	for _, row := range rows {
		if row.UserID == uuid.Nil || seen[row.UserID] {
			continue
		}
		seen[row.UserID] = true
		if err := w.bot.EnqueueEntitlementRoleSync(ctx, row.UserID); err != nil {
			return fmt.Errorf("enqueue Discord role audit for user %s: %w", row.UserID, err)
		}
	}
	return nil
}

func validateTierRoleConfig(config Config) error {
	ids := []string{config.HonoredRoleID, config.ReveredRoleID, config.ExaltedRoleID}
	if ids[0] == "" && ids[1] == "" && ids[2] == "" {
		return nil
	}
	if config.GuildID == "" || ids[0] == "" || ids[1] == "" || ids[2] == "" {
		return fmt.Errorf("discord tier roles require a guild ID and all three role IDs")
	}
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if id == "1476428881677389865" || id == "1476558127552790812" {
			return fmt.Errorf("discord tier roles must not use the Booster or Supporter role")
		}
		if seen[id] {
			return fmt.Errorf("discord tier role IDs must be distinct")
		}
		seen[id] = true
	}
	return nil
}

func (b *Bot) tierRolesEnabled() bool {
	return b != nil && !b.disabled && b.session != nil && b.config.GuildID != "" && b.config.HonoredRoleID != ""
}

// EnqueueEntitlementRoleSync is safe to call after a billing change, login,
// or Discord membership event. No Discord request occurs until the job runs.
func (b *Bot) EnqueueEntitlementRoleSync(ctx context.Context, userID uuid.UUID) error {
	if !b.tierRolesEnabled() || b.queue == nil || userID == uuid.Nil {
		return nil
	}
	_, err := b.queue.Insert(ctx, ArgsSyncEntitlementRoles{UserID: userID}, nil)
	return err
}

type WorkerSyncEntitlementRoles struct {
	river.WorkerDefaults[ArgsSyncEntitlementRoles]
	bot *Bot
}

func (b *Bot) NewWorkerSyncEntitlementRoles() river.Worker[ArgsSyncEntitlementRoles] {
	return &WorkerSyncEntitlementRoles{bot: b}
}

func (w *WorkerSyncEntitlementRoles) Work(ctx context.Context, job *river.Job[ArgsSyncEntitlementRoles]) error {
	return w.bot.SyncEntitlementRoles(ctx, job.Args.UserID)
}

// SyncEntitlementRoles only manages configured paid-tier role IDs in the
// Chronicle guild. It reads current entitlements so delayed jobs cannot grant
// a role from an obsolete Stripe event.
func (b *Bot) SyncEntitlementRoles(ctx context.Context, userID uuid.UUID) error {
	if !b.tierRolesEnabled() {
		return nil
	}
	if userID == uuid.Nil {
		return fmt.Errorf("sync Discord tier roles: missing user ID")
	}
	link, err := b.config.DB.GetUserAuthLinkByUserIDAndProvider(ctx, database.GetUserAuthLinkByUserIDAndProviderParams{
		UserID: userID, Provider: "discord",
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("get linked Discord account: %w", err)
	}
	entitlements, err := b.config.DB.ListBillingEntitlementsByUserID(ctx, userID)
	if err != nil {
		return fmt.Errorf("list billing entitlements: %w", err)
	}
	member, err := b.GetGuildMember(b.config.GuildID, link.LinkedID)
	if err != nil {
		return err
	}
	if member == nil {
		return nil
	}
	remove, add := tierRoleDiff(b.config, member.Roles, paidtier.Effective(entitlements))
	for _, roleID := range remove {
		if err := b.session.GuildMemberRoleRemove(b.config.GuildID, link.LinkedID, roleID); err != nil {
			return fmt.Errorf("remove Discord tier role %s: %w", roleID, err)
		}
	}
	if add != "" {
		if err := b.session.GuildMemberRoleAdd(b.config.GuildID, link.LinkedID, add); err != nil {
			return fmt.Errorf("add Discord tier role %s: %w", add, err)
		}
	}
	return nil
}

func tierRoleDiff(config Config, present []string, tier string) (remove []string, add string) {
	ids := []string{config.HonoredRoleID, config.ReveredRoleID, config.ExaltedRoleID}
	wanted := ""
	switch tier {
	case paidtier.Honored:
		wanted = config.HonoredRoleID
	case paidtier.Revered:
		wanted = config.ReveredRoleID
	case paidtier.Exalted:
		wanted = config.ExaltedRoleID
	}
	for _, id := range ids {
		found := false
		for _, current := range present {
			if current == id {
				found = true
				break
			}
		}
		if id == wanted {
			if !found {
				add = id
			}
		} else if found {
			remove = append(remove, id)
		}
	}
	return remove, add
}
