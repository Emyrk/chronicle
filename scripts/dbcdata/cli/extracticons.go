package cli

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/Gophercraft/core/format/dbc/dbdefs"

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

			return extractIcons(wc, resolved, outDir, inv.Stdout)
		},
	}
}

func extractIcons(wc *dbcdb.WoWClient, clientPath, outDir string, stdout io.Writer) error {
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return fmt.Errorf("create output directory: %w", err)
	}

	// Build an MPQ fallback reader for files not found via the Pool's listfile
	// index. Some WoW clients (AzerothCore, Epoch, Ascension) have MPQs
	// without listfiles, so Pool.OpenFile fails. Direct MPQ hash-based lookup
	// works when we know the path.
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

	// Phase 1: ListFiles() discovers icons from MPQ archives that have
	// embedded listfiles. This catches ALL icon types (spells, items,
	// achievements, buffs, UI, etc.) but misses icons in listfile-less MPQs.
	const prefix = `Interface\Icons\`
	written := make(map[string]bool) // lowercase name → true
	var extracted, skipped int

	files, err := wc.ListFiles()
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  Warning: ListFiles failed: %v\n", err)
	}
	for _, f := range files {
		if !strings.HasPrefix(f, prefix) {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(f), ".blp") {
			continue
		}

		data, err := readFile(f)
		if err != nil {
			_, _ = fmt.Fprintf(stdout, "  SKIP %s: %v\n", f, err)
			skipped++
			continue
		}

		name := strings.ToLower(strings.TrimPrefix(f, prefix))
		if err := os.WriteFile(filepath.Join(outDir, name), data, 0o644); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
		written[name] = true
		extracted++
	}

	_, _ = fmt.Fprintf(stdout, "Phase 1 (ListFiles): extracted %d, skipped %d\n", extracted, skipped)

	// extractTexture finds a known icon path through the MPQ fallback and writes
	// it unless an earlier discovery phase already extracted it.
	extractTexture := func(texture string) (bool, error) {
		outName, blpPath, ok := iconFileNames(texture)
		if !ok || written[outName] {
			return false, nil
		}

		data, err := readFile(blpPath)
		if err != nil {
			_, _ = fmt.Fprintf(stdout, "  SKIP %s: %v\n", blpPath, err)
			return false, nil
		}
		if err := os.WriteFile(filepath.Join(outDir, outName), data, 0o644); err != nil {
			return false, fmt.Errorf("write %s: %w", outName, err)
		}
		written[outName] = true
		return true, nil
	}

	// Phase 2: Use SpellIcon.dbc to find spell/talent/ability icons that were
	// missed by ListFiles().
	var spellExtracted int
	icons, err := wc.SpellIcons()
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  Warning: SpellIcon.dbc unavailable: %v\n", err)
	} else {
		var extractErr error
		err = icons.Range(func(cursor *dbdefs.Ent_SpellIcon) bool {
			var wasWritten bool
			wasWritten, extractErr = extractTexture(cursor.TextureFilename)
			if extractErr != nil {
				return false
			}
			if wasWritten {
				spellExtracted++
			}
			return true
		})
		if err != nil {
			return fmt.Errorf("iterate SpellIcon.dbc: %w", err)
		}
		if extractErr != nil {
			return extractErr
		}
		_, _ = fmt.Fprintf(stdout, "Phase 2 (SpellIcon.dbc): extracted %d new (%d in DBC)\n",
			spellExtracted, icons.Len())
	}

	// Phase 3: Item inventory icons live in ItemDisplayInfo.dbc rather than
	// SpellIcon.dbc. This is required for listfile-less MPQs, where item icons
	// cannot otherwise be discovered even though direct hash lookup can read them.
	var itemExtracted int
	displayInfo, err := wc.ItemDisplayInfo()
	if err != nil {
		_, _ = fmt.Fprintf(stdout, "  Warning: ItemDisplayInfo.dbc unavailable: %v\n", err)
	} else {
		var extractErr error
		err = displayInfo.Range(func(cursor *dbdefs.Ent_ItemDisplayInfo) bool {
			for _, texture := range cursor.InventoryIcon {
				var wasWritten bool
				wasWritten, extractErr = extractTexture(texture)
				if extractErr != nil {
					return false
				}
				if wasWritten {
					itemExtracted++
				}
			}
			return true
		})
		if err != nil {
			return fmt.Errorf("iterate ItemDisplayInfo.dbc: %w", err)
		}
		if extractErr != nil {
			return extractErr
		}
		_, _ = fmt.Fprintf(stdout, "Phase 3 (ItemDisplayInfo.dbc): extracted %d new (%d in DBC)\n",
			itemExtracted, displayInfo.Len())
	}

	_, _ = fmt.Fprintf(stdout, "Total: %d icons extracted to %s\n", extracted+spellExtracted+itemExtracted, outDir)
	return nil
}

func iconFileNames(texture string) (outName, blpPath string, ok bool) {
	if texture == "" {
		return "", "", false
	}

	// Texture names may be bare ("Ability_Warrior_Warbringer") or include the
	// Interface\Icons\ prefix. Paths outside Interface\Icons\ are not icons
	// handled by this extractor.
	texName := cutIconPrefix(texture)
	if texName == texture && strings.ContainsRune(texName, '\\') {
		return "", "", false
	}

	const prefix = `Interface\Icons\`
	return strings.ToLower(texName) + ".blp", prefix + texName + ".blp", true
}
