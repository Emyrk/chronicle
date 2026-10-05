package cli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

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
	Format    string           `json:"format"`
	Target    wowMapTarget     `json:"target"`
	Maps      []wowMapRecord   `json:"maps"`
	Instances []wowMapInstance `json:"instances,omitempty"`
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
	PhaseID  int32              `json:"phaseID"`
	ArtID    int32              `json:"artID"`
	StyleID  int32              `json:"styleID"`
	Layers   []wowMapArtLayer   `json:"layers"`
	Overlays []wowMapArtOverlay `json:"overlays,omitempty"`
}

type wowMapArtOverlay struct {
	ID            int32        `json:"id"`
	OffsetX       int32        `json:"offsetX"`
	OffsetY       int32        `json:"offsetY"`
	TextureWidth  int32        `json:"textureWidth"`
	TextureHeight int32        `json:"textureHeight"`
	Tiles         []wowMapTile `json:"tiles"`
}

type wowMapInstance struct {
	MapID        int32                 `json:"mapID"`
	Name         string                `json:"name"`
	InstanceType int32                 `json:"instanceType"`
	Directory    string                `json:"directory"`
	Floors       []wowMapInstanceFloor `json:"floors"`
}

type wowMapInstanceFloor struct {
	Floor      int32        `json:"floor"`
	Width      int32        `json:"width"`
	Height     int32        `json:"height"`
	TileWidth  int32        `json:"tileWidth"`
	TileHeight int32        `json:"tileHeight"`
	Tiles      []wowMapTile `json:"tiles"`
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

type wowdataWorldMapOverlay struct {
	ID            int32 `json:"ID"`
	UiMapArtID    int32 `json:"UiMapArtID"`
	OffsetX       int32 `json:"OffsetX"`
	OffsetY       int32 `json:"OffsetY"`
	TextureWidth  int32 `json:"TextureWidth"`
	TextureHeight int32 `json:"TextureHeight"`
}

type wowdataWorldMapOverlayTile struct {
	ID                int32 `json:"ID"`
	WorldMapOverlayID int32 `json:"WorldMapOverlayID"`
	LayerIndex        int32 `json:"LayerIndex"`
	RowIndex          int32 `json:"RowIndex"`
	ColIndex          int32 `json:"ColIndex"`
	FileDataID        int32 `json:"FileDataID"`
}

type wowdataMap struct {
	ID           int32  `json:"ID"`
	Name         string `json:"MapName_lang"`
	Directory    string `json:"Directory"`
	InstanceType int32  `json:"InstanceType"`
	ExpansionID  int32  `json:"ExpansionID"`
}

type wowdataFile struct {
	FileDataID int32  `json:"fileDataID"`
	FileName   string `json:"fileName"`
}

type wowdataStreamEnvelope struct {
	OK      bool   `json:"ok"`
	Command string `json:"command"`
	Data    struct {
		Row json.RawMessage `json:"row"`
	} `json:"data"`
}

type wowMapSource struct {
	Maps         []wowdataUiMap
	Assignments  []wowdataUiMapAssignment
	Links        []wowdataUiMapXMapArt
	Art          []wowdataUiMapArt
	Layers       []wowdataUiMapArtStyleLayer
	Tiles        []wowdataUiMapArtTile
	Overlays     []wowdataWorldMapOverlay
	OverlayTiles []wowdataWorldMapOverlayTile
	WorldMaps    []wowdataMap
	Files        []wowdataFile
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
	if err := readWowMapTable(ctx, stdout, stderr, opts, "WorldMapOverlay", &source.Overlays); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "WorldMapOverlayTile", &source.OverlayTiles); err != nil {
		return err
	}
	if err := readWowMapTable(ctx, stdout, stderr, opts, "Map", &source.WorldMaps); err != nil {
		return err
	}
	if err := readWowMapFiles(ctx, stdout, stderr, opts, &source.Files); err != nil {
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
		unavailable := make(map[int32]struct{})
		for i, fileDataID := range fileDataIDs {
			output := filepath.Join(opts.OutDir, "tiles", fmt.Sprintf("%d.webp", fileDataID))
			if info, statErr := os.Stat(output); statErr == nil && info.Size() > 0 {
				continue
			}
			if err := exportWowdataTexture(ctx, stderr, opts, fileDataID, output); err != nil {
				if errors.Is(err, errWowdataFileUnavailable) {
					unavailable[fileDataID] = struct{}{}
					continue
				}
				return err
			}
			if (i+1)%100 == 0 || i+1 == len(fileDataIDs) {
				_, _ = fmt.Fprintf(stdout, "Exported %d/%d map tiles\n", i+1, len(fileDataIDs))
			}
		}
		skippedFloors, err := pruneUnavailableWowMapTiles(&manifest, unavailable)
		if err != nil {
			return err
		}
		for _, floor := range skippedFloors {
			_, _ = fmt.Fprintf(stdout, "Skipped unavailable instance map floor %s\n", floor)
		}
		fileDataIDs = wowMapManifestFileDataIDs(manifest)
	}
	if err := writeWowMapManifest(filepath.Join(opts.OutDir, "manifest.json"), manifest); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "Wrote %d maps and %d instances referencing %d unique tiles to %s\n", len(manifest.Maps), len(manifest.Instances), len(fileDataIDs), opts.OutDir)
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

func readWowMapFiles(ctx context.Context, stdout, stderr io.Writer, opts wowMapExtractOptions, files *[]wowdataFile) error {
	if _, err := fmt.Fprintln(stdout, "Reading instance map artwork..."); err != nil {
		return err
	}
	args := []string{"file", "search", "--query", "interface/worldmap/", "--limit", "100000"}
	args = append(args, wowdataTargetArgs(opts)...)
	cmd := exec.CommandContext(ctx, opts.WowdataBin, args...)
	cmd.Stderr = stderr
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("search wowdata world map files: %w", err)
	}
	var response struct {
		OK   bool `json:"ok"`
		Data struct {
			Files []wowdataFile `json:"files"`
		} `json:"data"`
	}
	if err := json.Unmarshal(output, &response); err != nil {
		return fmt.Errorf("decode wowdata world map files: %w", err)
	}
	if !response.OK {
		return fmt.Errorf("wowdata world map file search failed")
	}
	*files = response.Data.Files
	return nil
}

var errWowdataFileUnavailable = errors.New("wowdata file unavailable for locale")

type wowdataErrorResponse struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func exportWowdataTexture(ctx context.Context, stderr io.Writer, opts wowMapExtractOptions, fileDataID int32, output string) error {
	tmp := output + ".tmp"
	_ = os.Remove(tmp)
	args := []string{"icon", "export", "--file-data-id", fmt.Sprint(fileDataID), "--format", "webp", "--output", tmp}
	args = append(args, wowdataTargetArgs(opts)...)
	cmd := exec.CommandContext(ctx, opts.WowdataBin, args...)
	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		_ = os.Remove(tmp)
		var response wowdataErrorResponse
		if json.Unmarshal(stdout.Bytes(), &response) == nil && response.Error.Code == "not_found" {
			return fmt.Errorf("%w: FileDataID %d: %s", errWowdataFileUnavailable, fileDataID, response.Error.Message)
		}
		if stdout.Len() > 0 {
			_, _ = stderr.Write(stdout.Bytes())
		}
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
	overlayTilesByID := make(map[int32][]wowMapTile)
	for _, tile := range source.OverlayTiles {
		if tile.LayerIndex != 0 {
			continue
		}
		overlayTilesByID[tile.WorldMapOverlayID] = append(overlayTilesByID[tile.WorldMapOverlayID], wowMapTile{
			Row: tile.RowIndex, Column: tile.ColIndex, FileDataID: tile.FileDataID,
			Path: fmt.Sprintf("tiles/%d.webp", tile.FileDataID),
		})
	}
	for id := range overlayTilesByID {
		sort.Slice(overlayTilesByID[id], func(i, j int) bool {
			left, right := overlayTilesByID[id][i], overlayTilesByID[id][j]
			if left.Row != right.Row {
				return left.Row < right.Row
			}
			if left.Column != right.Column {
				return left.Column < right.Column
			}
			return left.FileDataID < right.FileDataID
		})
	}
	overlaysByArt := make(map[int32][]wowMapArtOverlay)
	for _, overlay := range source.Overlays {
		tiles := overlayTilesByID[overlay.ID]
		if len(tiles) == 0 {
			continue
		}
		overlaysByArt[overlay.UiMapArtID] = append(overlaysByArt[overlay.UiMapArtID], wowMapArtOverlay{
			ID: overlay.ID, OffsetX: overlay.OffsetX, OffsetY: overlay.OffsetY,
			TextureWidth: overlay.TextureWidth, TextureHeight: overlay.TextureHeight, Tiles: tiles,
		})
	}
	for artID := range overlaysByArt {
		sort.Slice(overlaysByArt[artID], func(i, j int) bool { return overlaysByArt[artID][i].ID < overlaysByArt[artID][j].ID })
	}

	linksByMap := make(map[int32][]wowdataUiMapXMapArt)
	for _, link := range source.Links {
		linksByMap[link.UiMapID] = append(linksByMap[link.UiMapID], link)
	}
	manifest := wowMapManifest{Format: wowMapManifestFormat, Target: target}
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
			association := wowMapArtAssociation{
				PhaseID: link.PhaseID, ArtID: art.ID, StyleID: art.UiMapArtStyleID,
				Overlays: overlaysByArt[art.ID],
			}
			layers := append([]wowdataUiMapArtStyleLayer(nil), layersByStyle[art.UiMapArtStyleID]...)
			sort.Slice(layers, func(i, j int) bool { return layers[i].LayerIndex < layers[j].LayerIndex })
			for _, layer := range layers {
				tiles := tilesByArtAndLayer[[2]int32{art.ID, layer.LayerIndex}]
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
	manifest.Instances = buildWowMapInstances(source.WorldMaps, source.Files)
	return manifest, wowMapManifestFileDataIDs(manifest), nil
}

func wowMapManifestFileDataIDs(manifest wowMapManifest) []int32 {
	fileDataIDSet := make(map[int32]struct{})
	for _, mapRecord := range manifest.Maps {
		for _, art := range mapRecord.Art {
			for _, layer := range art.Layers {
				for _, tile := range layer.Tiles {
					fileDataIDSet[tile.FileDataID] = struct{}{}
				}
			}
			for _, overlay := range art.Overlays {
				for _, tile := range overlay.Tiles {
					fileDataIDSet[tile.FileDataID] = struct{}{}
				}
			}
		}
	}
	for _, instance := range manifest.Instances {
		for _, floor := range instance.Floors {
			for _, tile := range floor.Tiles {
				fileDataIDSet[tile.FileDataID] = struct{}{}
			}
		}
	}
	fileDataIDs := make([]int32, 0, len(fileDataIDSet))
	for id := range fileDataIDSet {
		fileDataIDs = append(fileDataIDs, id)
	}
	sort.Slice(fileDataIDs, func(i, j int) bool { return fileDataIDs[i] < fileDataIDs[j] })
	return fileDataIDs
}

func pruneUnavailableWowMapTiles(manifest *wowMapManifest, unavailable map[int32]struct{}) ([]string, error) {
	if len(unavailable) == 0 {
		return nil, nil
	}
	for _, mapRecord := range manifest.Maps {
		for _, art := range mapRecord.Art {
			for _, layer := range art.Layers {
				for _, tile := range layer.Tiles {
					if _, missing := unavailable[tile.FileDataID]; missing {
						return nil, fmt.Errorf("UI map %d art %d references unavailable FileDataID %d", mapRecord.ID, art.ArtID, tile.FileDataID)
					}
				}
			}
			for _, overlay := range art.Overlays {
				for _, tile := range overlay.Tiles {
					if _, missing := unavailable[tile.FileDataID]; missing {
						return nil, fmt.Errorf("UI map %d overlay %d references unavailable FileDataID %d", mapRecord.ID, overlay.ID, tile.FileDataID)
					}
				}
			}
		}
	}

	var skipped []string
	instances := manifest.Instances[:0]
	for _, instance := range manifest.Instances {
		floors := instance.Floors[:0]
		for _, floor := range instance.Floors {
			missing := false
			for _, tile := range floor.Tiles {
				if _, unavailable := unavailable[tile.FileDataID]; unavailable {
					missing = true
					break
				}
			}
			if missing {
				skipped = append(skipped, fmt.Sprintf("%q floor %d", instance.Name, floor.Floor))
				continue
			}
			floors = append(floors, floor)
		}
		instance.Floors = floors
		if len(instance.Floors) > 0 {
			instances = append(instances, instance)
		}
	}
	manifest.Instances = instances
	return skipped, nil
}

var nonAlphaNumeric = regexp.MustCompile(`[^a-z0-9]+`)
var trailingNumber = regexp.MustCompile(`([0-9]+)$`)

var instanceMapAliases = map[int32][]string{
	109: {"thetempleofatalhakkar"},
}

type wowMapInstanceAsset struct {
	Directory string
	Floors    map[int32]map[int32]wowMapTile
}

func buildWowMapInstances(maps []wowdataMap, files []wowdataFile) []wowMapInstance {
	assets := make(map[string]*wowMapInstanceAsset)
	for _, file := range files {
		directory, floor, tileIndex, ok := parseWowMapInstanceTile(file.FileName)
		if !ok {
			continue
		}
		key := normalizeWowMapName(directory)
		asset := assets[key]
		if asset == nil {
			asset = &wowMapInstanceAsset{Directory: directory, Floors: make(map[int32]map[int32]wowMapTile)}
			assets[key] = asset
		}
		if asset.Floors[floor] == nil {
			asset.Floors[floor] = make(map[int32]wowMapTile)
		}
		asset.Floors[floor][tileIndex] = wowMapTile{
			Row: (tileIndex - 1) / 4, Column: (tileIndex - 1) % 4,
			FileDataID: file.FileDataID, Path: fmt.Sprintf("tiles/%d.webp", file.FileDataID),
		}
	}

	sortedMaps := append([]wowdataMap(nil), maps...)
	sort.Slice(sortedMaps, func(i, j int) bool { return sortedMaps[i].ID < sortedMaps[j].ID })
	claimedAssets := make(map[string]struct{})
	instances := make([]wowMapInstance, 0)
	for _, mapRow := range sortedMaps {
		if mapRow.ExpansionID != 0 || (mapRow.InstanceType != 1 && mapRow.InstanceType != 2) {
			continue
		}
		candidates := append([]string(nil), instanceMapAliases[mapRow.ID]...)
		candidates = append(candidates, normalizeWowMapName(mapRow.Name), normalizeWowMapName(mapRow.Directory))
		var asset *wowMapInstanceAsset
		var assetKey string
		for _, candidate := range candidates {
			candidate = normalizeWowMapName(candidate)
			if candidate == "" {
				continue
			}
			if _, claimed := claimedAssets[candidate]; claimed {
				continue
			}
			if assets[candidate] != nil {
				asset, assetKey = assets[candidate], candidate
				break
			}
		}
		if asset == nil {
			continue
		}

		instance := wowMapInstance{
			MapID: mapRow.ID, Name: mapRow.Name, InstanceType: mapRow.InstanceType, Directory: asset.Directory,
		}
		floorNumbers := make([]int32, 0, len(asset.Floors))
		for floor := range asset.Floors {
			floorNumbers = append(floorNumbers, floor)
		}
		sort.Slice(floorNumbers, func(i, j int) bool { return floorNumbers[i] < floorNumbers[j] })
		for _, floorNumber := range floorNumbers {
			tilesByIndex := asset.Floors[floorNumber]
			if len(tilesByIndex) != 12 {
				continue
			}
			floor := wowMapInstanceFloor{
				Floor: floorNumber, Width: 1002, Height: 668, TileWidth: 256, TileHeight: 256,
			}
			for tileIndex := int32(1); tileIndex <= 12; tileIndex++ {
				tile, ok := tilesByIndex[tileIndex]
				if !ok {
					floor.Tiles = nil
					break
				}
				floor.Tiles = append(floor.Tiles, tile)
			}
			if len(floor.Tiles) == 12 {
				instance.Floors = append(instance.Floors, floor)
			}
		}
		if len(instance.Floors) == 0 {
			continue
		}
		claimedAssets[assetKey] = struct{}{}
		instances = append(instances, instance)
	}
	sort.Slice(instances, func(i, j int) bool {
		if instances[i].Name != instances[j].Name {
			return instances[i].Name < instances[j].Name
		}
		return instances[i].MapID < instances[j].MapID
	})
	return instances
}

var legacySingleFloorInstanceDirectories = map[string]struct{}{
	"ruinsofahnqiraj": {},
	"zulfarrak":       {},
	"zulgurub":        {},
}

func parseWowMapInstanceTile(fileName string) (directory string, floor, tileIndex int32, ok bool) {
	const prefix = "interface/worldmap/"
	fileName = strings.ToLower(fileName)
	if !strings.HasPrefix(fileName, prefix) || !strings.HasSuffix(fileName, ".blp") {
		return "", 0, 0, false
	}
	parts := strings.Split(strings.TrimSuffix(strings.TrimPrefix(fileName, prefix), ".blp"), "/")
	if len(parts) != 2 {
		return "", 0, 0, false
	}
	directory, base := parts[0], parts[1]
	if underscore := strings.LastIndexByte(base, '_'); underscore >= 0 {
		floorValue, floorOK := parseTrailingWowMapNumber(base[:underscore])
		tileValue, tileOK := parseWowMapNumber(base[underscore+1:])
		if !floorOK || !tileOK || tileValue < 1 || tileValue > 12 {
			return "", 0, 0, false
		}
		return directory, floorValue, tileValue, true
	}
	if _, allowed := legacySingleFloorInstanceDirectories[directory]; !allowed {
		return "", 0, 0, false
	}
	tileValue, tileOK := parseTrailingWowMapNumber(base)
	if !tileOK || tileValue < 1 || tileValue > 12 {
		return "", 0, 0, false
	}
	return directory, 1, tileValue, true
}

func parseTrailingWowMapNumber(value string) (int32, bool) {
	match := trailingNumber.FindStringSubmatch(value)
	if len(match) != 2 {
		return 0, false
	}
	return parseWowMapNumber(match[1])
}

func parseWowMapNumber(value string) (int32, bool) {
	parsed, err := strconv.ParseInt(value, 10, 32)
	return int32(parsed), err == nil
}

func normalizeWowMapName(value string) string {
	return nonAlphaNumeric.ReplaceAllString(strings.ToLower(value), "")
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
