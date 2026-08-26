package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/HugoSmits86/nativewebp"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

func ExtractLoadingScreensCmd() *serpent.Command {
	var dbcPath string
	var server string
	var outDir string

	return &serpent.Command{
		Use:   "extract-loading-screens",
		Short: "Extract loading screen BLP files from a WoW client and convert to WebP.",
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
				return fmt.Errorf("(extract loading screens) open wow client: %w", err)
			}
			//nolint:errcheck
			defer wc.Close()

			return extractLoadingScreens(wc, resolved, outDir, inv.Stdout)
		},
	}
}

func extractLoadingScreens(wc *dbcdb.WoWClient, clientPath, outDir string, stdout io.Writer) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	// Use LoadingScreens.dbc to discover file paths. This is more reliable
	// than ListFiles() which depends on MPQ listfiles (missing on some servers).
	ls, err := wc.LoadingScreens()
	if err != nil {
		return fmt.Errorf("read LoadingScreens.dbc: %w", err)
	}

	// Build an MPQ fallback reader for files not found via the Pool's listfile
	// index. Some WoW clients (Epoch, AzerothCore, Ascension) have MPQs without
	// listfiles, so Pool.OpenFile fails. Direct MPQ hash-based lookup works.
	fallback, err := newMPQFallback(clientPath)
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  Warning: MPQ fallback unavailable: %v\n", err)
	} else {
		defer fallback.Close()
	}

	readFile := func(path string) ([]byte, error) {
		data, err := wc.ReadFile(path)
		if err == nil {
			return data, nil
		}
		if fallback != nil {
			return fallback.ReadFile(path)
		}
		return nil, err
	}

	var extracted, skipped int
	err = ls.Range(func(cursor *dbdefs.Ent_LoadingScreens) bool {
		if cursor.FileName == "" {
			return true
		}

		// FileName is e.g. "Interface\Glues\LoadingScreens\LoadScreenKalimdor.blp"
		blpPath := cursor.FileName
		if !strings.HasSuffix(strings.ToLower(blpPath), ".blp") {
			blpPath += ".blp"
		}

		if !extractBLPToWebP(readFile, blpPath, outDir, stdout) {
			skipped++
		} else {
			extracted++
		}

		// Also try the widescreen variant (*Wide.blp).
		// Not counted as skipped if missing — most screens don't have one.
		widePath := strings.TrimSuffix(blpPath, filepath.Ext(blpPath)) + "Wide.blp"
		if extractBLPToWebP(readFile, widePath, outDir, stdout) {
			extracted++
		}

		return true
	})
	if err != nil {
		return fmt.Errorf("iterate LoadingScreens.dbc: %w", err)
	}

	_, _ = fmt.Fprintf(stdout, "Extracted %d loading screens (%d skipped, %d in DBC) to %s\n",
		extracted, skipped, ls.Len(), outDir)
	return nil
}

func webpOutputName(blpPath string) string {
	name := filepath.Base(strings.ReplaceAll(blpPath, `\`, "/"))
	return strings.TrimSuffix(strings.ToLower(name), ".blp") + ".webp"
}

// extractBLPToWebP reads a BLP file, decodes it, and writes a WebP file to
// outDir. Returns true on success, false if skipped.
func extractBLPToWebP(readFile func(string) ([]byte, error), blpPath, outDir string, stdout io.Writer) bool {
	data, err := readFile(blpPath)
	if err != nil {
		// File not found is expected for widescreen variants that don't exist.
		return false
	}

	img, err := decodeBLP2(data)
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (decode): %v\n", blpPath, err)
		return false
	}

	name := webpOutputName(blpPath)
	outPath := filepath.Join(outDir, name)

	out, err := os.Create(outPath)
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (create): %v\n", blpPath, err)
		return false
	}

	if err := nativewebp.Encode(out, img, nil); err != nil {
		_ = out.Close()
		_ = os.Remove(outPath)
		_, _ = fmt.Fprintf(stdout, "  SKIP %s (encode): %v\n", blpPath, err)
		return false
	}
	_ = out.Close()
	return true
}
