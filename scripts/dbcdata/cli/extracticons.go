package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func ExtractIconsCmd() *serpent.Command {
	var dbcPath string
	var server string
	var outDir string

	return &serpent.Command{
		Use:   "extract-icons",
		Short: "Extract all icon BLP files from a WoW client directory.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{
				Name:        "out",
				Description: "Output directory for extracted BLP files.",
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
				return fmt.Errorf("(extract icons) open wow client: %w", err)
			}
			//nolint:errcheck
			defer wc.Close()

			return extractIcons(wc, outDir, inv.Stdout)
		},
	}
}

func extractIcons(wc *dbcdb.WoWClient, outDir string, stdout io.Writer) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	files, err := wc.ListFiles()
	if err != nil {
		return fmt.Errorf("list files: %w", err)
	}

	const prefix = `Interface\Icons\`
	var extracted, skipped int
	for _, f := range files {
		if !strings.HasPrefix(f, prefix) {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(f), ".blp") {
			continue
		}

		data, err := wc.ReadFile(f)
		if err != nil {
			_, _ = fmt.Fprintf(stdout, "  SKIP %s: %v\n", f, err)
			skipped++
			continue
		}

		name := strings.ToLower(strings.TrimPrefix(f, prefix))
		if err := os.WriteFile(filepath.Join(outDir, name), data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
		extracted++
	}

	_, _ = fmt.Fprintf(stdout, "Extracted %d icons (%d skipped) to %s\n", extracted, skipped, outDir)
	return nil
}
