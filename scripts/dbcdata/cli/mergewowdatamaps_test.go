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
	mesh := &wowMapMeshInstance{Path: "meshes/43.glb", Bounds: wowMapFloorBounds{MinX: -389.07, MaxX: 191.667, MinY: -370.833, MaxY: 538.351}, ZMin: -119.16, ZMax: 56.469, Frame: wowMapMeshFrame}

	for _, tc := range []struct {
		name                   string
		render, styled, meshes bool
	}{
		{name: "original only"},
		{name: "render only", render: true},
		{name: "styled only", styled: true},
		{name: "meshes only", meshes: true},
		{name: "both", render: true, styled: true},
		{name: "all", render: true, styled: true, meshes: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath := filepath.Join(dir, "manifest.original.json")
			require.NoError(t, writeWowMapManifest(origPath, original))
			renderPath, styledPath, meshesPath := filepath.Join(dir, "manifest.rendered.json"), filepath.Join(dir, "manifest.styled.json"), filepath.Join(dir, "manifest.meshes.json")
			if tc.render {
				writeMapLayerTest(t, renderPath, wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Rendered: rendered}}})
			}
			if tc.styled {
				writeMapLayerTest(t, styledPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Styled: styled}}})
			}
			if tc.meshes {
				writeMapLayerTest(t, meshesPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: mesh}}})
			}
			out := filepath.Join(dir, "manifest.json")
			require.NoError(t, mergeWowdataMaps(origPath, renderPath, styledPath, meshesPath, out), "absent optional files should be allowed")
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
			if tc.meshes {
				require.Equal(t, mesh, merged.Instances[0].Mesh)
			} else {
				require.Nil(t, merged.Instances[0].Mesh)
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
			err := mergeWowdataMaps(origPath, renderPath, "", "", out)
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
			require.ErrorContains(t, mergeWowdataMaps(origPath, "", styledPath, "", filepath.Join(dir, "out.json")), tc.want)
		})
	}
}

func TestMergeWowdataMapsMeshValidation(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	good := wowMapMeshInstance{Path: "meshes/43.glb", Bounds: wowMapFloorBounds{MinX: -389.07, MaxX: 191.667, MinY: -370.833, MaxY: 538.351}, ZMin: -119.16, ZMax: 56.469, Frame: wowMapMeshFrame}
	layerOf := func(mesh wowMapMeshInstance) wowMapLayer {
		return wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: &mesh}}}
	}
	with := func(edit func(mesh *wowMapMeshInstance)) wowMapLayer {
		mesh := good
		edit(&mesh)
		return layerOf(mesh)
	}
	for _, tc := range []struct {
		name  string
		layer wowMapLayer
		want  string
	}{
		{name: "wrong target", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: "other"}}, want: "target does not match"},
		{name: "build not portable", layer: wowMapLayer{Format: wowMapManifestFormat, Target: target}, want: "target does not match"},
		{name: "no mesh", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43}}}, want: "must contain mesh only"},
		{name: "with rendered", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: &good, Rendered: &wowMapRenderedInstance{Path: "render/43.png", Width: 2, Height: 2}}}}, want: "must contain mesh only"},
		{name: "wrong prefix", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "render/43.glb" }), want: "invalid meshes"},
		{name: "traversal path", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "meshes/../43.glb" }), want: "invalid meshes"},
		{name: "not a glb", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "meshes/43.gltf" }), want: "invalid meshes"},
		{name: "flat x bounds", layer: with(func(mesh *wowMapMeshInstance) { mesh.Bounds.MaxX = mesh.Bounds.MinX }), want: "invalid meshes"},
		{name: "inverted y bounds", layer: with(func(mesh *wowMapMeshInstance) {
			mesh.Bounds.MinY, mesh.Bounds.MaxY = mesh.Bounds.MaxY, mesh.Bounds.MinY
		}), want: "invalid meshes"},
		{name: "flat z", layer: with(func(mesh *wowMapMeshInstance) { mesh.ZMax = mesh.ZMin }), want: "invalid meshes"},
		{name: "unknown frame", layer: with(func(mesh *wowMapMeshInstance) { mesh.Frame = "wow-yup" }), want: "invalid meshes"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath, meshesPath := filepath.Join(dir, "original.json"), filepath.Join(dir, "meshes.json")
			require.NoError(t, writeWowMapManifest(origPath, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43}}}))
			writeMapLayerTest(t, meshesPath, tc.layer)
			require.ErrorContains(t, mergeWowdataMaps(origPath, "", "", meshesPath, filepath.Join(dir, "out.json")), tc.want)
		})
	}
	// A render layer may not smuggle a mesh in, and a stale mesh on the
	// original is dropped like stale artwork.
	dir := t.TempDir()
	origPath, renderPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "render.json"), filepath.Join(dir, "out.json")
	require.NoError(t, writeWowMapManifest(origPath, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43, Mesh: &good}}}))
	writeMapLayerTest(t, renderPath, wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: &good, Rendered: &wowMapRenderedInstance{Path: "render/43.png", Width: 2, Height: 2}}}})
	require.ErrorContains(t, mergeWowdataMaps(origPath, renderPath, "", "", out), "must contain rendered only")
	require.NoError(t, mergeWowdataMaps(origPath, "", "", "", out))
	data, err := os.ReadFile(out)
	require.NoError(t, err)
	var merged wowMapManifest
	require.NoError(t, json.Unmarshal(data, &merged))
	require.Nil(t, merged.Instances[0].Mesh)
}

func writeMapLayerTest(t *testing.T, file string, layer wowMapLayer) {
	t.Helper()
	data, err := json.Marshal(layer)
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(file, data, 0o644))
}
