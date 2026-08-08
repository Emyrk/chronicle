package db2sdk

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestUser(t *testing.T) {
	t.Parallel()

	user := database.ChronicleUser{
		Username: "User",
		Email:    "user@example.com",
	}

	t.Run("chronicle user", func(t *testing.T) {
		t.Parallel()

		converted := User(user, []string{"user"})
		require.Empty(t, converted.DiscordID)
	})

	t.Run("admin list row", func(t *testing.T) {
		t.Parallel()

		converted := User(database.ListAllUsersRow{
			ChronicleUser: user,
			DiscordID:     "123456789",
		}, []string{"user"})
		require.Equal(t, "123456789", converted.DiscordID)
	})
}
