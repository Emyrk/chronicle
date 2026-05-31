package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"

	"github.com/coder/serpent"
)

// ImportCmd is the unified game-data import command. It sources DBC files from
// a WoW client and either exports computed artifacts to disk (--export-as
// files) or uploads them to a running Chronicle server (--api-url).
//
// Each data category is implemented as an Importer (see Registry). Importers
// declare the DBC files they need so each file is read exactly once.
func ImportCmd() *serpent.Command {
	var (
		dbcPath  string
		server   string
		imports  []string
		exportAs string
		outDir   string
		apiURL   string
		datasetID string
	)

	return &serpent.Command{
		Use:   "import",
		Short: "Import game data from a WoW client into a dataset (or export to files).",
		Long: "Sources DBC files from a WoW client and produces game-data artifacts.\n\n" +
			"With --export-as=files, artifacts are written to --out for manual upload.\n" +
			"With --api-url, artifacts are uploaded directly to a Chronicle server.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{
				Name:        "import",
				Description: "Comma-separated importer keys to run, or 'all'. See --list.",
				Flag:        "import",
				Default:     "all",
				Value:       serpent.StringArrayOf(&imports),
			},
			{
				Name:        "export-as",
				Description: "Export mode: 'files' writes artifacts to --out instead of uploading.",
				Flag:        "export-as",
				Value:       serpent.StringOf(&exportAs),
			},
			{
				Name:        "out",
				Description: "Output directory for --export-as=files.",
				Flag:        "out",
				Default:     "./export",
				Value:       serpent.StringOf(&outDir),
			},
			{
				Name:        "api-url",
				Description: "Chronicle API base URL to upload artifacts to.",
				Flag:        "api-url",
				Value:       serpent.StringOf(&apiURL),
			},
			{
				Name:        "dataset-id",
				Description: "UUID of the dataset to import into (required for upload).",
				Flag:        "dataset-id",
				Value:       serpent.StringOf(&datasetID),
			},
		},
		Handler: func(inv *serpent.Invocation) error {
			selected, err := selectImporters(imports)
			if err != nil {
				return err
			}

			resolved, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			wc, err := dbcdb.New(resolved)
			if err != nil {
				return fmt.Errorf("open wow client: %w", err)
			}

			// Extract the union of required files once, shared across importers.
			files := make(map[DBCFile][]byte)
			for _, imp := range selected {
				if err := extractFiles(wc, files, imp.RequiredFiles()); err != nil {
					return err
				}
			}

			// Produce artifacts.
			type produced struct {
				imp       Importer
				artifacts []Artifact
			}
			var all []produced
			for _, imp := range selected {
				arts, err := imp.Produce(wc, files)
				if err != nil {
					return fmt.Errorf("%s: %w", imp.Key(), err)
				}
				all = append(all, produced{imp: imp, artifacts: arts})
				_, _ = fmt.Fprintf(inv.Stdout, "Produced %s (%d artifact(s))\n", imp.Name(), len(arts))
			}

			switch exportAs {
			case "files":
				if err := os.MkdirAll(outDir, 0o755); err != nil {
					return fmt.Errorf("create out dir: %w", err)
				}
				for _, p := range all {
					for _, art := range p.artifacts {
						path := filepath.Join(outDir, art.Filename)
						if err := os.WriteFile(path, art.Data, 0o644); err != nil {
							return fmt.Errorf("write %s: %w", path, err)
						}
						_, _ = fmt.Fprintf(inv.Stdout, "Wrote %s (%d bytes)\n", path, len(art.Data))
					}
				}
				return nil
			case "":
				// Upload mode.
				if apiURL == "" {
					return fmt.Errorf("either --export-as=files or --api-url is required")
				}
				// TODO: HTTP upload is pending a CLI auth mechanism decision.
				// The server's admin endpoints currently authenticate via session
				// cookie only (no Bearer/API-key path). Once that lands, wire the
				// upload transport here using Artifact.UploadKind / DBCType.
				return fmt.Errorf("--api-url upload is not yet implemented (pending CLI auth); use --export-as=files for now")
			default:
				return fmt.Errorf("invalid --export-as %q (only 'files' is supported)", exportAs)
			}
		},
	}
}

// selectImporters resolves the --import flag into a concrete importer list.
// "all" (or empty) selects every registered importer.
func selectImporters(keys []string) ([]Importer, error) {
	if len(keys) == 0 {
		return Registry(), nil
	}
	// A single "all" entry selects everything.
	if len(keys) == 1 && (keys[0] == "all" || keys[0] == "") {
		return Registry(), nil
	}

	var out []Importer
	for _, raw := range keys {
		for _, key := range strings.Split(raw, ",") {
			key = strings.TrimSpace(key)
			if key == "" {
				continue
			}
			imp, ok := ImporterByKey(key)
			if !ok {
				return nil, fmt.Errorf("unknown importer %q (valid: %s)", key, strings.Join(importerKeys(), ", "))
			}
			out = append(out, imp)
		}
	}
	if len(out) == 0 {
		return Registry(), nil
	}
	return out, nil
}

func importerKeys() []string {
	var keys []string
	for _, imp := range Registry() {
		keys = append(keys, imp.Key())
	}
	return keys
}
