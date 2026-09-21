package cli

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/Emyrk/chronicle/internal/wowdata"
	"github.com/coder/serpent"
)

// ImportWowdataCmd imports a normalized wowdata snapshot without routing its
// modern DB2 JSONL rows through Chronicle's legacy DBC parsers.
func ImportWowdataCmd() *serpent.Command {
	var snapshot, apiURL, datasetID, token, cookie, product, build, out string
	var dryRun bool
	return &serpent.Command{
		Use:   "import-wowdata",
		Short: "Convert and import a WoW Forever wowdata snapshot.",
		Options: serpent.OptionSet{
			{Name: "snapshot", Description: "Directory containing manifest.json and tables/*.jsonl.", Flag: "snapshot", Required: true, Value: serpent.StringOf(&snapshot)},
			{Name: "api-url", Description: "Chronicle API base URL.", Flag: "api-url", Value: serpent.StringOf(&apiURL)},
			{Name: "dataset-id", Description: "Dataset UUID to update.", Flag: "dataset-id", Env: "CHRONICLE_DATASET_ID", Value: serpent.StringOf(&datasetID)},
			{Name: "token", Description: "Bearer token.", Flag: "token", Env: "CHRONICLE_TOKEN", Value: serpent.StringOf(&token)},
			{Name: "cookie", Description: "Session cookie to exchange for a token.", Flag: "cookie", Env: "CHRONICLE_COOKIE", Value: serpent.StringOf(&cookie)},
			{Name: "product", Description: "Expected snapshot product.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&product)},
			{Name: "build", Description: "Expected build; empty accepts the manifest build.", Flag: "build", Value: serpent.StringOf(&build)},
			{Name: "dry-run", Description: "Validate and convert without uploading.", Flag: "dry-run", Value: serpent.BoolOf(&dryRun)},
			{Name: "out", Description: "Optional path for the converted gzip JSON payload.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(inv *serpent.Invocation) error {
			converted, err := wowdata.Convert(snapshot, product, build)
			if err != nil {
				return err
			}
			var raw bytes.Buffer
			gz := gzip.NewWriter(&raw)
			enc := json.NewEncoder(gz)
			if err := enc.Encode(converted); err != nil {
				return fmt.Errorf("encode converted snapshot: %w", err)
			}
			if err := gz.Close(); err != nil {
				return fmt.Errorf("close gzip payload: %w", err)
			}
			if out != "" {
				if err := os.WriteFile(out, raw.Bytes(), 0o644); err != nil {
					return fmt.Errorf("write payload: %w", err)
				}
			}
			_, _ = fmt.Fprintf(inv.Stdout, "Converted %s %s: %d spells, %d items, %d enchantments, %d item sets (%s gzip)\n", converted.Product, converted.Build, len(converted.Spells), len(converted.Items), len(converted.Enchantments), len(converted.ItemSets), formatSize(raw.Len()))
			_, _ = fmt.Fprintf(inv.Stdout, "Loss report: missing ItemSparse=%d, missing Item=%d, dropped effects=%d, dropped powers=%d, orphan spell rows=%d, non-integral base points=%d\n", len(converted.Losses.MissingItemSparseIDs), len(converted.Losses.MissingItemBaseIDs), converted.Losses.DroppedSpellEffects, converted.Losses.DroppedSpellPowers, converted.Losses.DroppedOrphanSpellRows, converted.Losses.RoundedBasePoints)
			for _, policy := range converted.Losses.Policies {
				_, _ = fmt.Fprintln(inv.Stdout, "-", policy)
			}
			if dryRun {
				return nil
			}
			if apiURL == "" || datasetID == "" {
				return fmt.Errorf("--api-url and --dataset-id are required unless --dry-run is set")
			}
			token, err = resolveToken(apiURL, token, cookie)
			if err != nil {
				return err
			}
			endpoint := fmt.Sprintf("%s/api/v1/game-data/datasets/%s/wowdata-snapshot", strings.TrimSuffix(apiURL, "/"), datasetID)
			req, err := http.NewRequestWithContext(inv.Context(), http.MethodPut, endpoint, bytes.NewReader(raw.Bytes()))
			if err != nil {
				return fmt.Errorf("create upload request: %w", err)
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Content-Encoding", "gzip")
			up := newUploader(apiURL, token, datasetID, "upsert")
			if err := up.do(req); err != nil {
				return fmt.Errorf("upload wowdata snapshot: %w", err)
			}
			_, _ = fmt.Fprintln(inv.Stdout, "Uploaded wowdata snapshot.")
			return nil
		},
	}
}
