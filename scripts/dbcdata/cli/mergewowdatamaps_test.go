package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMergeWowdataMaps(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	original := wowMapManifest{
		Format: wowMapManifestFormat, Target: target,
		Maps:      []wowMapRecord{{ID: 1411, Name: "Durotar", Assignments: []wowMapAssignment{{ID: 5, MapID: 43}}}},
		Instances: []wowMapInstance{{MapID: 43, Name: "Wailing Caverns", Directory: "WailingCaverns", Floors: []wowMapInstanceFloor{{Floor: 1, Width: 1002, Tiles: []wowMapTile{{Path: "original/1.webp"}}}}}},
	}
	rendered := &wowMapRenderedInstance{Path: "render/43.png", Width: 1200, Height: 800, Source: "wmo", Bounds: wowMapFloorBounds{MinX: 1, MaxX: 2}}
	styled := &wowMapRenderedInstance{Path: "render-styled/43.jpeg", Width: 1600, Height: 1066, Source: "hand-styled", Bounds: rendered.Bounds}

	for _, tc := range []struct {
		name           string
		render, styled bool
	}{
		{name: "original only"},
		{name: "render only", render: true},
		{name: "styled only", styled: true},
		{name: "both", render: true, styled: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath := filepath.Join(dir, "manifest.original.json")
			require.NoError(t, writeWowMapManifest(origPath, original))
			renderPath, styledPath := filepath.Join(dir, "manifest.rendered.json"), filepath.Join(dir, "manifest.styled.json")
			if tc.render {
				writeMapLayerTest(t, renderPath, wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Rendered: rendered}}})
			}
			if tc.styled {
				writeMapLayerTest(t, styledPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Styled: styled}}})
			}
			out := filepath.Join(dir, "manifest.json")
			require.NoError(t, mergeWowdataMaps(origPath, renderPath, styledPath, out), "absent optional files should be allowed")
			data, err := os.ReadFile(out)
			require.NoError(t, err)
			var merged wowMapManifest
			require.NoError(t, json.Unmarshal(data, &merged))
			require.Equal(t, original.Maps, merged.Maps)
			require.Equal(t, original.Target, merged.Target)
			require.Equal(t, original.Instances[0].Floors, merged.Instances[0].Floors)
			if tc.render {
				require.Equal(t, rendered, merged.Instances[0].Rendered)
			} else {
				require.Nil(t, merged.Instances[0].Rendered)
			}
			if tc.styled {
				require.Equal(t, styled, merged.Instances[0].Styled)
			} else {
				require.Nil(t, merged.Instances[0].Styled)
			}
		})
	}
}

func TestMergeWowdataMapsInvalid(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	art := &wowMapRenderedInstance{Path: "render/43.png", Width: 1200, Height: 800}
	good := wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Rendered: art}}}
	for _, tc := range []struct {
		name     string
		original *wowMapManifest
		layer    *wowMapLayer
		raw      string
		want     string
	}{
		{name: "missing original", want: "read original"},
		{name: "wrong original format", original: &wowMapManifest{Format: "chronicle-wow-map-art-v1", Target: target}, want: "unsupported original"},
		{name: "duplicate original", original: &wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43}, {MapID: 43}}}, want: "duplicate original"},
		{name: "duplicate original UI map", original: &wowMapManifest{Format: wowMapManifestFormat, Target: target, Maps: []wowMapRecord{{ID: 1411}, {ID: 1411}}}, want: "duplicate original UI map"},
		{name: "wrong target", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: "different"}, Instances: good.Instances}, want: "target does not match"},
		{name: "wrong build", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product, Build: "old"}, Instances: good.Instances}, want: "target does not match"},
		{name: "wrong format", layer: &wowMapLayer{Format: "v1", Target: target}, want: "unsupported render"},
		{name: "unknown mapID", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 99, Rendered: art}}}, want: "unknown"},
		{name: "duplicate layer", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{good.Instances[0], good.Instances[0]}}, want: "duplicate"},
		{name: "traversal path", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Rendered: &wowMapRenderedInstance{Path: "render/../other.png", Width: 2, Height: 2}}}}, want: "invalid render"},
		{name: "absolute path", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Rendered: &wowMapRenderedInstance{Path: "/render/43.png", Width: 2, Height: 2}}}}, want: "invalid render"},
		{name: "malformed", raw: "{bad", want: "decode render"},
		{name: "wrong field type", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta","build":"1.2.3","region":"us","locale":"enUS"},"instances":[{"mapID":"43","rendered":{"path":"render/43.png"}}]}`, want: "decode render"},
		{name: "extraneous field", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta","build":"1.2.3","region":"us","locale":"enUS"},"instances":[],"maps":[]}`, want: "decode render"},
		{name: "trailing JSON", raw: `{} {`, want: "decode render"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath, renderPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "render.json"), filepath.Join(dir, "out.json")
			original := wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43}}}
			if tc.original != nil {
				original = *tc.original
			}
			if tc.name != "missing original" {
				require.NoError(t, writeWowMapManifest(origPath, original))
			}
			if tc.layer != nil {
				writeMapLayerTest(t, renderPath, *tc.layer)
			} else if tc.raw != "" {
				require.NoError(t, os.WriteFile(renderPath, []byte(tc.raw), 0o644))
			}
			err := mergeWowdataMaps(origPath, renderPath, "", out)
			require.ErrorContains(t, err, tc.want)
			_, err = os.Stat(out)
			require.ErrorIs(t, err, os.ErrNotExist)
		})
	}
}

func TestMergeWowdataMapsStyledValidation(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	for _, tc := range []struct {
		name  string
		layer wowMapLayer
		want  string
	}{
		{name: "wrong styled target", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: "other"}}, want: "target does not match"},
		{name: "styled build not portable", layer: wowMapLayer{Format: wowMapManifestFormat, Target: target}, want: "target does not match"},
		{name: "wrong styled path", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Styled: &wowMapRenderedInstance{Path: "render/43.png", Width: 2, Height: 2}}}}, want: "invalid styled"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath, styledPath := filepath.Join(dir, "original.json"), filepath.Join(dir, "styled.json")
			require.NoError(t, writeWowMapManifest(origPath, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43}}}))
			writeMapLayerTest(t, styledPath, tc.layer)
			require.ErrorContains(t, mergeWowdataMaps(origPath, "", styledPath, filepath.Join(dir, "out.json")), tc.want)
		})
	}
}

func TestMergeWowdataMapsManualLayers(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	original := filepath.Join(dir, "original.json")
	renders := filepath.Join(dir, "renders.json")
	model3d := filepath.Join(dir, "3d.json")
	out := filepath.Join(dir, "manifest.json")
	require.NoError(t, writeWowMapManifest(original, wowMapManifest{
		Format: wowMapManifestFormat, Target: target,
		Instances: []wowMapInstance{{MapID: 43, Name: "Wailing Caverns", Floors: []wowMapInstanceFloor{{Floor: 1}}}},
	}))
	manualTarget := wowMapTarget{Product: target.Product}
	writeMapLayerTest(t, renders, wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{
		{MapID: 43, Name: "Wailing Caverns", Renders: &wowMapManualRender{Path: "renders/WC-shaded-water.png", Width: 2400, Height: 1533}},
		{MapID: 2999, Name: "Ruins of Lordaeron", Renders: &wowMapManualRender{Path: "renders/RoL-shaded-aligned.png", Width: 1024, Height: 1024}},
		{MapID: 389, Name: "Ragefire Chasm", Renders: &wowMapManualRender{Path: "renders/RFC-shaded.png", Width: 1774, Height: 2400}},
	}})
	writeMapLayerTest(t, model3d, wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{
		{MapID: 389, Name: "Ragefire Chasm", Model3D: &wowMap3DAsset{Path: "3d/ragefire-chasm-open-top.glb"}},
		{MapID: 2999, Name: "Ruins of Lordaeron", Model3D: &wowMap3DAsset{Path: "3d/ruins-of-lordaeron-open-top.glb"}},
	}})
	for _, tc := range []struct {
		name, renderFile, modelFile string
	}{
		{"renders alone", renders, ""},
		{"3d alone", "", model3d},
	} {
		t.Run(tc.name, func(t *testing.T) {
			file := filepath.Join(t.TempDir(), "manifest.json")
			require.NoError(t, mergeWowdataMapsWithManual(original, "", "", tc.renderFile, tc.modelFile, file))
			data, err := os.ReadFile(file)
			require.NoError(t, err)
			var independent wowMapManifest
			require.NoError(t, json.Unmarshal(data, &independent))
			require.Len(t, independent.Instances, 3)
			require.Equal(t, "Ragefire Chasm", independent.Instances[1].Name)
			require.NotNil(t, independent.Instances[1].Floors)
		})
	}
	require.NoError(t, mergeWowdataMapsWithManual(original, "", "", renders, model3d, out))
	data, err := os.ReadFile(out)
	require.NoError(t, err)
	var merged wowMapManifest
	require.NoError(t, json.Unmarshal(data, &merged))
	require.Equal(t, []int32{43, 389, 2999}, []int32{merged.Instances[0].MapID, merged.Instances[1].MapID, merged.Instances[2].MapID})
	require.Equal(t, "Wailing Caverns", merged.Instances[0].Name) // Native metadata wins.
	require.Len(t, merged.Instances[0].Floors, 1)
	require.Equal(t, "renders/WC-shaded-water.png", merged.Instances[0].Renders.Path)
	require.Equal(t, "Ragefire Chasm", merged.Instances[1].Name)
	require.Empty(t, merged.Instances[1].Floors)
	require.Equal(t, "renders/RFC-shaded.png", merged.Instances[1].Renders.Path)
	require.Equal(t, "3d/ragefire-chasm-open-top.glb", merged.Instances[1].Model3D.Path)
	require.Equal(t, "Ruins of Lordaeron", merged.Instances[2].Name)
	require.Equal(t, "3d/ruins-of-lordaeron-open-top.glb", merged.Instances[2].Model3D.Path)
	require.Equal(t, "renders/RoL-shaded-aligned.png", merged.Instances[2].Renders.Path)
	// An invalid replacement layer cannot overwrite an existing public manifest.
	for _, tc := range []struct {
		name  string
		layer wowMapLayer
		file  string
	}{
		{"unknown mapID", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 999, Renders: &wowMapManualRender{Path: "renders/999.png", Width: 1, Height: 1}}}}, renders},
		{"mixed fields", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 1, Height: 1}, Model3D: &wowMap3DAsset{Path: "3d/43.glb"}}}}, renders},
		{"wrong prefix", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 389, Model3D: &wowMap3DAsset{Path: "renders/389.glb"}}}}, model3d},
		{"duplicate mapID", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 43, Model3D: &wowMap3DAsset{Path: "3d/43.glb"}}, {MapID: 43, Model3D: &wowMap3DAsset{Path: "3d/43.glb"}}}}, model3d},
		{"traversal", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 43, Model3D: &wowMap3DAsset{Path: "3d/../other.glb"}}}}, model3d},
		{"bad dimensions", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 0, Height: 1}}}}, renders},
		{"wrong extension", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.jpg", Width: 1, Height: 1}}}}, renders},
		{"unnamed new instance", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 999, Model3D: &wowMap3DAsset{Path: "3d/999.glb"}}}}, model3d},
		{"conflicting names", wowMapLayer{Format: wowMapManifestFormat, Target: manualTarget, Instances: []wowMapLayerInstance{{MapID: 389, Name: "Wrong dungeon", Model3D: &wowMap3DAsset{Path: "3d/389.glb"}}}}, model3d},
		{"wrong target", wowMapLayer{Format: wowMapManifestFormat, Target: target}, model3d},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			file := filepath.Join(t.TempDir(), "invalid.json")
			writeMapLayerTest(t, file, tc.layer)
			renderFile, modelFile := renders, model3d
			if tc.file == renders {
				renderFile = file
			} else {
				modelFile = file
			}
			err := mergeWowdataMapsWithManual(original, "", "", renderFile, modelFile, out)
			require.Error(t, err)
			current, readErr := os.ReadFile(out)
			require.NoError(t, readErr)
			require.Equal(t, data, current)
		})
	}
}

func writeMapLayerTest(t *testing.T, file string, layer wowMapLayer) {
	t.Helper()
	data, err := json.Marshal(layer)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(file, data, 0o644))
}
