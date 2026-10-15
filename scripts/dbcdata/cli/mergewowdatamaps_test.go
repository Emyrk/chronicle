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
	renders := &wowMapManualRender{Path: "renders/43.png", Width: 1200, Height: 800}
	styled := &wowMapRenderedInstance{Path: "render-styled/43.jpeg", Width: 1600, Height: 1066, Source: "hand-styled", Bounds: wowMapFloorBounds{MinX: 1, MaxX: 2}}
	mesh := &wowMapMeshInstance{Path: "3d/wailing-caverns-open-top.glb", Bounds: wowMapFloorBounds{MinX: -389.07, MaxX: 191.667, MinY: -370.833, MaxY: 538.351}, ZMin: -119.16, ZMax: 56.469, Frame: wowMapMeshFrame}

	// An old merged manifest can be reused as original without retaining overlays.
	original.Instances[0].Styled = styled
	original.Instances[0].Mesh = mesh
	original.Instances[0].Renders = renders

	for _, tc := range []struct {
		name                    string
		renders, styled, meshes bool
	}{
		{name: "original only"},
		{name: "renders only", renders: true},
		{name: "styled only", styled: true},
		{name: "meshes only", meshes: true},
		{name: "both", renders: true, styled: true},
		{name: "all", renders: true, styled: true, meshes: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath := filepath.Join(dir, "manifest.original.json")
			require.NoError(t, writeWowMapManifest(origPath, original))
			rendersPath, styledPath, meshesPath := filepath.Join(dir, "manifest.renders.json"), filepath.Join(dir, "manifest.styled.json"), filepath.Join(dir, "manifest.meshes.json")
			if tc.renders {
				writeMapLayerTest(t, rendersPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Renders: renders}}})
			}
			if tc.styled {
				writeMapLayerTest(t, styledPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Styled: styled}}})
			}
			if tc.meshes {
				writeMapLayerTest(t, meshesPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: mesh}}})
			}
			out := filepath.Join(dir, "manifest.json")
			require.NoError(t, mergeWowdataMaps(origPath, styledPath, meshesPath, rendersPath, out), "absent optional files should be allowed")
			data, err := os.ReadFile(out)
			require.NoError(t, err)
			var merged wowMapManifest
			require.NoError(t, json.Unmarshal(data, &merged))
			require.Equal(t, original.Maps, merged.Maps)
			require.Equal(t, original.Target, merged.Target)
			require.Equal(t, original.Instances[0].Floors, merged.Instances[0].Floors)
			if tc.renders {
				require.Equal(t, renders, merged.Instances[0].Renders)
			} else {
				require.Nil(t, merged.Instances[0].Renders)
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
	product := wowMapTarget{Product: target.Product}
	art := &wowMapManualRender{Path: "renders/43.png", Width: 1200, Height: 800}
	good := wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: art}}}
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
		{name: "wrong build", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: good.Instances}, want: "target does not match"},
		{name: "wrong format", layer: &wowMapLayer{Format: "v1", Target: product}, want: "unsupported renders"},
		{name: "duplicate layer", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{good.Instances[0], good.Instances[0]}}, want: "duplicate"},
		{name: "traversal path", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/../other.png", Width: 2, Height: 2}}}}, want: "invalid renders"},
		{name: "absolute path", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "/renders/43.png", Width: 2, Height: 2}}}}, want: "invalid renders"},
		{name: "malformed", raw: "{bad", want: "decode renders"},
		{name: "obsolete rendered field", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":43,"rendered":{"path":"render/43.png"}}]}`, want: "decode renders"},
		{name: "obsolete 3d field", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":43,"3d":{"path":"3d/43.glb"}}]}`, want: "decode renders"},
		{name: "wrong field type", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":"43","renders":{"path":"renders/43.png"}}]}`, want: "decode renders"},
		{name: "extraneous field", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[],"maps":[]}`, want: "decode renders"},
		{name: "trailing JSON", raw: `{} {`, want: "decode renders"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath, rendersPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "renders.json"), filepath.Join(dir, "out.json")
			original := wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43}}}
			if tc.original != nil {
				original = *tc.original
			}
			if tc.name != "missing original" {
				require.NoError(t, writeWowMapManifest(origPath, original))
			}
			if tc.layer != nil {
				writeMapLayerTest(t, rendersPath, *tc.layer)
			} else if tc.raw != "" {
				require.NoError(t, os.WriteFile(rendersPath, []byte(tc.raw), 0o644))
			}
			err := mergeWowdataMaps(origPath, "", "", rendersPath, out)
			require.ErrorContains(t, err, tc.want)
			_, err = os.Stat(out)
			require.ErrorIs(t, err, os.ErrNotExist)
		})
	}
}

func TestMergeWowdataMapsRejectsObsoleteOriginalFields(t *testing.T) {
	t.Parallel()
	for _, field := range []string{`"rendered":{"path":"render/43.png"}`, `"3d":{"path":"3d/43.glb"}`} {
		t.Run(field, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			original := filepath.Join(dir, "original.json")
			data := `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":43,` + field + `}]}`
			require.NoError(t, os.WriteFile(original, []byte(data), 0o644))
			require.ErrorContains(t, mergeWowdataMaps(original, "", "", "", filepath.Join(dir, "out.json")), "decode original")
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
			require.ErrorContains(t, mergeWowdataMaps(origPath, styledPath, "", "", filepath.Join(dir, "out.json")), tc.want)
		})
	}
}

func TestMergeWowdataMapsMeshValidation(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	good := wowMapMeshInstance{Path: "3d/wailing-caverns-open-top.glb", Bounds: wowMapFloorBounds{MinX: -389.07, MaxX: 191.667, MinY: -370.833, MaxY: 538.351}, ZMin: -119.16, ZMax: 56.469, Frame: wowMapMeshFrame}
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
		{name: "with renders", layer: wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: &good, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 2, Height: 2}}}}, want: "must contain mesh only"},
		{name: "wrong prefix", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "render/43.glb" }), want: "invalid meshes"},
		{name: "traversal path", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "3d/../43.glb" }), want: "invalid meshes"},
		{name: "not a glb", layer: with(func(mesh *wowMapMeshInstance) { mesh.Path = "3d/43.gltf" }), want: "invalid meshes"},
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
			require.ErrorContains(t, mergeWowdataMaps(origPath, "", meshesPath, "", filepath.Join(dir, "out.json")), tc.want)
		})
	}
	// A renders layer may not smuggle a mesh in, and a stale mesh on the
	// original is dropped like stale artwork.
	dir := t.TempDir()
	origPath, rendersPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "renders.json"), filepath.Join(dir, "out.json")
	require.NoError(t, writeWowMapManifest(origPath, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43, Mesh: &good}}}))
	writeMapLayerTest(t, rendersPath, wowMapLayer{Format: wowMapManifestFormat, Target: wowMapTarget{Product: target.Product}, Instances: []wowMapLayerInstance{{MapID: 43, Mesh: &good, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 2, Height: 2}}}})
	require.ErrorContains(t, mergeWowdataMaps(origPath, "", "", rendersPath, out), "invalid renders")
	require.NoError(t, mergeWowdataMaps(origPath, "", "", "", out))
	data, err := os.ReadFile(out)
	require.NoError(t, err)
	var merged wowMapManifest
	require.NoError(t, json.Unmarshal(data, &merged))
	require.Nil(t, merged.Instances[0].Mesh)
}

// A meshes layer entry for a mapID the original has no instance for creates a
// mesh-only instance (name from the layer, no floors); an existing instance
// still only gets the mesh, keeping its own name.
func TestMergeWowdataMapsMeshOnlyInstance(t *testing.T) {
	t.Parallel()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	original := wowMapManifest{
		Format: wowMapManifestFormat, Target: target,
		Instances: []wowMapInstance{{MapID: 43, Name: "Wailing Caverns", Directory: "WailingCaverns", Floors: []wowMapInstanceFloor{{Floor: 1, Width: 1002, Tiles: []wowMapTile{{Path: "original/1.webp"}}}}}},
	}
	wcMesh := &wowMapMeshInstance{Path: "3d/wailing-caverns-open-top.glb", Bounds: wowMapFloorBounds{MinX: -389.07, MaxX: 191.667, MinY: -370.833, MaxY: 538.351}, ZMin: -119.16, ZMax: 56.469, Frame: wowMapMeshFrame}
	rfcMesh := &wowMapMeshInstance{
		Path: "3d/ragefire-chasm-open-top.glb", Bounds: wowMapFloorBounds{MinX: -416.2582, MaxX: 102.9279, MinY: -108.4728, MaxY: 275.3513}, ZMin: -66.1637, ZMax: 59.4058, Frame: wowMapMeshFrame,
		Liquid: &wowMapMeshLiquid{Color: "#d66020", Opacity: 0.85},
	}
	productOnly := wowMapTarget{Product: target.Product}

	dir := t.TempDir()
	origPath, meshesPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "meshes.json"), filepath.Join(dir, "out.json")
	require.NoError(t, writeWowMapManifest(origPath, original))
	writeMapLayerTest(t, meshesPath, wowMapLayer{Format: wowMapManifestFormat, Target: productOnly, Instances: []wowMapLayerInstance{
		{MapID: 43, Name: "Renamed Caverns", Mesh: wcMesh},
		{MapID: 389, Name: "Ragefire Chasm", Mesh: rfcMesh},
	}})
	require.NoError(t, mergeWowdataMaps(origPath, "", meshesPath, "", out))
	data, err := os.ReadFile(out)
	require.NoError(t, err)
	var merged wowMapManifest
	require.NoError(t, json.Unmarshal(data, &merged))
	require.Len(t, merged.Instances, 2)
	require.Equal(t, "Wailing Caverns", merged.Instances[0].Name, "the original owns an existing instance's metadata")
	require.Equal(t, original.Instances[0].Floors, merged.Instances[0].Floors)
	require.Equal(t, wcMesh, merged.Instances[0].Mesh)
	require.Equal(t, wowMapInstance{MapID: 389, Name: "Ragefire Chasm", Floors: []wowMapInstanceFloor{}, Mesh: rfcMesh}, merged.Instances[1])
	require.Contains(t, string(data), `"floors": []`, "a mesh-only instance publishes an empty floor list, not null")

	// Merging the same layer over the merged output again changes nothing:
	// the created instance is now an existing one and only gets the mesh.
	require.NoError(t, mergeWowdataMaps(out, "", meshesPath, "", filepath.Join(dir, "again.json")))
	again, err := os.ReadFile(filepath.Join(dir, "again.json"))
	require.NoError(t, err)
	require.JSONEq(t, string(data), string(again))

	for _, tc := range []struct {
		name  string
		layer *wowMapLayer
		raw   string
		want  string
	}{
		{name: "name required when creating", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: productOnly, Instances: []wowMapLayerInstance{{MapID: 389, Mesh: rfcMesh}}}, want: "needs a positive mapID and name"},
		{name: "mesh-only still needs a mesh", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: productOnly, Instances: []wowMapLayerInstance{{MapID: 389, Name: "Ragefire Chasm"}}}, want: "must contain mesh only"},
		{name: "mesh-only rejects artwork", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: productOnly, Instances: []wowMapLayerInstance{{MapID: 389, Name: "Ragefire Chasm", Mesh: rfcMesh, Styled: &wowMapRenderedInstance{Path: "render-styled/389.jpeg", Width: 2, Height: 2}}}}, want: "must contain mesh only"},
		{name: "mesh-only validates the mesh", layer: &wowMapLayer{Format: wowMapManifestFormat, Target: productOnly, Instances: []wowMapLayerInstance{{MapID: 389, Name: "Ragefire Chasm", Mesh: &wowMapMeshInstance{Path: "3d/ragefire-chasm-open-top.glb", Frame: wowMapMeshFrame}}}}, want: "invalid meshes map layer mesh for mapID 389"},
		{name: "liquid colour without hash", layer: liquidLayerTest(productOnly, wowMapMeshLiquid{Color: "d66020", Opacity: 0.85}), want: "invalid meshes map layer liquid for mapID 389"},
		{name: "liquid colour short", layer: liquidLayerTest(productOnly, wowMapMeshLiquid{Color: "#d60", Opacity: 0.85}), want: "invalid meshes map layer liquid"},
		{name: "liquid colour named", layer: liquidLayerTest(productOnly, wowMapMeshLiquid{Color: "orange", Opacity: 0.85}), want: "invalid meshes map layer liquid"},
		{name: "liquid opacity zero", layer: liquidLayerTest(productOnly, wowMapMeshLiquid{Color: "#d66020"}), want: "invalid meshes map layer liquid"},
		{name: "liquid opacity above one", layer: liquidLayerTest(productOnly, wowMapMeshLiquid{Color: "#d66020", Opacity: 1.5}), want: "invalid meshes map layer liquid"},
		{name: "liquid extraneous field", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":389,"name":"Ragefire Chasm","mesh":{"path":"3d/ragefire-chasm-open-top.glb","bounds":{"minX":-416,"maxX":102,"minY":-108,"maxY":275},"zMin":-66,"zMax":59,"frame":"wow-yup-mirrored-x","liquid":{"color":"#d66020","opacity":0.85,"glow":true}}}]}`, want: "decode meshes"},
		{name: "floors on a layer entry", raw: `{"format":"chronicle-wow-map-art-v2","target":{"product":"wow_classic_beta"},"instances":[{"mapID":389,"name":"Ragefire Chasm","floors":[],"mesh":{"path":"3d/ragefire-chasm-open-top.glb","bounds":{"minX":-416,"maxX":102,"minY":-108,"maxY":275},"zMin":-66,"zMax":59,"frame":"wow-yup-mirrored-x"}}]}`, want: "decode meshes"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			dir := t.TempDir()
			origPath, meshesPath, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "meshes.json"), filepath.Join(dir, "out.json")
			require.NoError(t, writeWowMapManifest(origPath, original))
			if tc.layer != nil {
				writeMapLayerTest(t, meshesPath, *tc.layer)
			} else {
				require.NoError(t, os.WriteFile(meshesPath, []byte(tc.raw), 0o644))
			}
			require.ErrorContains(t, mergeWowdataMaps(origPath, "", meshesPath, "", out), tc.want)
			_, err := os.Stat(out)
			require.ErrorIs(t, err, os.ErrNotExist)
		})
	}

}

func liquidLayerTest(target wowMapTarget, liquid wowMapMeshLiquid) *wowMapLayer {
	mesh := &wowMapMeshInstance{Path: "3d/ragefire-chasm-open-top.glb", Bounds: wowMapFloorBounds{MinX: -416.2582, MaxX: 102.9279, MinY: -108.4728, MaxY: 275.3513}, ZMin: -66.1637, ZMax: 59.4058, Frame: wowMapMeshFrame, Liquid: &liquid}
	return &wowMapLayer{Format: wowMapManifestFormat, Target: target, Instances: []wowMapLayerInstance{{MapID: 389, Name: "Ragefire Chasm", Mesh: mesh}}}
}

func TestMergeWowdataMapsRendersAndMeshFloorless(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	target := wowMapTarget{Product: "wow_classic_beta", Build: "1.2.3", Region: "us", Locale: "enUS"}
	product := wowMapTarget{Product: target.Product}
	original, meshes, renders, out := filepath.Join(dir, "original.json"), filepath.Join(dir, "meshes.json"), filepath.Join(dir, "renders.json"), filepath.Join(dir, "manifest.json")
	require.NoError(t, writeWowMapManifest(original, wowMapManifest{Format: wowMapManifestFormat, Target: target, Instances: []wowMapInstance{{MapID: 43, Name: "Wailing Caverns", Floors: []wowMapInstanceFloor{{Floor: 1}}}}}))
	mesh := &wowMapMeshInstance{Path: "3d/ruins-of-lordaeron-open-top.glb", Bounds: wowMapFloorBounds{MinX: 1, MaxX: 2, MinY: 3, MaxY: 4}, ZMin: 5, ZMax: 6, Frame: wowMapMeshFrame}
	writeMapLayerTest(t, meshes, wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 2999, Name: "Ruins of Lordaeron", Mesh: mesh}}})
	writeMapLayerTest(t, renders, wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{
		{MapID: 43, Name: "Ignored name", Renders: &wowMapManualRender{Path: "renders/WC-shaded-water.png", Width: 2400, Height: 1533}},
		{MapID: 2999, Name: "Ruins of Lordaeron", Renders: &wowMapManualRender{Path: "renders/RoL-shaded-aligned.png", Width: 1024, Height: 1024}},
		{MapID: 389, Name: "Ragefire Chasm", Renders: &wowMapManualRender{Path: "renders/RFC-shaded.png", Width: 1774, Height: 2400}},
	}})
	require.NoError(t, mergeWowdataMaps(original, "", meshes, renders, out))
	data, err := os.ReadFile(out)
	require.NoError(t, err)
	var merged wowMapManifest
	require.NoError(t, json.Unmarshal(data, &merged))
	require.Equal(t, []int32{43, 389, 2999}, []int32{merged.Instances[0].MapID, merged.Instances[1].MapID, merged.Instances[2].MapID})
	require.Equal(t, "Wailing Caverns", merged.Instances[0].Name)
	require.Len(t, merged.Instances[0].Floors, 1)
	require.Equal(t, "renders/RFC-shaded.png", merged.Instances[1].Renders.Path)
	require.Empty(t, merged.Instances[1].Floors)
	require.Equal(t, mesh, merged.Instances[2].Mesh)
	require.Equal(t, "renders/RoL-shaded-aligned.png", merged.Instances[2].Renders.Path)
	require.Contains(t, string(data), `"floors": []`)

	// A fresh merge with absent optional layers drops stale overlays.
	require.NoError(t, mergeWowdataMaps(out, "", "", "", filepath.Join(dir, "clean.json")))
	clean, err := os.ReadFile(filepath.Join(dir, "clean.json"))
	require.NoError(t, err)
	require.NotContains(t, string(clean), `"mesh":`)
	require.NotContains(t, string(clean), `"renders":`)

	// Invalid layers must not replace an already published manifest.
	for _, tc := range []struct {
		name, kind string
		layer      wowMapLayer
	}{
		{"mixed fields", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 1, Height: 1}, Mesh: mesh}}}},
		{"duplicate mapID", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 1, Height: 1}}, {MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Width: 1, Height: 1}}}}},
		{"bad dimensions", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.png", Height: 1}}}}},
		{"wrong extension", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 43, Renders: &wowMapManualRender{Path: "renders/43.jpg", Width: 1, Height: 1}}}}},
		{"unnamed new instance", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 999, Renders: &wowMapManualRender{Path: "renders/999.png", Width: 1, Height: 1}}}}},
		{"conflicting names", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 2999, Name: "Wrong dungeon", Renders: &wowMapManualRender{Path: "renders/2999.png", Width: 1, Height: 1}}}}},
		{"wrong target", "renders", wowMapLayer{Format: wowMapManifestFormat, Target: target}},
		{"unnamed mesh", "meshes", wowMapLayer{Format: wowMapManifestFormat, Target: product, Instances: []wowMapLayerInstance{{MapID: 999, Mesh: mesh}}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			file := filepath.Join(t.TempDir(), "invalid.json")
			writeMapLayerTest(t, file, tc.layer)
			meshFile, rendersFile := meshes, renders
			if tc.kind == "renders" {
				rendersFile = file
			} else {
				meshFile = file
			}
			require.Error(t, mergeWowdataMaps(original, "", meshFile, rendersFile, out))
			current, err := os.ReadFile(out)
			require.NoError(t, err)
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
