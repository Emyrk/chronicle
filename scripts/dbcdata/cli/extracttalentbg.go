package cli

import (
	"fmt"
	"io"
	"os"

	"github.com/Gophercraft/core/format/dbc/dbdefs"

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

		// Try quadrant layout (vanilla client standard).
		quadrants := []string{"-TopLeft", "-TopRight", "-BottomLeft", "-BottomRight"}
		foundAny := false
		for _, dir := range []string{`Interface\TalentFrame\`, `Interface\TALENTFRAME\`} {
			for _, q := range quadrants {
				qPath := dir + baseName + q + `.blp`
				if extractBLPToWebP(readFile, qPath, outDir, stdout) {
					extracted++
					foundAny = true
				}
			}
			if foundAny {
				break // found in this case variant, skip the other
			}
		}

		if foundAny {
			_, _ = fmt.Fprintf(stdout, "OK (quadrants)\n")
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
