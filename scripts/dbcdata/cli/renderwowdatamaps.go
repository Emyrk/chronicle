package cli

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sync"
	"time"

	"github.com/coder/serpent"
)

const defaultWowMapRendererManifest = "scripts/render-wow-map/Cargo.toml"

type renderWowdataMapsOptions struct {
	WowdataBin       string
	ManifestPath     string
	RendererManifest string
	Client           string
	Source           string
	Cache            string
	Workers          int64
}

type renderedWowMapSpec struct {
	MapID  int32
	Mode   string
	Width  int32
	Height int32
}

var renderedWowMapSpecs = []renderedWowMapSpec{
	{MapID: 43, Mode: "wmo", Width: 1200, Height: 800},
	{MapID: 2998, Mode: "adt", Width: 1200, Height: 1200},
}

// RenderWowdataMapsCmd generates coordinate-faithful instance maps from WMO or
// ADT geometry, then attaches their immutable assets to an existing map manifest.
func RenderWowdataMapsCmd() *serpent.Command {
	var opts renderWowdataMapsOptions
	var dbcPath, server string
	return &serpent.Command{
		Use:   "render-wowdata-maps",
		Short: "Render coordinate-faithful instance maps and update a map manifest.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "manifest", Description: "Existing map manifest to update.", Flag: "manifest", Value: serpent.StringOf(&opts.ManifestPath)},
			{Name: "renderer-manifest", Description: "Cargo manifest for the geometry renderer.", Flag: "renderer-manifest", Default: defaultWowMapRendererManifest, Value: serpent.StringOf(&opts.RendererManifest)},
			{Name: "wowdata", Description: "Wowdata executable. A pinned build is provisioned when omitted.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: wowdataDefaultBinary, Value: serpent.StringOf(&opts.WowdataBin)},
			{Name: "source", Description: "Read CASC data from local client archives or Blizzard's CDN.", Flag: "source", Default: "remote", Value: serpent.StringOf(&opts.Source)},
			{Name: "cache", Description: "Optional wowdata cache directory.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&opts.Cache)},
			{Name: "workers", Description: "Concurrent wowdata file exports.", Flag: "workers", Default: "8", Value: serpent.Int64Of(&opts.Workers)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if opts.ManifestPath == "" {
				return fmt.Errorf("--manifest is required")
			}
			if opts.Workers < 1 || opts.Workers > 32 {
				return fmt.Errorf("--workers must be between 1 and 32")
			}
			if err := validateWowdataExtractionSource(opts.Source); err != nil {
				return err
			}
			if opts.Source == "local" {
				client, err := ResolveDBCPath(dbcPath, server)
				if err != nil {
					return err
				}
				opts.Client = client
			}
			resolvedWowdata, err := resolveWowdataBinary(inv, opts.WowdataBin)
			if err != nil {
				return err
			}
			opts.WowdataBin = resolvedWowdata
			return renderWowdataMaps(inv.Context(), inv.Stdout, inv.Stderr, opts)
		},
	}
}

func renderWowdataMaps(ctx context.Context, stdout, stderr io.Writer, opts renderWowdataMapsOptions) error {
	data, err := os.ReadFile(opts.ManifestPath)
	if err != nil {
		return fmt.Errorf("read map manifest: %w", err)
	}
	var manifest wowMapManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("decode map manifest: %w", err)
	}
	if manifest.Format != wowMapManifestFormat {
		return fmt.Errorf("unsupported map manifest format %q", manifest.Format)
	}
	outDir := filepath.Dir(opts.ManifestPath)
	if err := os.MkdirAll(filepath.Join(outDir, "renders"), 0o755); err != nil {
		return fmt.Errorf("create rendered map directory: %w", err)
	}

	target := wowMapExtractOptions{
		WowdataBin: opts.WowdataBin,
		Client:     opts.Client,
		Source:     opts.Source,
		Product:    manifest.Target.Product,
		Build:      manifest.Target.Build,
		Region:     manifest.Target.Region,
		Locale:     manifest.Target.Locale,
		Cache:      opts.Cache,
	}
	for _, spec := range renderedWowMapSpecs {
		rendered, err := renderWowdataMap(ctx, stdout, stderr, target, opts, spec, outDir)
		if err != nil {
			return fmt.Errorf("render map %d: %w", spec.MapID, err)
		}
		found := false
		for index := range manifest.Instances {
			if manifest.Instances[index].MapID == spec.MapID {
				manifest.Instances[index].Rendered = rendered
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("map manifest has no instance record for map %d", spec.MapID)
		}
	}
	if err := writeWowMapManifest(opts.ManifestPath, manifest); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "Attached %d rendered instance maps to %s\n", len(renderedWowMapSpecs), opts.ManifestPath)
	return nil
}

func renderWowdataMap(
	ctx context.Context,
	stdout, stderr io.Writer,
	target wowMapExtractOptions,
	opts renderWowdataMapsOptions,
	spec renderedWowMapSpec,
	outDir string,
) (*wowMapRenderedInstance, error) {
	wdtFileDataID, err := readWowMapWDTFileDataID(ctx, stderr, target, spec.MapID)
	if err != nil {
		return nil, err
	}
	workDir, err := os.MkdirTemp("", fmt.Sprintf("chronicle-render-map-%d-", spec.MapID))
	if err != nil {
		return nil, fmt.Errorf("create map render workspace: %w", err)
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	wdtPath := filepath.Join(workDir, "map.wdt")
	if err := exportWowdataFile(ctx, stderr, target, wdtFileDataID, wdtPath); err != nil {
		return nil, err
	}
	wdt, err := os.ReadFile(wdtPath)
	if err != nil {
		return nil, fmt.Errorf("read WDT: %w", err)
	}

	buildName := regexp.MustCompile(`[^A-Za-z0-9._-]+`).ReplaceAllString(target.Build, "-")
	assetName := fmt.Sprintf("%d-%s.png", spec.MapID, buildName)
	assetRelativePath := filepath.ToSlash(filepath.Join("renders", assetName))
	assetPath := filepath.Join(outDir, filepath.FromSlash(assetRelativePath))
	metadataPath := filepath.Join(workDir, "render.json")

	args := []string{"run", "--release", "--manifest-path", opts.RendererManifest, "--"}
	switch spec.Mode {
	case "wmo":
		placements, rootID, err := parseGlobalWMOPlacement(wdt)
		if err != nil {
			return nil, err
		}
		placementsPath := filepath.Join(workDir, "placements.json")
		placementData, err := json.MarshalIndent(placements, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("marshal WDT placements: %w", err)
		}
		if err := os.WriteFile(placementsPath, append(placementData, '\n'), 0o644); err != nil {
			return nil, fmt.Errorf("write WDT placements: %w", err)
		}
		rootPath := filepath.Join(workDir, "root.wmo")
		if err := exportWowdataFile(ctx, stderr, target, rootID, rootPath); err != nil {
			return nil, err
		}
		root, err := os.ReadFile(rootPath)
		if err != nil {
			return nil, fmt.Errorf("read WMO root: %w", err)
		}
		groupIDs, err := parseWMOGroupFileDataIDs(root)
		if err != nil {
			return nil, err
		}
		groupsDir := filepath.Join(workDir, "groups")
		if err := os.MkdirAll(groupsDir, 0o755); err != nil {
			return nil, fmt.Errorf("create WMO group directory: %w", err)
		}
		outputs := make([]wowdataFileExport, 0, len(groupIDs))
		for index, fileDataID := range groupIDs {
			outputs = append(outputs, wowdataFileExport{
				FileDataID: fileDataID,
				Output:     filepath.Join(groupsDir, fmt.Sprintf("group_%03d.wmo", index)),
			})
		}
		if err := exportWowdataFiles(ctx, stderr, target, outputs, int(opts.Workers)); err != nil {
			return nil, err
		}
		args = append(args, "wmo", groupsDir, placementsPath, assetPath, metadataPath)
	case "adt":
		tiles, err := parseWDTADTRootFileDataIDs(wdt)
		if err != nil {
			return nil, err
		}
		adtDir := filepath.Join(workDir, "adt")
		if err := os.MkdirAll(adtDir, 0o755); err != nil {
			return nil, fmt.Errorf("create ADT directory: %w", err)
		}
		outputs := make([]wowdataFileExport, 0, len(tiles))
		for _, tile := range tiles {
			outputs = append(outputs, wowdataFileExport{
				FileDataID: tile.FileDataID,
				Output:     filepath.Join(adtDir, fmt.Sprintf("tile_%02d_%02d.adt", tile.Column, tile.Row)),
			})
		}
		if err := exportWowdataFiles(ctx, stderr, target, outputs, int(opts.Workers)); err != nil {
			return nil, err
		}
		args = append(args, "adt", adtDir, assetPath, metadataPath)
	default:
		return nil, fmt.Errorf("unsupported render mode %q", spec.Mode)
	}
	args = append(args, fmt.Sprint(spec.Width), fmt.Sprint(spec.Height))
	cmd := exec.CommandContext(ctx, "cargo", args...)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("run geometry renderer: %w", err)
	}
	metadataData, err := os.ReadFile(metadataPath)
	if err != nil {
		return nil, fmt.Errorf("read renderer metadata: %w", err)
	}
	var metadata struct {
		Width     int32             `json:"width"`
		Height    int32             `json:"height"`
		Source    string            `json:"source"`
		Bounds    wowMapFloorBounds `json:"bounds"`
		Triangles int64             `json:"triangles"`
	}
	if err := json.Unmarshal(metadataData, &metadata); err != nil {
		return nil, fmt.Errorf("decode renderer metadata: %w", err)
	}
	return &wowMapRenderedInstance{
		Path: assetRelativePath, Width: metadata.Width, Height: metadata.Height,
		Source: metadata.Source, Bounds: metadata.Bounds, Triangles: metadata.Triangles,
	}, nil
}

func readWowMapWDTFileDataID(ctx context.Context, stderr io.Writer, target wowMapExtractOptions, mapID int32) (int32, error) {
	args := append([]string{"db2", "rows", "Map", "--id", fmt.Sprint(mapID)}, wowdataTargetArgs(target)...)
	cmd := exec.CommandContext(ctx, target.WowdataBin, args...)
	cmd.Stderr = stderr
	output, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("read Map row %d: %w", mapID, err)
	}
	var response struct {
		OK   bool `json:"ok"`
		Data struct {
			Rows []struct {
				WDTFileDataID int32 `json:"WdtFileDataID"`
			} `json:"rows"`
		} `json:"data"`
	}
	if err := json.Unmarshal(output, &response); err != nil {
		return 0, fmt.Errorf("decode Map row %d: %w", mapID, err)
	}
	if !response.OK || len(response.Data.Rows) != 1 || response.Data.Rows[0].WDTFileDataID == 0 {
		return 0, fmt.Errorf("map row %d has no WDT FileDataID", mapID)
	}
	return response.Data.Rows[0].WDTFileDataID, nil
}

func exportWowdataFile(ctx context.Context, stderr io.Writer, target wowMapExtractOptions, fileDataID int32, output string) error {
	return exportWowdataFileWithRetries(ctx, stderr, target, fileDataID, output, []time.Duration{
		time.Second,
		2 * time.Second,
	})
}

func exportWowdataFileWithRetries(
	ctx context.Context,
	stderr io.Writer,
	target wowMapExtractOptions,
	fileDataID int32,
	output string,
	retryDelays []time.Duration,
) error {
	args := append([]string{"file", "export", "--file-data-id", fmt.Sprint(fileDataID), "--output", output}, wowdataTargetArgs(target)...)
	var lastErr error
	for attempt := 0; attempt <= len(retryDelays); attempt++ {
		cmd := exec.CommandContext(ctx, target.WowdataBin, args...)
		cmd.Stderr = stderr
		if err := cmd.Run(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if ctx.Err() != nil {
			return fmt.Errorf("export FileDataID %d: %w", fileDataID, ctx.Err())
		}
		if attempt == len(retryDelays) {
			break
		}
		_ = os.Remove(output)
		_, _ = fmt.Fprintf(stderr, "Retrying FileDataID %d after export failure (%d/%d)\n", fileDataID, attempt+1, len(retryDelays))
		timer := time.NewTimer(retryDelays[attempt])
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("export FileDataID %d: %w", fileDataID, ctx.Err())
		case <-timer.C:
		}
	}
	return fmt.Errorf("export FileDataID %d after %d attempts: %w", fileDataID, len(retryDelays)+1, lastErr)
}

type wowdataFileExport struct {
	FileDataID int32
	Output     string
}

func exportWowdataFiles(ctx context.Context, stderr io.Writer, target wowMapExtractOptions, files []wowdataFileExport, workers int) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan wowdataFileExport)
	var wait sync.WaitGroup
	var mu sync.Mutex
	var firstErr error
	worker := func() {
		defer wait.Done()
		for file := range jobs {
			if err := exportWowdataFile(ctx, stderr, target, file.FileDataID, file.Output); err != nil {
				mu.Lock()
				if firstErr == nil {
					firstErr = err
					cancel()
				}
				mu.Unlock()
			}
		}
	}
	for range workers {
		wait.Add(1)
		go worker()
	}
feed:
	for _, file := range files {
		select {
		case jobs <- file:
		case <-ctx.Done():
			break feed
		}
	}
	close(jobs)
	wait.Wait()
	return firstErr
}

type wdtPlacement struct {
	FileDataID int32                 `json:"fileDataID"`
	Position   [3]float32            `json:"position"`
	Rotation   [3]float32            `json:"rotation"`
	Bounds     map[string][3]float32 `json:"bounds"`
	Flags      uint16                `json:"flags"`
	DoodadSet  uint16                `json:"doodadSet"`
	NameSet    uint16                `json:"nameSet"`
	Scale      float32               `json:"scale"`
}

func parseGlobalWMOPlacement(wdt []byte) ([]wdtPlacement, int32, error) {
	payload, err := wowChunk(wdt, "MODF")
	if err != nil {
		return nil, 0, err
	}
	if len(payload) != 64 {
		return nil, 0, fmt.Errorf("expected one 64-byte WDT MODF placement, got %d bytes", len(payload))
	}
	readVector := func(offset int) [3]float32 {
		return [3]float32{
			math.Float32frombits(binary.LittleEndian.Uint32(payload[offset:])),
			math.Float32frombits(binary.LittleEndian.Uint32(payload[offset+4:])),
			math.Float32frombits(binary.LittleEndian.Uint32(payload[offset+8:])),
		}
	}
	fileDataID := int32(binary.LittleEndian.Uint32(payload))
	placement := wdtPlacement{
		FileDataID: fileDataID,
		Position:   readVector(8),
		Rotation:   readVector(20),
		Bounds: map[string][3]float32{
			"minimum": readVector(32),
			"maximum": readVector(44),
		},
		Flags:     binary.LittleEndian.Uint16(payload[56:]),
		DoodadSet: binary.LittleEndian.Uint16(payload[58:]),
		NameSet:   binary.LittleEndian.Uint16(payload[60:]),
		Scale:     float32(binary.LittleEndian.Uint16(payload[62:])) / 1024,
	}
	return []wdtPlacement{placement}, fileDataID, nil
}

func parseWMOGroupFileDataIDs(root []byte) ([]int32, error) {
	payload, err := wowChunk(root, "GFID")
	if err != nil {
		return nil, err
	}
	if len(payload)%4 != 0 || len(payload) == 0 {
		return nil, fmt.Errorf("invalid WMO GFID size %d", len(payload))
	}
	ids := make([]int32, 0, len(payload)/4)
	for offset := 0; offset < len(payload); offset += 4 {
		ids = append(ids, int32(binary.LittleEndian.Uint32(payload[offset:])))
	}
	return ids, nil
}

type wdtADTTile struct {
	FileDataID int32
	Column     int32
	Row        int32
}

func parseWDTADTRootFileDataIDs(wdt []byte) ([]wdtADTTile, error) {
	payload, err := wowChunk(wdt, "MAID")
	if err != nil {
		return nil, err
	}
	if len(payload)%32 != 0 {
		return nil, fmt.Errorf("invalid WDT MAID size %d", len(payload))
	}
	var tiles []wdtADTTile
	for offset := 0; offset < len(payload); offset += 32 {
		fileDataID := int32(binary.LittleEndian.Uint32(payload[offset:]))
		if fileDataID != 0 {
			index := int32(offset / 32)
			tiles = append(tiles, wdtADTTile{
				FileDataID: fileDataID,
				Column:     index % 64,
				Row:        index / 64,
			})
		}
	}
	if len(tiles) == 0 {
		return nil, fmt.Errorf("WDT MAID contains no root ADTs")
	}
	return tiles, nil
}

func wowChunk(data []byte, wanted string) ([]byte, error) {
	for offset := 0; offset+8 <= len(data); {
		tag := []byte{data[offset+3], data[offset+2], data[offset+1], data[offset]}
		size := int(binary.LittleEndian.Uint32(data[offset+4:]))
		start := offset + 8
		end := start + size
		if end > len(data) {
			return nil, fmt.Errorf("chunk %q extends past end of file", string(tag))
		}
		if string(tag) == wanted {
			return data[start:end], nil
		}
		offset = end
	}
	return nil, fmt.Errorf("chunk %s not found", wanted)
}
