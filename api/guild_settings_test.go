package api

import "testing"

func TestValidDiscordAnnouncementScope(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		scope string
		valid bool
	}{
		{name: "raids only", scope: discordAnnouncementScopeRaidsOnly, valid: true},
		{name: "dungeons only", scope: discordAnnouncementScopeDungeonsOnly, valid: true},
		{name: "all", scope: discordAnnouncementScopeAll, valid: true},
		{name: "empty", scope: "", valid: false},
		{name: "unknown", scope: "battlegrounds", valid: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if got := validDiscordAnnouncementScope(test.scope); got != test.valid {
				t.Fatalf("validDiscordAnnouncementScope(%q) = %t, want %t", test.scope, got, test.valid)
			}
		})
	}
}
