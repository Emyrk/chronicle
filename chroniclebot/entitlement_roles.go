package chroniclebot

import (
	"context"
	"errors"
	"fmt"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/internal/paidtier"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
		if id == boosterRoleID || id == supporterRoleID {
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

// EnqueueEntitlementRoleSync reuses the existing Discord user sync job.
// The job reads current billing state when it runs, not when it is queued.
func (b *Bot) EnqueueEntitlementRoleSync(ctx context.Context, userID uuid.UUID) error {
	if !b.tierRolesEnabled() || b.queue == nil || userID == uuid.Nil {
		return nil
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
	_, err = b.queue.Insert(ctx, ArgsSyncDiscordUser{DiscordID: link.LinkedID, UniqueString: "billing"}, nil)
	return err
}

// syncEntitlementRoles uses the member already fetched by SyncDiscordUser.
// Failures are best-effort and must not affect Discord membership grants.
func (b *Bot) syncEntitlementRoles(ctx context.Context, discordID string, userID uuid.UUID, memberRoles []string) error {
	if !b.tierRolesEnabled() {
		return nil
	}
	entitlements, err := b.config.DB.ListBillingEntitlementsByUserID(ctx, userID)
	if err != nil {
		return fmt.Errorf("list billing entitlements: %w", err)
	}
	remove, add := tierRoleDiff(b.config, memberRoles, paidtier.Effective(entitlements))
	for _, roleID := range remove {
		if err := b.session.GuildMemberRoleRemove(b.config.GuildID, discordID, roleID); err != nil {
			return fmt.Errorf("remove Discord tier role %s: %w", roleID, err)
		}
	}
	if add != "" {
		if err := b.session.GuildMemberRoleAdd(b.config.GuildID, discordID, add); err != nil {
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
