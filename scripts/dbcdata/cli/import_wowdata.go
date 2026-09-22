package cli

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/Emyrk/chronicle/internal/wowdata"
	"github.com/coder/serpent"
)

// ImportWowdataCmd extracts a modern client when requested, converts its DB2
// rows, and imports them without routing through Chronicle's legacy DBC parsers.
func ImportWowdataCmd() *serpent.Command {
	var snapshot, client, wowdataBin, extractor, snapshotOut string
	var apiURL, datasetID, token, cookie, product, build, region, locale, cache, out string
	var dryRun bool
	return &serpent.Command{
		Use:   "import-wowdata",
		Short: "Extract, convert, and import WoW Forever game data.",
		Options: serpent.OptionSet{
			{Name: "snapshot", Description: "Existing normalized snapshot containing manifest.json and tables/*.jsonl.", Flag: "snapshot", Value: serpent.StringOf(&snapshot)},
			{Name: "client", Description: "WoW installation root containing .build.info and Data/. Alternative to --snapshot.", Flag: "client", Env: "WOW_CLIENT_PATH", Value: serpent.StringOf(&client)},
			{Name: "wowdata", Description: "Wowdata executable used with --client.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: "wowdata", Value: serpent.StringOf(&wowdataBin)},
			{Name: "extractor", Description: "Path to Chronicle's wowdata extraction script.", Flag: "extractor", Default: "scripts/dbcdata/extract-wowdata.sh", Value: serpent.StringOf(&extractor)},
			{Name: "snapshot-out", Description: "Keep the normalized snapshot at this path when extracting from --client; otherwise a temporary directory is used.", Flag: "snapshot-out", Value: serpent.StringOf(&snapshotOut)},
			{Name: "region", Description: "Blizzard region used with --client.", Flag: "region", Env: "WOW_REGION", Default: "us", Value: serpent.StringOf(&region)},
			{Name: "locale", Description: "Data locale used with --client.", Flag: "locale", Env: "WOW_LOCALE", Default: "enUS", Value: serpent.StringOf(&locale)},
			{Name: "cache", Description: "Optional wowdata cache directory used with --client.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&cache)},
			{Name: "api-url", Description: "Chronicle API base URL.", Flag: "api-url", Value: serpent.StringOf(&apiURL)},
			{Name: "dataset-id", Description: "Dataset UUID to update.", Flag: "dataset-id", Env: "CHRONICLE_DATASET_ID", Value: serpent.StringOf(&datasetID)},
			{Name: "token", Description: "Bearer token.", Flag: "token", Env: "CHRONICLE_TOKEN", Value: serpent.StringOf(&token)},
			{Name: "cookie", Description: "Session cookie to exchange for a token.", Flag: "cookie", Env: "CHRONICLE_COOKIE", Value: serpent.StringOf(&cookie)},
			{Name: "product", Description: "Expected product or product to extract.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&product)},
			{Name: "build", Description: "Expected build; empty accepts the snapshot manifest build.", Flag: "build", Value: serpent.StringOf(&build)},
			{Name: "dry-run", Description: "Extract if needed and convert without uploading.", Flag: "dry-run", Value: serpent.BoolOf(&dryRun)},
			{Name: "out", Description: "Optional path for the converted gzip JSON payload.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if err := validateWowdataSource(snapshot, client); err != nil {
				return err
			}
			if client != "" {
				resolvedWowdata, err := resolveWowdataBinary(inv, wowdataBin)
				if err != nil {
					return err
				}
				var cleanup func()
				snapshot, cleanup, err = extractWowdata(inv, wowdataExtractOptions{
					Client:      client,
					WowdataBin:  resolvedWowdata,
					Extractor:   extractor,
					SnapshotOut: snapshotOut,
					Product:     product,
					Build:       build,
					Region:      region,
					Locale:      locale,
					Cache:       cache,
				})
				if err != nil {
					return err
				}
				defer cleanup()
			}

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

const (
	wowdataDefaultBinary = "wowdata"
	wowdataRepository    = "https://github.com/Follen/wowdata.git"
	wowdataCommit        = "6191d3dc567966b7a474849f3a11e7411390091c"
)

func resolveWowdataBinary(inv *serpent.Invocation, requested string) (string, error) {
	path, err := exec.LookPath(requested)
	if err == nil {
		return path, nil
	}
	if requested != wowdataDefaultBinary {
		return "", fmt.Errorf("find wowdata executable %q: %w", requested, err)
	}

	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", fmt.Errorf("find user cache directory for wowdata: %w", err)
	}
	binaryName := "wowdata"
	if runtime.GOOS == "windows" {
		binaryName += ".exe"
	}
	installDir := filepath.Join(cacheDir, "chronicle", "wowdata", wowdataCommit)
	binaryPath := filepath.Join(installDir, binaryName)
	if info, statErr := os.Stat(binaryPath); statErr == nil && !info.IsDir() {
		return binaryPath, nil
	}

	_, _ = fmt.Fprintf(inv.Stdout, "wowdata was not found; building pinned commit %s...\n", wowdataCommit[:12])
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		return "", fmt.Errorf("create wowdata install directory: %w", err)
	}
	sourceDir, err := os.MkdirTemp("", "chronicle-wowdata-source-")
	if err != nil {
		return "", fmt.Errorf("create temporary wowdata source directory: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(sourceDir)
	}()

	commands := [][]string{
		{"git", "init", "--quiet", sourceDir},
		{"git", "-C", sourceDir, "remote", "add", "origin", wowdataRepository},
		{"git", "-C", sourceDir, "fetch", "--quiet", "--depth", "1", "origin", wowdataCommit},
		{"git", "-C", sourceDir, "checkout", "--quiet", "FETCH_HEAD"},
		{"go", "build", "-trimpath", "-o", binaryPath, "./cmd/wowdata"},
	}
	for _, command := range commands {
		cmd := exec.CommandContext(inv.Context(), command[0], command[1:]...)
		if command[0] == "go" {
			cmd.Dir = sourceDir
		}
		cmd.Stdout = inv.Stdout
		cmd.Stderr = inv.Stderr
		if err := cmd.Run(); err != nil {
			_ = os.Remove(binaryPath)
			return "", fmt.Errorf("provision wowdata with %q: %w", strings.Join(command, " "), err)
		}
	}
	return binaryPath, nil
}

type wowdataExtractOptions struct {
	Client      string
	WowdataBin  string
	Extractor   string
	SnapshotOut string
	Product     string
	Build       string
	Region      string
	Locale      string
	Cache       string
}

func validateWowdataSource(snapshot, client string) error {
	if snapshot == "" && client == "" {
		return fmt.Errorf("provide exactly one of --snapshot or --client")
	}
	if snapshot != "" && client != "" {
		return fmt.Errorf("--snapshot and --client cannot be used together")
	}
	return nil
}

func wowdataExtractArgs(opts wowdataExtractOptions, out string) []string {
	args := []string{
		"--client", opts.Client,
		"--wowdata", opts.WowdataBin,
		"--product", opts.Product,
		"--region", opts.Region,
		"--locale", opts.Locale,
		"--out", out,
	}
	if opts.Build != "" {
		args = append(args, "--build", opts.Build)
	}
	if opts.Cache != "" {
		args = append(args, "--cache", opts.Cache)
	}
	return args
}

func extractWowdata(inv *serpent.Invocation, opts wowdataExtractOptions) (string, func(), error) {
	out := opts.SnapshotOut
	cleanup := func() {}
	if out == "" {
		var err error
		out, err = os.MkdirTemp("", "chronicle-wowdata-")
		if err != nil {
			return "", cleanup, fmt.Errorf("create temporary wowdata snapshot directory: %w", err)
		}
		cleanup = func() {
			_ = os.RemoveAll(out)
		}
	}

	_, _ = fmt.Fprintf(inv.Stdout, "Extracting %s %s from %s...\n", opts.Product, opts.Build, opts.Client)
	cmd := exec.CommandContext(inv.Context(), opts.Extractor, wowdataExtractArgs(opts, out)...)
	cmd.Stdout = inv.Stdout
	cmd.Stderr = inv.Stderr
	if err := cmd.Run(); err != nil {
		cleanup()
		return "", func() {}, fmt.Errorf("extract wowdata from client: %w", err)
	}
	return out, cleanup, nil
}
