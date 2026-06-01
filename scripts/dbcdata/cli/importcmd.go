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
		token    string
		mode     string
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
				Env:         "CHRONICLE_DATASET_ID",
				Value:       serpent.StringOf(&datasetID),
			},
			{
				Name:        "token",
				Description: "Bearer token for authenticating uploads.",
				Flag:        "token",
				Env:         "CHRONICLE_TOKEN",
				Value:       serpent.StringOf(&token),
			},
			{
				Name:        "mode",
				Description: "Upload mode for DBC artifacts: compare, upsert, or insert.",
				Flag:        "mode",
				Default:     "upsert",
				Value:       serpent.StringOf(&mode),
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
				if datasetID == "" {
					return fmt.Errorf("--dataset-id (or CHRONICLE_DATASET_ID) is required for upload")
				}
				if token == "" {
					return fmt.Errorf("--token (or CHRONICLE_TOKEN) is required for upload")
				}
				up := newUploader(apiURL, token, datasetID, mode)
				for _, p := range all {
					for _, art := range p.artifacts {
						if err := up.Upload(art); err != nil {
							return fmt.Errorf("upload %s (%s): %w", p.imp.Name(), art.Filename, err)
						}
						_, _ = fmt.Fprintf(inv.Stdout, "Uploaded %s → %s\n", art.Filename, p.imp.Name())
					}
				}
				return nil
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
