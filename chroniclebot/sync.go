package chroniclebot

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/storagegrants"
	"github.com/authzed/gochugaru/rel"
	"github.com/bwmarrin/discordgo"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

var ErrMustJoinDiscordServer = errors.New("must be in the discord server to use chronicle")

const protectedTechnicalAdminDiscordID = "221411580535898113"

func ensureProtectedTechnicalAdmin(ctx context.Context, zed authz.Authorizer, discordID string, userID uuid.UUID) error {
	if discordID != protectedTechnicalAdminDiscordID {
		return nil
	}

	b := policy.New()
	b.GlobalChronicle().Technical_admin(b.User(userID))
	if _, err := zed.Write(ctx, *b.Txn()); err != nil {
		return fmt.Errorf("write protected technical_admin: %w", err)
	}
	return nil
}

type discordSyncAuthorizer interface {
	authz.DatabaseAuthorizer
	UserChronicleRoles(ctx context.Context, user uuid.UUID) ([]string, error)
}

// SyncDiscordUser reconciles Discord membership into SpiceDB, then derives the
// user's Discord membership storage grant from the resulting SpiceDB role.
func (bot *Bot) SyncDiscordUser(ctx context.Context, zed discordSyncAuthorizer, discordID string, userID uuid.UUID) error {
	return bot.syncDiscordUser(ctx, zed, discordID, userID, uuid.NullUUID{})
}

func (bot *Bot) syncDiscordUser(
	ctx context.Context,
	zed discordSyncAuthorizer,
	discordID string,
	userID uuid.UUID,
	claimToken uuid.NullUUID,
) error {
	if bot.disabled {
		return nil
	}

	if err := ensureProtectedTechnicalAdmin(ctx, zed, discordID, userID); err != nil {
		return err
	}

	checkedAt := time.Now().UTC()
	member, err := bot.GetGuildMember(bot.ChronicleGuildID(), discordID)
	if err != nil {
		return bot.recordDiscordMembershipError(ctx, userID, claimToken, checkedAt, err)
	}

	return bot.reconcileDiscordMembership(ctx, zed, userID, checkedAt, member, claimToken)
}

func (bot *Bot) reconcileDiscordMembership(
	ctx context.Context,
	zed discordSyncAuthorizer,
	userID uuid.UUID,
	checkedAt time.Time,
	member *discordgo.Member,
	claimToken uuid.NullUUID,
) error {
	memberFilter := rel.NewFilter("chronicle", "chronicle", "chronicle_guild_member")
	memberFilter.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(memberFilter)); err != nil {
		return fmt.Errorf("delete chronicle_guild_member: %w", err)
	}

	if member != nil {
		b := policy.New()
		b.GlobalChronicle().Chronicle_guild_member(b.User(userID))
		if _, err := zed.Write(ctx, *b.Txn()); err != nil {
			return fmt.Errorf("write chronicle_guild_member: %w", err)
		}
	}

	supporterFilter := rel.NewFilter("chronicle", "chronicle", "supporter")
	supporterFilter.WithSubjectFilter("user", userID.String(), "")
	if err := zed.Delete(ctx, rel.NewPreconditionedFilter(supporterFilter)); err != nil {
		return fmt.Errorf("delete supporter: %w", err)
	}

	if member != nil {
		for _, roleID := range member.Roles {
			if roleID == "1476428881677389865" || // Booster
				roleID == "1476558127552790812" { // Supporter
				b := policy.New()
				b.GlobalChronicle().Supporter(b.User(userID))
				if _, err := zed.Write(ctx, *b.Txn()); err != nil {
					return fmt.Errorf("write supporter: %w", err)
				}
				if _, err := zed.UpsertDataGrant(ctx, storagegrants.SupportStorageGrant(userID)); err != nil {
					bot.logger.Error("upsert supporter storage grant", slog.String("error", err.Error()))
				}
				break
			}
		}
	}

	roles, err := zed.UserChronicleRoles(ctx, userID)
	if err != nil {
		return fmt.Errorf("read chronicle roles after discord sync: %w", err)
	}
	isMember := slices.Contains(roles, "chronicle_guild_member")

	return bot.persistDiscordMembership(ctx, userID, checkedAt, isMember, claimToken)
}

var errStaleDiscordMembershipClaim = errors.New("stale discord membership claim")

func (bot *Bot) persistDiscordMembership(
	ctx context.Context,
	userID uuid.UUID,
	checkedAt time.Time,
	isMember bool,
	claimToken uuid.NullUUID,
) error {
	err := bot.config.DB.InTx(ctx, func(tx database.Store) error {
		if isMember {
			if claimToken.Valid {
				if _, err := tx.CompleteDiscordMembershipGrantCheckMember(ctx, database.CompleteDiscordMembershipGrantCheckMemberParams{
					CheckedAt:  database.Timestamptz(checkedAt),
					UserID:     userID,
					ClaimToken: claimToken,
				}); err != nil {
					if errors.Is(err, sql.ErrNoRows) {
						return errStaleDiscordMembershipClaim
					}
					return fmt.Errorf("complete discord member check: %w", err)
				}
			} else if _, err := tx.UpsertDiscordMembershipGrantCheckMember(ctx, database.UpsertDiscordMembershipGrantCheckMemberParams{
				UserID:    userID,
				CheckedAt: database.Timestamptz(checkedAt),
			}); err != nil {
				return fmt.Errorf("record discord member check: %w", err)
			}

			if _, err := tx.UpsertDataGrant(ctx, storagegrants.DiscordMemberStorageGrant(userID, checkedAt)); err != nil {
				return fmt.Errorf("upsert discord member storage grant: %w", err)
			}
			return nil
		}

		if claimToken.Valid {
			if _, err := tx.CompleteDiscordMembershipGrantCheckNonMember(ctx, database.CompleteDiscordMembershipGrantCheckNonMemberParams{
				CheckedAt:  database.Timestamptz(checkedAt),
				UserID:     userID,
				ClaimToken: claimToken,
			}); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return errStaleDiscordMembershipClaim
				}
				return fmt.Errorf("complete discord non-member check: %w", err)
			}
		} else if _, err := tx.UpsertDiscordMembershipGrantCheckNonMember(ctx, database.UpsertDiscordMembershipGrantCheckNonMemberParams{
			UserID:    userID,
			CheckedAt: database.Timestamptz(checkedAt),
		}); err != nil {
			return fmt.Errorf("record discord non-member check: %w", err)
		}

		if err := tx.DeleteDataGrant(ctx, database.DeleteDataGrantParams{
			UserID: userID,
			Source: storagegrants.DiscordMemberSource,
		}); err != nil {
			return fmt.Errorf("delete discord member storage grant: %w", err)
		}
		return nil
	}, nil)
	if errors.Is(err, errStaleDiscordMembershipClaim) {
		return nil
	}
	return err
}

func (bot *Bot) recordDiscordMembershipError(
	ctx context.Context,
	userID uuid.UUID,
	claimToken uuid.NullUUID,
	checkedAt time.Time,
	fetchErr error,
) error {
	safeError := sanitizeMembershipError(fetchErr)
	if claimToken.Valid {
		if _, err := bot.config.DB.CompleteDiscordMembershipGrantCheckError(ctx, database.CompleteDiscordMembershipGrantCheckErrorParams{
			CheckedAt:  database.Timestamptz(checkedAt),
			LastError:  pgtype.Text{String: safeError, Valid: true},
			UserID:     userID,
			ClaimToken: claimToken,
		}); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return fmt.Errorf("record claimed guild member fetch error: %w", err)
		}
	} else if _, err := bot.config.DB.UpsertDiscordMembershipGrantCheckError(ctx, database.UpsertDiscordMembershipGrantCheckErrorParams{
		UserID:    userID,
		CheckedAt: database.Timestamptz(checkedAt),
		LastError: pgtype.Text{String: safeError, Valid: true},
	}); err != nil {
		return fmt.Errorf("record guild member fetch error: %w", err)
	}

	bot.logger.Warn("discord membership sync suspended until next login",
		slog.String("user_id", userID.String()),
		slog.String("error", safeError),
	)
	return nil
}
