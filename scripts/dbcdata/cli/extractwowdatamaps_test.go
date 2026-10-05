package cli

import (
	"bytes"
	"context"
	"encoding/json"
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
	}
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.60.1.70205", Region: "us", Locale: "enUS"}

	manifest, fileDataIDs, err := buildWowMapManifest(source, target)
	require.NoError(t, err)
	require.Equal(t, []int32{10, 20, 30, 40}, fileDataIDs, "unlinked artwork must not be exported")
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
	require.Equal(t, "tiles/10.webp", manifest.Maps[0].Art[0].Layers[0].Tiles[0].Path)
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
