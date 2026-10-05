package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"

	"github.com/coder/serpent"
)

const wowMapManifestFormat = "chronicle-wow-map-art-v1"

type wowMapTarget struct {
	Product string `json:"product"`
	Build   string `json:"build"`
	Region  string `json:"region"`
	Locale  string `json:"locale"`
}

type wowMapManifest struct {
	Format string         `json:"format"`
	Target wowMapTarget   `json:"target"`
	Maps   []wowMapRecord `json:"maps"`
}

type wowMapRecord struct {
	ID          int32                  `json:"id"`
	Name        string                 `json:"name"`
	ParentID    int32                  `json:"parentID"`
	Type        int32                  `json:"type"`
	Flags       int32                  `json:"flags"`
	Assignments []wowMapAssignment     `json:"assignments,omitempty"`
	Art         []wowMapArtAssociation `json:"art,omitempty"`
}

type wowMapAssignment struct {
	ID                   int32      `json:"id"`
	MapID                int32      `json:"mapID"`
	AreaID               int32      `json:"areaID"`
	OrderIndex           int32      `json:"orderIndex"`
	Region               [6]float64 `json:"region"`
	UiMin                [2]float64 `json:"uiMin"`
	UiMax                [2]float64 `json:"uiMax"`
	WMODoodadPlacementID int32      `json:"wmoDoodadPlacementID,omitempty"`
	WMOGroupID           int32      `json:"wmoGroupID,omitempty"`
}

type wowMapArtAssociation struct {
	PhaseID int32            `json:"phaseID"`
	ArtID   int32            `json:"artID"`
	StyleID int32            `json:"styleID"`
	Layers  []wowMapArtLayer `json:"layers"`
}

type wowMapArtLayer struct {
	Index               int32        `json:"index"`
	Width               int32        `json:"width"`
	Height              int32        `json:"height"`
	TileWidth           int32        `json:"tileWidth"`
	TileHeight          int32        `json:"tileHeight"`
	MinScale            float64      `json:"minScale"`
	MaxScale            float64      `json:"maxScale"`
	AdditionalZoomSteps int32        `json:"additionalZoomSteps"`
	Tiles               []wowMapTile `json:"tiles"`
}

type wowMapTile struct {
	Row        int32  `json:"row"`
	Column     int32  `json:"column"`
	FileDataID int32  `json:"fileDataID"`
	Path       string `json:"path"`
}

type wowdataUiMap struct {
	ID            int32  `json:"ID"`
	Name          string `json:"Name_lang"`
	ParentUiMapID int32  `json:"ParentUiMapID"`
	Type          int32  `json:"Type"`
	Flags         int32  `json:"Flags"`
}

type wowdataUiMapAssignment struct {
	ID                   int32      `json:"ID"`
	AreaID               int32      `json:"AreaID"`
	MapID                int32      `json:"MapID"`
	OrderIndex           int32      `json:"OrderIndex"`
	Region               [6]float64 `json:"Region"`
	UiMapID              int32      `json:"UiMapID"`
	UiMin                [2]float64 `json:"UiMin"`
	UiMax                [2]float64 `json:"UiMax"`
	WMODoodadPlacementID int32      `json:"WMODoodadPlacementID"`
	WMOGroupID           int32      `json:"WMOGroupID"`
}

type wowdataUiMapXMapArt struct {
	ID         int32 `json:"ID"`
	PhaseID    int32 `json:"PhaseID"`
	UiMapArtID int32 `json:"UiMapArtID"`
	UiMapID    int32 `json:"UiMapID"`
}

type wowdataUiMapArt struct {
	ID              int32 `json:"ID"`
	UiMapArtStyleID int32 `json:"UiMapArtStyleID"`
}

type wowdataUiMapArtStyleLayer struct {
	ID                  int32   `json:"ID"`
	UiMapArtStyleID     int32   `json:"UiMapArtStyleID"`
	LayerIndex          int32   `json:"LayerIndex"`
	LayerWidth          int32   `json:"LayerWidth"`
	LayerHeight         int32   `json:"LayerHeight"`
	TileWidth           int32   `json:"TileWidth"`
	TileHeight          int32   `json:"TileHeight"`
	MinScale            float64 `json:"MinScale"`
	MaxScale            float64 `json:"MaxScale"`
	AdditionalZoomSteps int32   `json:"AdditionalZoomSteps"`
}

type wowdataUiMapArtTile struct {
	ID         int32 `json:"ID"`
	ColIndex   int32 `json:"ColIndex"`
	RowIndex   int32 `json:"RowIndex"`
	LayerIndex int32 `json:"LayerIndex"`
	FileDataID int32 `json:"FileDataID"`
	UiMapArtID int32 `json:"UiMapArtID"`
}

type wowdataStreamEnvelope struct {
	OK      bool   `json:"ok"`
	Command string `json:"command"`
	Data    struct {
		Row json.RawMessage `json:"row"`
	} `json:"data"`
}

type wowMapSource struct {
	Maps        []wowdataUiMap
	Assignments []wowdataUiMapAssignment
	Links       []wowdataUiMapXMapArt
	Art         []wowdataUiMapArt
	Layers      []wowdataUiMapArtStyleLayer
	Tiles       []wowdataUiMapArtTile
}

type wowMapExtractOptions struct {
	WowdataBin   string
	OutDir       string
	Client       string
	Source       string
	Product      string
	Build        string
	Region       string
	Locale       string
	Cache        string
	MetadataOnly bool
}

// ExtractWowdataMapsCmd exports WoW Forever UI map artwork and a manifest that
// preserves the DB2 world-to-UI coordinate assignments used by C_Map.
func ExtractWowdataMapsCmd() *serpent.Command {
	var opts wowMapExtractOptions
	var dbcPath, server string

	return &serpent.Command{
		Use:   "extract-wowdata-maps",
		Short: "Extract WoW Forever UI map tiles and coordinate metadata.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "out", Description: "Output directory for manifest.json and map tiles.", Flag: "out", Value: serpent.StringOf(&opts.OutDir)},
			{Name: "wowdata", Description: "Wowdata executable. A pinned build is provisioned when omitted.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: wowdataDefaultBinary, Value: serpent.StringOf(&opts.WowdataBin)},
			{Name: "source", Description: "Read CASC data from local client archives or Blizzard's CDN.", Flag: "source", Default: "remote", Value: serpent.StringOf(&opts.Source)},
			{Name: "product", Description: "CASC product to extract.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&opts.Product)},
			{Name: "build", Description: "WoW Forever build to extract; latest is resolved and pinned for the run.", Flag: "build", Default: "latest", Value: serpent.StringOf(&opts.Build)},
			{Name: "region", Description: "Blizzard region.", Flag: "region", Env: "WOW_REGION", Default: "us", Value: serpent.StringOf(&opts.Region)},
			{Name: "locale", Description: "Data locale.", Flag: "locale", Env: "WOW_LOCALE", Default: "enUS", Value: serpent.StringOf(&opts.Locale)},
			{Name: "cache", Description: "Optional wowdata cache directory.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&opts.Cache)},
			{Name: "metadata-only", Description: "Write manifest.json without downloading map tiles.", Flag: "metadata-only", Value: serpent.BoolOf(&opts.MetadataOnly)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if opts.OutDir == "" {
				return fmt.Errorf("--out is required")
			}
			if opts.Build == "" {
				return fmt.Errorf("--build is required")
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
			return extractWowdataMaps(inv.Context(), inv.Stdout, inv.Stderr, opts)
		},
	}
}

func extractWowdataMaps(ctx context.Context, stdout, stderr io.Writer, opts wowMapExtractOptions) error {
	resolvedBuild, err := resolveWowdataBuild(ctx, stderr, opts)
	if err != nil {
		return err
	}
	if opts.Build != resolvedBuild {
		_, _ = fmt.Fprintf(stdout, "Resolved build %s to %s\n", opts.Build, resolvedBuild)
	}
	opts.Build = resolvedBuild

	var source wowMapSource
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMap", &source.Maps); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMapAssignment", &source.Assignments); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMapXMapArt", &source.Links); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMapArt", &source.Art); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMapArtStyleLayer", &source.Layers); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "UiMapArtTile", &source.Tiles); err != nil {
		return err
	}

	manifest, fileDataIDs, err := buildWowMapManifest(source, wowMapTarget{
		Product: opts.Product,
		Build:   opts.Build,
		Region:  opts.Region,
		Locale:  opts.Locale,
	})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(opts.OutDir, "tiles"), 0o755); err != nil {
		return fmt.Errorf("create map output directory: %w", err)
	}
	if !opts.MetadataOnly {
		for i, fileDataID := range fileDataIDs {
			output := filepath.Join(opts.OutDir, "tiles", fmt.Sprintf("%d.webp", fileDataID))
			if info, statErr := os.Stat(output); statErr == nil && info.Size() > 0 {
				continue
			}
			if err := exportWowdataTexture(ctx, stderr, opts, fileDataID, output); err != nil {
				return err
			}
			if (i+1)%100 == 0 || i+1 == len(fileDataIDs) {
				_, _ = fmt.Fprintf(stdout, "Exported %d/%d map tiles\n", i+1, len(fileDataIDs))
			}
		}
	}
	if err := writeWowMapManifest(filepath.Join(opts.OutDir, "manifest.json"), manifest); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "Wrote %d maps referencing %d unique tiles to %s\n", len(manifest.Maps), len(fileDataIDs), opts.OutDir)
	return nil
}

func resolveWowdataBuild(ctx context.Context, stderr io.Writer, opts wowMapExtractOptions) (string, error) {
	args := append([]string{"casc", "info"}, wowdataTargetArgs(opts)...)
	cmd := exec.CommandContext(ctx, opts.WowdataBin, args...)
	cmd.Stderr = stderr
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("resolve wowdata build %q: %w", opts.Build, err)
	}
	var response struct {
		OK   bool `json:"ok"`
		Data struct {
			BuildName string `json:"buildName"`
		} `json:"data"`
	}
	if err := json.Unmarshal(output, &response); err != nil {
		return "", fmt.Errorf("decode wowdata build information: %w", err)
	}
	if !response.OK || response.Data.BuildName == "" {
		return "", fmt.Errorf("wowdata did not resolve build %q", opts.Build)
	}
	return response.Data.BuildName, nil
}

func wowdataTargetArgs(opts wowMapExtractOptions) []string {
	args := []string{
		"--source", opts.Source,
		"--region", opts.Region,
		"--product", opts.Product,
		"--build", opts.Build,
		"--locale", opts.Locale,
	}
	if opts.Source == "local" {
		args = append(args, "--path", opts.Client)
	}
	if opts.Cache != "" {
		args = append(args, "--cache", opts.Cache)
	}
	return args
}

func readWowMapTable[T any](ctx context.Context, stdout, stderr io.Writer, opts wowMapExtractOptions, table string, rows *[]T) error {
	if _, err := fmt.Fprintf(stdout, "Reading %s...\n", table); err != nil {
		return err
	}
	args := append([]string{"db2", "stream", table}, wowdataTargetArgs(opts)...)
	cmd := exec.CommandContext(ctx, opts.WowdataBin, args...)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("read wowdata %s output: %w", table, err)
	}
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start wowdata %s stream: %w", table, err)
	}

	scanner := bufio.NewScanner(pipe)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	for scanner.Scan() {
		var envelope wowdataStreamEnvelope
		if err := json.Unmarshal(scanner.Bytes(), &envelope); err != nil {
			_ = cmd.Wait()
			return fmt.Errorf("decode wowdata %s envelope: %w", table, err)
		}
		if !envelope.OK || len(envelope.Data.Row) == 0 {
			_ = cmd.Wait()
			return fmt.Errorf("wowdata %s returned an unsuccessful row", table)
		}
		var row T
		if err := json.Unmarshal(envelope.Data.Row, &row); err != nil {
			_ = cmd.Wait()
			return fmt.Errorf("decode wowdata %s row: %w", table, err)
		}
		*rows = append(*rows, row)
	}
	if err := scanner.Err(); err != nil {
		_ = cmd.Wait()
		return fmt.Errorf("scan wowdata %s output: %w", table, err)
	}
	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("stream wowdata %s: %w", table, err)
	}
	return nil
}

func exportWowdataTexture(ctx context.Context, stderr io.Writer, opts wowMapExtractOptions, fileDataID int32, output string) error {
	tmp := output + ".tmp"
	_ = os.Remove(tmp)
	args := []string{"icon", "export", "--file-data-id", fmt.Sprint(fileDataID), "--format", "webp", "--output", tmp}
	args = append(args, wowdataTargetArgs(opts)...)
	cmd := exec.CommandContext(ctx, opts.WowdataBin, args...)
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("export map tile FileDataID %d: %w", fileDataID, err)
	}
	if err := os.Rename(tmp, output); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("install map tile FileDataID %d: %w", fileDataID, err)
	}
	return nil
}

func buildWowMapManifest(source wowMapSource, target wowMapTarget) (wowMapManifest, []int32, error) {
	assignmentsByMap := make(map[int32][]wowMapAssignment)
	for _, assignment := range source.Assignments {
		assignmentsByMap[assignment.UiMapID] = append(assignmentsByMap[assignment.UiMapID], wowMapAssignment{
			ID: assignment.ID, MapID: assignment.MapID, AreaID: assignment.AreaID, OrderIndex: assignment.OrderIndex,
			Region: assignment.Region, UiMin: assignment.UiMin, UiMax: assignment.UiMax,
			WMODoodadPlacementID: assignment.WMODoodadPlacementID, WMOGroupID: assignment.WMOGroupID,
		})
	}
	for id := range assignmentsByMap {
		sort.Slice(assignmentsByMap[id], func(i, j int) bool { return assignmentsByMap[id][i].ID < assignmentsByMap[id][j].ID })
	}

	artByID := make(map[int32]wowdataUiMapArt, len(source.Art))
	for _, art := range source.Art {
		artByID[art.ID] = art
	}
	layersByStyle := make(map[int32][]wowdataUiMapArtStyleLayer)
	for _, layer := range source.Layers {
		layersByStyle[layer.UiMapArtStyleID] = append(layersByStyle[layer.UiMapArtStyleID], layer)
	}
	tilesByArtAndLayer := make(map[[2]int32][]wowMapTile)
	for _, tile := range source.Tiles {
		key := [2]int32{tile.UiMapArtID, tile.LayerIndex}
		tilesByArtAndLayer[key] = append(tilesByArtAndLayer[key], wowMapTile{
			Row: tile.RowIndex, Column: tile.ColIndex, FileDataID: tile.FileDataID,
			Path: fmt.Sprintf("tiles/%d.webp", tile.FileDataID),
		})
	}
	for key := range tilesByArtAndLayer {
		sort.Slice(tilesByArtAndLayer[key], func(i, j int) bool {
			left, right := tilesByArtAndLayer[key][i], tilesByArtAndLayer[key][j]
			if left.Row != right.Row {
				return left.Row < right.Row
			}
			if left.Column != right.Column {
				return left.Column < right.Column
			}
			return left.FileDataID < right.FileDataID
		})
	}

	linksByMap := make(map[int32][]wowdataUiMapXMapArt)
	for _, link := range source.Links {
		linksByMap[link.UiMapID] = append(linksByMap[link.UiMapID], link)
	}
	manifest := wowMapManifest{Format: wowMapManifestFormat, Target: target}
	fileDataIDSet := make(map[int32]struct{})
	for _, mapRow := range source.Maps {
		record := wowMapRecord{
			ID: mapRow.ID, Name: mapRow.Name, ParentID: mapRow.ParentUiMapID,
			Type: mapRow.Type, Flags: mapRow.Flags, Assignments: assignmentsByMap[mapRow.ID],
		}
		for _, link := range linksByMap[mapRow.ID] {
			art, ok := artByID[link.UiMapArtID]
			if !ok {
				return wowMapManifest{}, nil, fmt.Errorf("UiMap %d references missing UiMapArt %d", mapRow.ID, link.UiMapArtID)
			}
			association := wowMapArtAssociation{PhaseID: link.PhaseID, ArtID: art.ID, StyleID: art.UiMapArtStyleID}
			layers := append([]wowdataUiMapArtStyleLayer(nil), layersByStyle[art.UiMapArtStyleID]...)
			sort.Slice(layers, func(i, j int) bool { return layers[i].LayerIndex < layers[j].LayerIndex })
			for _, layer := range layers {
				tiles := tilesByArtAndLayer[[2]int32{art.ID, layer.LayerIndex}]
				for _, tile := range tiles {
					fileDataIDSet[tile.FileDataID] = struct{}{}
				}
				association.Layers = append(association.Layers, wowMapArtLayer{
					Index: layer.LayerIndex, Width: layer.LayerWidth, Height: layer.LayerHeight,
					TileWidth: layer.TileWidth, TileHeight: layer.TileHeight,
					MinScale: layer.MinScale, MaxScale: layer.MaxScale,
					AdditionalZoomSteps: layer.AdditionalZoomSteps,
					Tiles:               tiles,
				})
			}
			record.Art = append(record.Art, association)
		}
		sort.Slice(record.Art, func(i, j int) bool {
			if record.Art[i].PhaseID != record.Art[j].PhaseID {
				return record.Art[i].PhaseID < record.Art[j].PhaseID
			}
			return record.Art[i].ArtID < record.Art[j].ArtID
		})
		manifest.Maps = append(manifest.Maps, record)
	}
	sort.Slice(manifest.Maps, func(i, j int) bool { return manifest.Maps[i].ID < manifest.Maps[j].ID })
	fileDataIDs := make([]int32, 0, len(fileDataIDSet))
	for id := range fileDataIDSet {
		fileDataIDs = append(fileDataIDs, id)
	}
	sort.Slice(fileDataIDs, func(i, j int) bool { return fileDataIDs[i] < fileDataIDs[j] })
	return manifest, fileDataIDs, nil
}

func writeWowMapManifest(path string, manifest wowMapManifest) error {
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal map manifest: %w", err)
	}
	data = append(data, '\n')
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write map manifest: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("install map manifest: %w", err)
	}
	return nil
}
