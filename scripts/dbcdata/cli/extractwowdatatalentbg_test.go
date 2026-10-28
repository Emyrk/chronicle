package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestValidCachedTalentBackgroundQuadrantRejectsPartialFile(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "partial.blp")
	if err := os.WriteFile(path, []byte("BLP2"), 0o600); err != nil {
		t.Fatal(err)
	}
	if validCachedTalentBackgroundQuadrant(path) {
		t.Fatal("partial BLP should not be reusable")
	}
}

func TestSelectWowdataTalentBackgrounds(t *testing.T) {
	t.Parallel()

	var files []wowdataFile
	var fileDataID int32 = 1
	for name := range foreverTalentBackgroundNames {
		for _, quadrant := range talentBackgroundQuadrants {
			files = append(files, wowdataFile{
				FileDataID: fileDataID,
				FileName:   fmt.Sprintf("Interface/TalentFrame/%s%s.BLP", name, quadrant.suffix),
			})
			fileDataID++
		}
	}
	files = append(files,
		wowdataFile{FileDataID: fileDataID, FileName: "interface/talentframe/ui-talentframe-botleft.blp"},
		wowdataFile{FileDataID: fileDataID + 1, FileName: "interface/talentframe/deathknightblood-topleft.blp"},
	)

	backgrounds, err := selectWowdataTalentBackgrounds(files)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := len(backgrounds), len(foreverTalentBackgroundNames); got != want {
		t.Fatalf("background count = %d, want %d", got, want)
	}
	for i := 1; i < len(backgrounds); i++ {
		if backgrounds[i-1].Name >= backgrounds[i].Name {
			t.Fatalf("backgrounds are not sorted: %q before %q", backgrounds[i-1].Name, backgrounds[i].Name)
		}
	}
}

func TestSelectWowdataTalentBackgroundsRequiresEveryQuadrant(t *testing.T) {
	t.Parallel()

	var files []wowdataFile
	var fileDataID int32 = 1
	for name := range foreverTalentBackgroundNames {
		for index, quadrant := range talentBackgroundQuadrants {
			if name == "warriorarms" && index == 0 {
				continue
			}
			files = append(files, wowdataFile{
				FileDataID: fileDataID,
				FileName:   fmt.Sprintf("interface/talentframe/%s%s.blp", name, quadrant.suffix),
			})
			fileDataID++
		}
	}

	if _, err := selectWowdataTalentBackgrounds(files); err == nil {
		t.Fatal("expected missing quadrant to fail")
	}
}
