package storagegrants

import (
	"time"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	DiscordMemberSource       = "discord-member"
	DiscordMemberStorageBytes = 75_000_000
)

const DiscordMemberGrantDuration = 14 * 24 * time.Hour

func DiscordMemberStorageGrant(user uuid.UUID, checkedAt time.Time) database.UpsertDataGrantParams {
	return database.UpsertDataGrantParams{
		UserID:       user,
		Source:       DiscordMemberSource,
		StorageBytes: DiscordMemberStorageBytes,
		Description: pgtype.Text{
			String: "Discord server membership",
			Valid:  true,
		},
		ExpiresAt: database.Timestamptz(checkedAt.Add(DiscordMemberGrantDuration)),
	}
}

func SupportStorageGrant(user uuid.UUID) database.UpsertDataGrantParams {
	return database.UpsertDataGrantParams{
		UserID:       user,
		Source:       "support",
		StorageBytes: 1024 * 1024 * 1024, // 1 GiB MB
		Description: pgtype.Text{
			String: "Thank you for financially supporting Chronicle! This grant will automatically renew every 30 days as long as you remain a supporter.",
			Valid:  true,
		},
		ExpiresAt: database.Timestamptz(time.Now().Add(time.Hour * 24 * 30)), // 30 days
	}
}
