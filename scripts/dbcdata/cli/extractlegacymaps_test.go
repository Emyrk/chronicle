package cli

import (
	"fmt"
	"testing"

	"github.com/Gophercraft/core/format/dbc/dbdefs"
	"github.com/stretchr/testify/require"
)

func TestParseLegacyMapInstanceTile(t *testing.T) {
	t.Parallel()

	directory, floor, tile, ok := parseLegacyMapInstanceTile(`Interface\WorldMap\Naxxramas\Naxxramas6_12.blp`)
	require.True(t, ok)
	require.Equal(t, "naxxramas", directory)
	require.Equal(t, int32(6), floor)
	require.Equal(t, int32(12), tile)

	directory, floor, tile, ok = parseLegacyMapInstanceTile("interface/worldmap/shadowfangkeep/shadowfangkeep9.blp")
	require.True(t, ok)
	require.Equal(t, "shadowfangkeep", directory)
	require.Equal(t, int32(1), floor)
	require.Equal(t, int32(9), tile)

	_, _, _, ok = parseLegacyMapInstanceTile("interface/worldmap/alterac/alterachighlight.blp")
	require.False(t, ok)
}

func TestBuildLegacyMapManifest(t *testing.T) {
	t.Parallel()

	files := make(map[string]string)
	for tile := 1; tile <= 12; tile++ {
		addLegacyTestFile(files, fmt.Sprintf("Interface/WorldMap/Durotar/Durotar%d.blp", tile))
		addLegacyTestFile(files, fmt.Sprintf("Interface/WorldMap/ShadowfangKeep/ShadowfangKeep%d.blp", tile))
	}
	addLegacyTestFile(files, "Interface/WorldMap/Durotar/RazorHill1.blp")
	addLegacyTestFile(files, "Interface/WorldMap/Durotar/RazorHill2.blp")

	resolveFile := func(path string) (string, bool) {
		original, ok := files[normalizeLegacyMapPath(path)]
		return original, ok
	}

	manifest, sourcePaths, err := buildLegacyMapManifest(
		[]dbdefs.Ent_WorldMapArea{{
			ID: 4, MapID: 1, AreaID: 14, AreaName: "Durotar",
			LocLeft: -1962.5, LocRight: -7250, LocTop: 1808.33, LocBottom: -1716.67,
		}},
		[]dbdefs.Ent_WorldMapOverlay{{
			ID: 5, MapAreaID: 4, TextureName: "RazorHill", TextureWidth: 300, TextureHeight: 200, OffsetX: 445, OffsetY: 182,
		}},
		map[int32]string{14: "Durotar"},
		[]wowdataMap{{ID: 33, Name: "Shadowfang Keep", Directory: "Shadowfang", InstanceType: 1}},
		files,
		resolveFile,
		wowMapTarget{Product: "turtle", Build: "1.12.1.5875"},
	)
	require.NoError(t, err)
	require.Len(t, manifest.Maps, 1)
	require.Equal(t, "Durotar", manifest.Maps[0].Name)
	require.InDeltaSlice(t, []float64{-1716.67, -7250, -1000000, 1808.33, -1962.5, 1000000}, manifest.Maps[0].Assignments[0].Region[:], 0.001)
	require.Len(t, manifest.Maps[0].Art[0].Layers[0].Tiles, 12)
	require.Len(t, manifest.Maps[0].Art[0].Overlays, 1)
	require.Len(t, manifest.Maps[0].Art[0].Overlays[0].Tiles, 2)
	require.Len(t, manifest.Instances, 1)
	require.Equal(t, int32(33), manifest.Instances[0].MapID)
	require.Len(t, manifest.Instances[0].Floors[0].Tiles, 12)
	require.Len(t, sourcePaths, 26)
}

func TestPruneUnavailableLegacyMapTiles(t *testing.T) {
	t.Parallel()

	manifest := wowMapManifest{
		Maps: []wowMapRecord{{Name: "Loch Modan", Art: []wowMapArtAssociation{{
			Layers:   []wowMapArtLayer{{Tiles: []wowMapTile{{FileDataID: 1}}}},
			Overlays: []wowMapArtOverlay{{ID: 281, Tiles: []wowMapTile{{FileDataID: 2}, {FileDataID: 3}}}},
		}}}},
		Instances: []wowMapInstance{{Name: "Naxxramas", Floors: []wowMapInstanceFloor{{
			Floor: 1, Tiles: []wowMapTile{{FileDataID: 4}},
		}}}},
	}

	skipped := pruneUnavailableLegacyMapTiles(&manifest, map[int32]struct{}{3: {}, 4: {}})
	require.Equal(t, []string{`"Loch Modan" overlay 281`, `"Naxxramas" floor 1`}, skipped)
	require.Empty(t, manifest.Maps[0].Art[0].Overlays)
	require.Empty(t, manifest.Instances)
}

func addLegacyTestFile(files map[string]string, path string) {
	files[normalizeLegacyMapPath(path)] = path
}
