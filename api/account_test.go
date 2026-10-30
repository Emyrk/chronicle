package api

import (
	"testing"

	"github.com/Emyrk/chronicle/database"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAccountMergeDiscordLink(t *testing.T) {
	t.Parallel()

	request := database.AccountMergeRequest{DiscordID: "discord-id"}
	discord := database.UserAuthLink{ID: uuid.New(), Provider: "discord", LinkedID: request.DiscordID}

	tests := []struct {
		name  string
		links []database.UserAuthLink
		ok    bool
	}{
		{name: "discord only", links: []database.UserAuthLink{discord}, ok: true},
		{name: "missing", links: nil},
		{name: "wrong identity", links: []database.UserAuthLink{{Provider: "discord", LinkedID: "other"}}},
		{name: "password only", links: []database.UserAuthLink{{Provider: "password", LinkedID: "user@example.com"}}},
		{name: "additional password", links: []database.UserAuthLink{discord, {Provider: "password", LinkedID: "user@example.com"}}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			link, ok := accountMergeDiscordLink(request, test.links)
			require.Equal(t, test.ok, ok)
			if test.ok {
				require.Equal(t, discord.ID, link.ID)
			}
		})
	}
}
