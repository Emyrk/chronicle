package cli

import (
	"context"
	"fmt"
	"hash/fnv"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/database/gamedb/dbcdb"
	"github.com/Gophercraft/core/format/blp"
	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/HugoSmits86/nativewebp"
	"github.com/coder/serpent"
)

type legacyMapFile struct {
	FileDataID int32
	FileName   string
}

// ExtractLegacyMapsCmd exports map artwork from MPQ-era WoW clients.
func ExtractLegacyMapsCmd() *serpent.Command {
	var dbcPath, server, outDir string
	var metadataOnly bool
	return &serpent.Command{
		Use:   "extract-legacy-maps",
		Short: "Extract UI map tiles and coordinate metadata from an MPQ-era WoW client.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "out", Description: "Output directory for manifest.json and map tiles.", Flag: "out", Value: serpent.StringOf(&outDir)},
			{Name: "metadata-only", Description: "Write manifest.json without converting map tiles.", Flag: "metadata-only", Value: serpent.BoolOf(&metadataOnly)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if outDir == "" {
				return fmt.Errorf("--out is required")
			}
			clientPath, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			client, err := dbcdb.New(clientPath)
			if err != nil {
				return fmt.Errorf("open WoW client: %w", err)
			}
			defer func() {
				_ = client.Close()
			}()
			return extractLegacyMaps(inv.Context(), inv.Stdout, client, clientPath, server, outDir, metadataOnly)
		},
	}
}

func extractLegacyMaps(ctx context.Context, stdout io.Writer, client *dbcdb.WoWClient, clientPath, server, outDir string, metadataOnly bool) error {
	files, err := client.ListFiles()
	if err != nil {
		return fmt.Errorf("list client files: %w", err)
	}
	fileIndex := make(map[string]string, len(files))
	for _, file := range files {
		fileIndex[normalizeLegacyMapPath(file)] = file
	}

	fallback, fallbackErr := newMPQFallback(clientPath)
	if fallbackErr == nil {
		defer fallback.Close()
	} else {
		_, _ = fmt.Fprintf(stdout, "Warning: MPQ fallback unavailable: %v\n", fallbackErr)
	}
	directFiles := make(map[string][]byte)
	resolveFile := func(path string) (string, bool) {
		normalized := normalizeLegacyMapPath(path)
		if original, ok := fileIndex[normalized]; ok {
			return original, true
		}
		if fallback == nil {
			return "", false
		}
		archivePath := strings.ReplaceAll(path, "/", `\`)
		data, err := fallback.ReadFile(archivePath)
		if err != nil {
			return "", false
		}
		directFiles[normalized] = data
		fileIndex[normalized] = archivePath
		return archivePath, true
	}

	areas, err := client.WorldMapArea()
	if err != nil {
		return fmt.Errorf("read WorldMapArea.dbc: %w", err)
	}
	overlays, err := client.WorldMapOverlay()
	if err != nil {
		return fmt.Errorf("read WorldMapOverlay.dbc: %w", err)
	}
	areaNames, err := legacyAreaNames(client)
	if err != nil {
		return err
	}
	worldMaps, err := legacyWorldMaps(client)
	if err != nil {
		return err
	}

	var areaRows []dbdefs.Ent_WorldMapArea
	if err := areas.Range(func(row *dbdefs.Ent_WorldMapArea) bool {
		areaRows = append(areaRows, *row)
		return true
	}); err != nil {
		return fmt.Errorf("iterate WorldMapArea.dbc: %w", err)
	}
	var overlayRows []dbdefs.Ent_WorldMapOverlay
	if err := overlays.Range(func(row *dbdefs.Ent_WorldMapOverlay) bool {
		overlayRows = append(overlayRows, *row)
		return true
	}); err != nil {
		return fmt.Errorf("iterate WorldMapOverlay.dbc: %w", err)
	}

	manifest, sourcePaths, err := buildLegacyMapManifest(areaRows, overlayRows, areaNames, worldMaps, fileIndex, resolveFile, wowMapTarget{
		Product: server,
		Build:   client.Build().String(),
	})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(outDir, "tiles"), 0o755); err != nil {
		return fmt.Errorf("create legacy map output directory: %w", err)
	}

	fileDataIDs := wowMapManifestFileDataIDs(manifest)
	if metadataOnly {
		if err := writeWowMapManifest(filepath.Join(outDir, "manifest.json"), manifest); err != nil {
			return err
		}
		_, _ = fmt.Fprintf(stdout, "Wrote %d maps and %d instances referencing %d unique tiles to %s\n",
			len(manifest.Maps), len(manifest.Instances), len(fileDataIDs), outDir)
		return nil
	}

	readFile := func(path string) ([]byte, error) {
		if data, ok := directFiles[normalizeLegacyMapPath(path)]; ok {
			return data, nil
		}
		data, err := client.ReadFile(path)
		if err == nil {
			return data, nil
		}
		if fallback != nil {
			return fallback.ReadFile(path)
		}
		return nil, err
	}

	unavailable := make(map[int32]struct{})
	for i, fileDataID := range fileDataIDs {
		if err := ctx.Err(); err != nil {
			return err
		}
		output := filepath.Join(outDir, "tiles", fmt.Sprintf("%d.webp", fileDataID))
		if info, statErr := os.Stat(output); statErr == nil && info.Size() > 0 {
			continue
		}
		sourcePath, ok := sourcePaths[fileDataID]
		if !ok {
			return fmt.Errorf("missing source path for legacy map tile %d", fileDataID)
		}
		data, err := readFile(sourcePath)
		if err != nil {
			unavailable[fileDataID] = struct{}{}
			_, _ = fmt.Fprintf(stdout, "Skipping unavailable legacy map tile %s: %v\n", sourcePath, err)
			continue
		}
		image, err := blp.DecodeBytes(data)
		if err != nil {
			unavailable[fileDataID] = struct{}{}
			_, _ = fmt.Fprintf(stdout, "Skipping unreadable legacy map tile %s: %v\n", sourcePath, err)
			continue
		}
		tmp := output + ".tmp"
		out, err := os.Create(tmp)
		if err != nil {
			return fmt.Errorf("create legacy map tile %s: %w", output, err)
		}
		encodeErr := nativewebp.Encode(out, image, nil)
		closeErr := out.Close()
		if encodeErr != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("encode legacy map tile %s: %w", sourcePath, encodeErr)
		}
		if closeErr != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("close legacy map tile %s: %w", output, closeErr)
		}
		if err := os.Rename(tmp, output); err != nil {
			_ = os.Remove(tmp)
			return fmt.Errorf("install legacy map tile %s: %w", output, err)
		}
		if (i+1)%100 == 0 || i+1 == len(fileDataIDs) {
			_, _ = fmt.Fprintf(stdout, "Exported %d/%d legacy map tiles\n", i+1, len(fileDataIDs))
		}
	}
	for _, skipped := range pruneUnavailableLegacyMapTiles(&manifest, unavailable) {
		_, _ = fmt.Fprintf(stdout, "Skipped incomplete legacy map artwork %s\n", skipped)
	}
	fileDataIDs = wowMapManifestFileDataIDs(manifest)
	if err := writeWowMapManifest(filepath.Join(outDir, "manifest.json"), manifest); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "Wrote %d maps and %d instances referencing %d unique tiles to %s\n",
		len(manifest.Maps), len(manifest.Instances), len(fileDataIDs), outDir)
	return nil
}

func legacyAreaNames(client *dbcdb.WoWClient) (map[int32]string, error) {
	table, err := client.AreaTable()
	if err != nil {
		return nil, fmt.Errorf("read AreaTable.dbc: %w", err)
	}
	names := make(map[int32]string)
	if err := table.Range(func(row *dbdefs.Ent_AreaTable) bool {
		name := row.AreaName_lang.String()
		if name != "" && name != "<empty>" {
			names[row.ID] = name
		}
		return true
	}); err != nil {
		return nil, fmt.Errorf("iterate AreaTable.dbc: %w", err)
	}
	return names, nil
}

func legacyWorldMaps(client *dbcdb.WoWClient) ([]wowdataMap, error) {
	table, err := client.Map()
	if err != nil {
		return nil, fmt.Errorf("read Map.dbc: %w", err)
	}
	var maps []wowdataMap
	if err := table.Range(func(row *dbdefs.Ent_Map) bool {
		maps = append(maps, wowdataMap{
			ID: row.ID, Name: row.MapName_lang.String(), Directory: row.Directory,
			InstanceType: row.InstanceType, ExpansionID: row.ExpansionID,
		})
		return true
	}); err != nil {
		return nil, fmt.Errorf("iterate Map.dbc: %w", err)
	}
	return maps, nil
}

func pruneUnavailableLegacyMapTiles(manifest *wowMapManifest, unavailable map[int32]struct{}) []string {
	if len(unavailable) == 0 {
		return nil
	}
	containsUnavailable := func(tiles []wowMapTile) bool {
		for _, tile := range tiles {
			if _, missing := unavailable[tile.FileDataID]; missing {
				return true
			}
		}
		return false
	}

	var skipped []string
	maps := manifest.Maps[:0]
	for _, mapRecord := range manifest.Maps {
		artRecords := mapRecord.Art[:0]
		for _, art := range mapRecord.Art {
			layers := art.Layers[:0]
			for _, layer := range art.Layers {
				if containsUnavailable(layer.Tiles) {
					skipped = append(skipped, fmt.Sprintf("%q base layer", mapRecord.Name))
					continue
				}
				layers = append(layers, layer)
			}
			art.Layers = layers
			overlays := art.Overlays[:0]
			for _, overlay := range art.Overlays {
				if containsUnavailable(overlay.Tiles) {
					skipped = append(skipped, fmt.Sprintf("%q overlay %d", mapRecord.Name, overlay.ID))
					continue
				}
				overlays = append(overlays, overlay)
			}
			art.Overlays = overlays
			if len(art.Layers) > 0 {
				artRecords = append(artRecords, art)
			}
		}
		mapRecord.Art = artRecords
		if len(mapRecord.Art) > 0 {
			maps = append(maps, mapRecord)
		}
	}
	manifest.Maps = maps

	instances := manifest.Instances[:0]
	for _, instance := range manifest.Instances {
		floors := instance.Floors[:0]
		for _, floor := range instance.Floors {
			if containsUnavailable(floor.Tiles) {
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
	return skipped
}

func buildLegacyMapManifest(
	areas []dbdefs.Ent_WorldMapArea,
	overlays []dbdefs.Ent_WorldMapOverlay,
	areaNames map[int32]string,
	worldMaps []wowdataMap,
	fileIndex map[string]string,
	resolveFile func(string) (string, bool),
	target wowMapTarget,
) (wowMapManifest, map[int32]string, error) {
	overlaysByArea := make(map[int32][]dbdefs.Ent_WorldMapOverlay)
	for _, row := range overlays {
		overlaysByArea[row.MapAreaID] = append(overlaysByArea[row.MapAreaID], row)
	}
	for areaID := range overlaysByArea {
		sort.Slice(overlaysByArea[areaID], func(i, j int) bool {
			return overlaysByArea[areaID][i].ID < overlaysByArea[areaID][j].ID
		})
	}

	manifest := wowMapManifest{Format: wowMapManifestFormat, Target: target}
	sourcePaths := make(map[int32]string)
	for _, row := range areas {
		baseTiles, ok := legacyMapTiles(resolveFile, row.AreaName, row.AreaName, 4, 3, sourcePaths)
		if !ok {
			continue
		}
		name := areaNames[row.AreaID]
		if name == "" {
			name = row.AreaName
		}
		record := wowMapRecord{
			ID: row.ID, Name: name, ParentID: row.ParentWorldMapID, Type: 3,
			Assignments: []wowMapAssignment{{
				ID: row.ID, MapID: row.MapID, AreaID: row.AreaID,
				Region: [6]float64{float64(row.LocBottom), float64(row.LocRight), -1000000, float64(row.LocTop), float64(row.LocLeft), 1000000},
				UiMin:  [2]float64{0, 0}, UiMax: [2]float64{1, 1},
			}},
		}
		association := wowMapArtAssociation{
			ArtID: row.ID, StyleID: 1,
			Layers: []wowMapArtLayer{{
				Index: 0, Width: 1002, Height: 668, TileWidth: 256, TileHeight: 256,
				MinScale: 1, MaxScale: 2.14, AdditionalZoomSteps: 2, Tiles: baseTiles,
			}},
		}
		for _, overlay := range overlaysByArea[row.ID] {
			columns := int32(math.Ceil(float64(overlay.TextureWidth) / 256))
			rows := int32(math.Ceil(float64(overlay.TextureHeight) / 256))
			if columns == 0 || rows == 0 || overlay.TextureName == "" {
				continue
			}
			tiles, ok := legacyMapTiles(resolveFile, row.AreaName, overlay.TextureName, columns, rows, sourcePaths)
			if !ok {
				continue
			}
			association.Overlays = append(association.Overlays, wowMapArtOverlay{
				ID: overlay.ID, OffsetX: overlay.OffsetX, OffsetY: overlay.OffsetY,
				TextureWidth: overlay.TextureWidth, TextureHeight: overlay.TextureHeight, Tiles: tiles,
			})
		}
		record.Art = []wowMapArtAssociation{association}
		manifest.Maps = append(manifest.Maps, record)
	}
	sort.Slice(manifest.Maps, func(i, j int) bool { return manifest.Maps[i].ID < manifest.Maps[j].ID })

	var instanceFiles []legacyMapFile
	for normalized, original := range fileIndex {
		if _, _, _, ok := parseLegacyMapInstanceTile(normalized); !ok {
			continue
		}
		id, err := registerLegacyMapPath(normalized, original, sourcePaths)
		if err != nil {
			return wowMapManifest{}, nil, err
		}
		instanceFiles = append(instanceFiles, legacyMapFile{FileDataID: id, FileName: normalized})
	}
	manifest.Instances = buildLegacyMapInstances(worldMaps, instanceFiles)
	return manifest, sourcePaths, nil
}

func legacyMapTiles(resolveFile func(string) (string, bool), directory, texture string, columns, rows int32, sourcePaths map[int32]string) ([]wowMapTile, bool) {
	tiles := make([]wowMapTile, 0, columns*rows)
	for row := int32(0); row < rows; row++ {
		for column := int32(0); column < columns; column++ {
			tileIndex := row*columns + column + 1
			expected := fmt.Sprintf("Interface/WorldMap/%s/%s%d.blp", directory, texture, tileIndex)
			normalized := normalizeLegacyMapPath(expected)
			original, ok := resolveFile(expected)
			if !ok {
				return nil, false
			}
			id, err := registerLegacyMapPath(normalized, original, sourcePaths)
			if err != nil {
				return nil, false
			}
			tiles = append(tiles, wowMapTile{
				Row: row, Column: column, FileDataID: id, Path: fmt.Sprintf("tiles/%d.webp", id),
			})
		}
	}
	return tiles, true
}

func registerLegacyMapPath(normalized, original string, sourcePaths map[int32]string) (int32, error) {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(normalized))
	id := int32(hash.Sum32() & math.MaxInt32)
	if id == 0 {
		id = 1
	}
	if previous, ok := sourcePaths[id]; ok && normalizeLegacyMapPath(previous) != normalized {
		return 0, fmt.Errorf("legacy map tile hash collision between %q and %q", previous, original)
	}
	sourcePaths[id] = original
	return id, nil
}

func normalizeLegacyMapPath(path string) string {
	return strings.ToLower(strings.ReplaceAll(path, `\`, "/"))
}

func parseLegacyMapInstanceTile(fileName string) (directory string, floor, tileIndex int32, ok bool) {
	const prefix = "interface/worldmap/"
	fileName = normalizeLegacyMapPath(fileName)
	if !strings.HasPrefix(fileName, prefix) || !strings.HasSuffix(fileName, ".blp") {
		return "", 0, 0, false
	}
	parts := strings.Split(strings.TrimSuffix(strings.TrimPrefix(fileName, prefix), ".blp"), "/")
	if len(parts) != 2 || strings.Contains(parts[1], "highlight") {
		return "", 0, 0, false
	}
	directory, base := parts[0], parts[1]
	if underscore := strings.LastIndexByte(base, '_'); underscore >= 0 {
		floorValue, floorOK := parseTrailingWowMapNumber(base[:underscore])
		tileValue, tileOK := parseWowMapNumber(base[underscore+1:])
		if floorOK && tileOK && tileValue >= 1 && tileValue <= 12 {
			return directory, floorValue, tileValue, true
		}
		return "", 0, 0, false
	}
	tileValue, tileOK := parseTrailingWowMapNumber(base)
	if !tileOK || tileValue < 1 || tileValue > 12 {
		return "", 0, 0, false
	}
	tileDigits := len(strconvFormatInt32(tileValue))
	stem := base[:len(base)-tileDigits]
	if normalizeWowMapName(stem) == normalizeWowMapName(directory) {
		return directory, 1, tileValue, true
	}
	floorValue, floorOK := parseTrailingWowMapNumber(stem)
	if !floorOK {
		return "", 0, 0, false
	}
	floorDigits := len(strconvFormatInt32(floorValue))
	if normalizeWowMapName(stem[:len(stem)-floorDigits]) != normalizeWowMapName(directory) {
		return "", 0, 0, false
	}
	return directory, floorValue, tileValue, true
}

func strconvFormatInt32(value int32) string {
	return fmt.Sprint(value)
}

func buildLegacyMapInstances(maps []wowdataMap, files []legacyMapFile) []wowMapInstance {
	assets := make(map[string]*wowMapInstanceAsset)
	for _, file := range files {
		directory, floor, tileIndex, ok := parseLegacyMapInstanceTile(file.FileName)
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
	var instances []wowMapInstance
	for _, mapRow := range sortedMaps {
		if mapRow.InstanceType != 1 && mapRow.InstanceType != 2 {
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
		var floorNumbers []int32
		for floor := range asset.Floors {
			floorNumbers = append(floorNumbers, floor)
		}
		sort.Slice(floorNumbers, func(i, j int) bool { return floorNumbers[i] < floorNumbers[j] })
		for _, floorNumber := range floorNumbers {
			tilesByIndex := asset.Floors[floorNumber]
			if len(tilesByIndex) != 12 {
				continue
			}
			floor := wowMapInstanceFloor{Floor: floorNumber, Width: 1002, Height: 668, TileWidth: 256, TileHeight: 256}
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
