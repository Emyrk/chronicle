package cli

import (
	"fmt"
	"image"
	"image/draw"
	"io"
	"os"
	"path/filepath"

	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/HugoSmits86/nativewebp"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func ExtractTalentBackgroundsCmd() *serpent.Command {
	var dbcPath string
	var server string
	var outDir string

	return &serpent.Command{
		Use:   "extract-talent-backgrounds",
		Short: "Extract talent tree background BLP files from a WoW client and convert to WebP.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{
				Name:        "out",
				Description: "Output directory for converted WebP files.",
				Flag:        "out",
				Value:       serpent.StringOf(&outDir),
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			if outDir == "" {
				return fmt.Errorf("--out is required")
			}

			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("(extract talent backgrounds) open wow client: %w", err)
			}
			//nolint:errcheck
			defer wc.Close()

			return extractTalentBackgrounds(wc, outDir, inv.Stdout)
		},
	}
}

func extractTalentBackgrounds(wc *dbcdb.WoWClient, outDir string, stdout io.Writer) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	tabs, err := wc.TalentTab()
	if err != nil {
		return fmt.Errorf("read TalentTab.dbc: %w", err)
	}

	// Use only the Pool-based reader (no MPQ hash fallback). Talent
	// background textures live in standard MPQs with listfiles; the
	// hash-based fallback can hang on corrupted/listfile-less archives.
	readFile := func(path string) ([]byte, error) {
		return wc.ReadFile(path)
	}

	// Deduplicate: multiple classes can share the same tab background name.
	seen := make(map[string]bool)

	var extracted, skipped int
	err = tabs.Range(func(cursor *dbdefs.Ent_TalentTab) bool {
		if cursor.BackgroundFile == "" {
			return true
		}

		baseName := cursor.BackgroundFile
		if seen[baseName] {
			return true
		}
		seen[baseName] = true

		_, _ = fmt.Fprintf(stdout, "  [%s] ", baseName)

		// BackgroundFile is a bare name like "WarriorArms".
		// The actual BLP lives at Interface\TalentFrame\<name>-TopLeft.blp
		// (split into quadrants: TopLeft, TopRight, BottomLeft, BottomRight).
		// Try a single-file path first, then fall back to quadrant layout.

		// Try single-file path first (some clients).
		// MPQ listfiles may use varying case (e.g. "TALENTFRAME"),
		// so we try both the natural and uppercase variants.
		for _, dir := range []string{`Interface\TalentFrame\`, `Interface\TALENTFRAME\`} {
			singlePath := dir + baseName + `.blp`
			if extractBLPToWebP(readFile, singlePath, outDir, stdout) {
				_, _ = fmt.Fprintf(stdout, "OK (single)\n")
				extracted++
				return true
			}
		}

		// Try quadrant layout (vanilla client standard). The frontend requests
		// one image per talent tree, so combine the four client textures into
		// that image instead of publishing four unusable quadrant files.
		found := false
		for _, dir := range []string{`Interface\TalentFrame\`, `Interface\TALENTFRAME\`} {
			if extractTalentBackgroundQuadrants(readFile, dir, baseName, outDir, stdout) {
				extracted++
				found = true
				break // found in this case variant, skip the other
			}
		}

		if found {
			_, _ = fmt.Fprintf(stdout, "OK (quadrants combined)\n")
		} else {
			_, _ = fmt.Fprintf(stdout, "SKIP (not found)\n")
			skipped++
		}
		return true
	})
	if err != nil {
		return fmt.Errorf("iterate TalentTab.dbc: %w", err)
	}

	_, _ = fmt.Fprintf(stdout, "Extracted %d talent background files (%d skipped) to %s\n",
		extracted, skipped, outDir)
	return nil
}

var talentBackgroundQuadrants = []struct {
	suffix string
	x      int
	y      int
}{
	{suffix: "-TopLeft", x: 0, y: 0},
	{suffix: "-TopRight", x: 1, y: 0},
	{suffix: "-BottomLeft", x: 0, y: 1},
	{suffix: "-BottomRight", x: 1, y: 1},
}

func extractTalentBackgroundQuadrants(
	readFile func(string) ([]byte, error),
	dir string,
	baseName string,
	outDir string,
	stdout io.Writer,
) bool {
	images := make([]image.Image, 0, len(talentBackgroundQuadrants))
	for _, quadrant := range talentBackgroundQuadrants {
		path := dir + baseName + quadrant.suffix + `.blp`
		data, err := readFile(path)
		if err != nil {
			return false
		}
		img, err := decodeBLP2(data)
		if err != nil {
			_, _ = fmt.Fprintf(stdout, "  SKIP %s (decode): %v\n", path, err)
			return false
		}
		images = append(images, img)
	}

	combined, err := combineTalentBackgroundQuadrants(images)
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (combine): %v\n", baseName, err)
		return false
	}

	outPath := filepath.Join(outDir, webpOutputName(baseName+`.blp`))
	out, err := os.Create(outPath)
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (create): %v\n", outPath, err)
		return false
	}
	if err := nativewebp.Encode(out, combined, nil); err != nil {
		_ = out.Close()
		_ = os.Remove(outPath)
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (encode): %v\n", outPath, err)
		return false
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(outPath)
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (close): %v\n", outPath, err)
		return false
	}
	return true
}

func combineTalentBackgroundQuadrants(quadrants []image.Image) (*image.NRGBA, error) {
	if len(quadrants) != len(talentBackgroundQuadrants) {
		return nil, fmt.Errorf("got %d quadrants, want %d", len(quadrants), len(talentBackgroundQuadrants))
	}

	topLeft := quadrants[0].Bounds()
	topRight := quadrants[1].Bounds()
	bottomLeft := quadrants[2].Bounds()
	bottomRight := quadrants[3].Bounds()
	if topLeft.Dx() != bottomLeft.Dx() || topRight.Dx() != bottomRight.Dx() ||
		topLeft.Dy() != topRight.Dy() || bottomLeft.Dy() != bottomRight.Dy() {
		return nil, fmt.Errorf(
			"misaligned quadrants: top-left=%s top-right=%s bottom-left=%s bottom-right=%s",
			topLeft, topRight, bottomLeft, bottomRight,
		)
	}

	columnWidths := []int{topLeft.Dx(), topRight.Dx()}
	rowHeights := []int{topLeft.Dy(), bottomLeft.Dy()}
	combined := image.NewNRGBA(image.Rect(0, 0, columnWidths[0]+columnWidths[1], rowHeights[0]+rowHeights[1]))
	for i, quadrant := range quadrants {
		placement := talentBackgroundQuadrants[i]
		x := placement.x * columnWidths[0]
		y := placement.y * rowHeights[0]
		destination := image.Rect(x, y, x+quadrant.Bounds().Dx(), y+quadrant.Bounds().Dy())
		draw.Draw(combined, destination, quadrant, quadrant.Bounds().Min, draw.Src)
	}
	return combined, nil
}
