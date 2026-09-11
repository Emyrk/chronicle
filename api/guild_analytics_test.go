package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"
)

func TestTrackableInstanceResource(t *testing.T) {
	t.Parallel()

	guildID := uuid.New()
	tests := []struct {
		name     string
		instance database.LogInstancesGuild
		wantOK   bool
	}{
		{
			name: "stable guild instance",
			instance: database.LogInstancesGuild{
				GuildID:    uuid.NullUUID{UUID: guildID, Valid: true},
				HashedSlug: pgtype.Text{String: "stable-slug", Valid: true},
			},
			wantOK: true,
		},
		{
			name: "slugless instance is skipped",
			instance: database.LogInstancesGuild{
				GuildID: uuid.NullUUID{UUID: guildID, Valid: true},
			},
		},
		{
			name: "unguilded instance is skipped",
			instance: database.LogInstancesGuild{
				HashedSlug: pgtype.Text{String: "stable-slug", Valid: true},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			gotGuildID, gotKey, gotOK := trackableInstanceResource(test.instance)
			require.Equal(t, test.wantOK, gotOK)
			if test.wantOK {
				require.Equal(t, guildID, gotGuildID)
				require.Equal(t, "stable-slug", gotKey)
			} else {
				require.Equal(t, uuid.Nil, gotGuildID)
				require.Empty(t, gotKey)
			}
		})
	}
}
