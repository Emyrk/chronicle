package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBuildWowMapManifest(t *testing.T) {
	t.Parallel()

	source := wowMapSource{
		Maps: []wowdataUiMap{
			{ID: 1412, Name: "Mulgore", ParentUiMapID: 1414, Type: 3, Flags: 2},
			{ID: 1411, Name: "Durotar", ParentUiMapID: 1414, Type: 3, Flags: 2},
		},
		Assignments: []wowdataUiMapAssignment{
			{
				ID: 20, UiMapID: 1411, MapID: 1, AreaID: 14, OrderIndex: 2,
				Region: [6]float64{-1716.6666, -7249.9995, -1000000, 1808.3333, -1962.4999, 1000000},
				UiMin:  [2]float64{0, 0}, UiMax: [2]float64{1, 1},
			},
			{ID: 10, UiMapID: 1411, MapID: 1, AreaID: 14, OrderIndex: 1},
		},
		Links: []wowdataUiMapXMapArt{
			{ID: 2, UiMapID: 1411, UiMapArtID: 2169, PhaseID: 1},
			{ID: 1, UiMapID: 1411, UiMapArtID: 2168, PhaseID: 0},
		},
		Art: []wowdataUiMapArt{
			{ID: 2168, UiMapArtStyleID: 1},
			{ID: 2169, UiMapArtStyleID: 1},
			{ID: 9999, UiMapArtStyleID: 1},
		},
		Layers: []wowdataUiMapArtStyleLayer{
			{ID: 2, UiMapArtStyleID: 1, LayerIndex: 1, LayerWidth: 1002, LayerHeight: 668, TileWidth: 256, TileHeight: 256, MinScale: 1, MaxScale: 2.14, AdditionalZoomSteps: 2},
			{ID: 1, UiMapArtStyleID: 1, LayerIndex: 0, LayerWidth: 1002, LayerHeight: 668, TileWidth: 256, TileHeight: 256, MinScale: 1, MaxScale: 2.14},
		},
		Tiles: []wowdataUiMapArtTile{
			{ID: 3, UiMapArtID: 2168, LayerIndex: 0, RowIndex: 1, ColIndex: 0, FileDataID: 30},
			{ID: 2, UiMapArtID: 2168, LayerIndex: 0, RowIndex: 0, ColIndex: 1, FileDataID: 20},
			{ID: 1, UiMapArtID: 2168, LayerIndex: 0, RowIndex: 0, ColIndex: 0, FileDataID: 10},
			{ID: 4, UiMapArtID: 2169, LayerIndex: 1, RowIndex: 0, ColIndex: 0, FileDataID: 40},
			{ID: 5, UiMapArtID: 9999, LayerIndex: 0, RowIndex: 0, ColIndex: 0, FileDataID: 99},
		},
		Overlays: []wowdataWorldMapOverlay{
			{ID: 100, UiMapArtID: 2168, OffsetX: 64, OffsetY: 96, TextureWidth: 300, TextureHeight: 200},
		},
		OverlayTiles: []wowdataWorldMapOverlayTile{
			{ID: 2, WorldMapOverlayID: 100, LayerIndex: 0, RowIndex: 0, ColIndex: 1, FileDataID: 51},
			{ID: 1, WorldMapOverlayID: 100, LayerIndex: 0, RowIndex: 0, ColIndex: 0, FileDataID: 50},
		},
	}
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.60.1.70205", Region: "us", Locale: "enUS"}

	manifest, fileDataIDs, err := buildWowMapManifest(source, target)
	require.NoError(t, err)
	require.Equal(t, []int32{10, 20, 30, 40, 50, 51}, fileDataIDs, "unlinked artwork must not be exported")
	require.Equal(t, wowMapManifestFormat, manifest.Format)
	require.Equal(t, target, manifest.Target)
	require.Len(t, manifest.Maps, 2)
	require.Equal(t, int32(1411), manifest.Maps[0].ID)
	require.Equal(t, []int32{10, 20}, []int32{manifest.Maps[0].Assignments[0].ID, manifest.Maps[0].Assignments[1].ID})
	require.Equal(t, source.Assignments[0].Region, manifest.Maps[0].Assignments[1].Region)
	require.Equal(t, []int32{2168, 2169}, []int32{manifest.Maps[0].Art[0].ArtID, manifest.Maps[0].Art[1].ArtID})
	require.Equal(t, []int32{0, 1}, []int32{manifest.Maps[0].Art[0].Layers[0].Index, manifest.Maps[0].Art[0].Layers[1].Index})
	require.Equal(t, []int32{10, 20, 30}, []int32{
		manifest.Maps[0].Art[0].Layers[0].Tiles[0].FileDataID,
		manifest.Maps[0].Art[0].Layers[0].Tiles[1].FileDataID,
		manifest.Maps[0].Art[0].Layers[0].Tiles[2].FileDataID,
	})
	require.Equal(t, int32(100), manifest.Maps[0].Art[0].Overlays[0].ID)
	require.Equal(t, []int32{50, 51}, []int32{
		manifest.Maps[0].Art[0].Overlays[0].Tiles[0].FileDataID,
		manifest.Maps[0].Art[0].Overlays[0].Tiles[1].FileDataID,
	})
	require.Equal(t, "tiles/10.webp", manifest.Maps[0].Art[0].Layers[0].Tiles[0].Path)
}

func TestBuildWowMapInstances(t *testing.T) {
	t.Parallel()

	var files []wowdataFile
	for tile := 1; tile <= 12; tile++ {
		files = append(files,
			wowdataFile{FileDataID: int32(100 + tile), FileName: fmt.Sprintf("interface/worldmap/shadowfangkeep/shadowfangkeep1_%d.blp", tile)},
			wowdataFile{FileDataID: int32(200 + tile), FileName: fmt.Sprintf("interface/worldmap/zulfarrak/zulfarrak%d.blp", tile)},
		)
	}
	files = append(files, wowdataFile{FileDataID: 999, FileName: "interface/worldmap/incomplete/incomplete1_1.blp"})

	instances := buildWowMapInstances([]wowdataMap{
		{ID: 209, Name: "Zul'Farrak", Directory: "TanarisInstance", InstanceType: 1, ExpansionID: 0},
		{ID: 33, Name: "Shadowfang Keep", Directory: "Shadowfang", InstanceType: 1, ExpansionID: 0},
		{ID: 999, Name: "Incomplete", Directory: "Incomplete", InstanceType: 1, ExpansionID: 0},
		{ID: 1000, Name: "Future Dungeon", Directory: "ShadowfangKeep", InstanceType: 1, ExpansionID: 1},
	}, files)

	require.Len(t, instances, 2)
	require.Equal(t, int32(33), instances[0].MapID)
	require.Equal(t, int32(1), instances[0].Floors[0].Floor)
	require.Equal(t, int32(101), instances[0].Floors[0].Tiles[0].FileDataID)
	require.Equal(t, int32(2), instances[0].Floors[0].Tiles[11].Row)
	require.Equal(t, int32(3), instances[0].Floors[0].Tiles[11].Column)
	require.Equal(t, int32(209), instances[1].MapID)
	require.Equal(t, int32(201), instances[1].Floors[0].Tiles[0].FileDataID)
}

func TestParseWowMapInstanceTile(t *testing.T) {
	t.Parallel()

	directory, floor, tile, ok := parseWowMapInstanceTile("interface/worldmap/naxxramas/naxxramas6_12.blp")
	require.True(t, ok)
	require.Equal(t, "naxxramas", directory)
	require.Equal(t, int32(6), floor)
	require.Equal(t, int32(12), tile)

	directory, floor, tile, ok = parseWowMapInstanceTile("interface/worldmap/zulgurub/zulgurub9.blp")
	require.True(t, ok)
	require.Equal(t, "zulgurub", directory)
	require.Equal(t, int32(1), floor)
	require.Equal(t, int32(9), tile)

	_, _, _, ok = parseWowMapInstanceTile("interface/worldmap/ashenvale/ashenvalehighlight.blp")
	require.False(t, ok)
}

func TestBuildWowMapManifestRejectsMissingArt(t *testing.T) {
	t.Parallel()

	_, _, err := buildWowMapManifest(wowMapSource{
		Maps:  []wowdataUiMap{{ID: 1411}},
		Links: []wowdataUiMapXMapArt{{UiMapID: 1411, UiMapArtID: 2169}},
	}, wowMapTarget{})
	require.ErrorContains(t, err, "missing UiMapArt 2169")
}

func TestResolveWowdataBuild(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	binary := filepath.Join(dir, "wowdata")
	require.NoError(t, os.WriteFile(binary, []byte(`#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "casc" && "$2" == "info" ]]
printf '%s\n' '{"ok":true,"data":{"buildName":"1.60.1.70205"}}'
`), 0o755))

	var stderr bytes.Buffer
	build, err := resolveWowdataBuild(context.Background(), &stderr, wowMapExtractOptions{
		WowdataBin: binary,
		Source:     "remote",
		Product:    "wow_classic_beta",
		Build:      "latest",
		Region:     "us",
		Locale:     "enUS",
	})
	require.NoError(t, err)
	require.Equal(t, "1.60.1.70205", build)
}

func TestWowdataTargetArgs(t *testing.T) {
	t.Parallel()

	remote := wowdataTargetArgs(wowMapExtractOptions{
		Source: "remote", Product: "wow_classic_beta", Build: "1.60.1.70205", Region: "us", Locale: "enUS", Cache: "/cache",
	})
	require.Equal(t, []string{
		"--source", "remote", "--region", "us", "--product", "wow_classic_beta",
		"--build", "1.60.1.70205", "--locale", "enUS", "--cache", "/cache",
	}, remote)
	require.NotContains(t, remote, "--path")

	local := wowdataTargetArgs(wowMapExtractOptions{
		Source: "local", Product: "wow_classic_beta", Build: "1.60.1.70205", Region: "us", Locale: "enUS", Client: "/game",
	})
	require.Contains(t, local, "--path")
	require.Contains(t, local, "/game")
}

func TestExportWowdataTextureReportsUnavailableFile(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	binary := filepath.Join(dir, "wowdata")
	require.NoError(t, os.WriteFile(binary, []byte(`#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' '{"ok":false,"error":{"code":"not_found","message":"no root entry found for locale: 2"}}'
exit 1
`), 0o755))

	output := filepath.Join(dir, "tile.webp")
	err := exportWowdataTexture(context.Background(), &bytes.Buffer{}, wowMapExtractOptions{
		WowdataBin: binary,
		Source:     "remote",
		Product:    "wow_classic_beta",
		Build:      "1.60.1.70205",
		Region:     "us",
		Locale:     "enUS",
	}, 769212, output)
	require.Error(t, err)
	require.True(t, errors.Is(err, errWowdataFileUnavailable))
	require.ErrorContains(t, err, "FileDataID 769212")
	require.NoFileExists(t, output)
}

func TestPruneUnavailableWowMapTiles(t *testing.T) {
	t.Parallel()

	manifest := wowMapManifest{
		Maps: []wowMapRecord{{
			ID: 1411,
			Art: []wowMapArtAssociation{{
				ArtID:  2168,
				Layers: []wowMapArtLayer{{Tiles: []wowMapTile{{FileDataID: 10}}}},
			}},
		}},
		Instances: []wowMapInstance{{
			Name: "Gnomeregan",
			Floors: []wowMapInstanceFloor{
				{Floor: 1, Tiles: []wowMapTile{{FileDataID: 20}}},
				{Floor: 10, Tiles: []wowMapTile{{FileDataID: 769212}, {FileDataID: 769213}}},
			},
		}},
	}

	skipped, err := pruneUnavailableWowMapTiles(&manifest, map[int32]struct{}{769212: {}})
	require.NoError(t, err)
	require.Equal(t, []string{`"Gnomeregan" floor 10`}, skipped)
	require.Len(t, manifest.Instances, 1)
	require.Equal(t, int32(1), manifest.Instances[0].Floors[0].Floor)
	require.Equal(t, []int32{10, 20}, wowMapManifestFileDataIDs(manifest))
}

func TestPruneUnavailableWowMapTilesRejectsUiMapTile(t *testing.T) {
	t.Parallel()

	manifest := wowMapManifest{Maps: []wowMapRecord{{
		ID: 1411,
		Art: []wowMapArtAssociation{{
			ArtID:  2168,
			Layers: []wowMapArtLayer{{Tiles: []wowMapTile{{FileDataID: 10}}}},
		}},
	}}}

	_, err := pruneUnavailableWowMapTiles(&manifest, map[int32]struct{}{10: {}})
	require.ErrorContains(t, err, "UI map 1411 art 2168 references unavailable FileDataID 10")
}

func TestWriteWowMapManifest(t *testing.T) {
	t.Parallel()

	path := filepath.Join(t.TempDir(), "manifest.json")
	manifest := wowMapManifest{Format: wowMapManifestFormat, Maps: []wowMapRecord{{ID: 1411, Name: "Durotar"}}}
	require.NoError(t, writeWowMapManifest(path, manifest))

	data, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, byte('\n'), data[len(data)-1])
	var decoded wowMapManifest
	require.NoError(t, json.Unmarshal(data, &decoded))
	require.Equal(t, manifest, decoded)
}
