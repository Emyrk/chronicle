package cli

import "testing"

func TestIconFileNames(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		texture     string
		wantOutName string
		wantBLPPath string
		wantOK      bool
	}{
		{
			name:        "bare item inventory icon",
			texture:     "INV_Jewelcrafting_Gem_37",
			wantOutName: "inv_jewelcrafting_gem_37.blp",
			wantBLPPath: `Interface\Icons\INV_Jewelcrafting_Gem_37.blp`,
			wantOK:      true,
		},
		{
			name:        "prefixed spell icon",
			texture:     `interface\icons\Ability_Warrior_Warbringer`,
			wantOutName: "ability_warrior_warbringer.blp",
			wantBLPPath: `Interface\Icons\Ability_Warrior_Warbringer.blp`,
			wantOK:      true,
		},
		{
			name:    "non-icon interface path",
			texture: `Interface\Spellbook\SpellbookIcon`,
			wantOK:  false,
		},
		{
			name:   "empty texture",
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outName, blpPath, ok := iconFileNames(tt.texture)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if outName != tt.wantOutName {
				t.Errorf("outName = %q, want %q", outName, tt.wantOutName)
			}
			if blpPath != tt.wantBLPPath {
				t.Errorf("blpPath = %q, want %q", blpPath, tt.wantBLPPath)
			}
		})
	}
}
