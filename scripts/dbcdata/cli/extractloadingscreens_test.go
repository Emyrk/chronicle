package cli

import "testing"

func TestWebPOutputName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		blpPath string
		want    string
	}{
		{
			name:    "talent background Windows path",
			blpPath: `Interface\TalentFrame\HunterBeastMastery-BottomLeft.blp`,
			want:    "hunterbeastmastery-bottomleft.webp",
		},
		{
			name:    "loading screen Windows path",
			blpPath: `Interface\Glues\LoadingScreens\LoadScreenKalimdor.blp`,
			want:    "loadscreenkalimdor.webp",
		},
		{
			name:    "forward slash path",
			blpPath: "Interface/TalentFrame/MageFire-TopLeft.BLP",
			want:    "magefire-topleft.webp",
		},
		{
			name:    "bare filename",
			blpPath: "WarriorArms.blp",
			want:    "warriorarms.webp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := webpOutputName(tt.blpPath); got != tt.want {
				t.Errorf("webpOutputName(%q) = %q, want %q", tt.blpPath, got, tt.want)
			}
		})
	}
}
