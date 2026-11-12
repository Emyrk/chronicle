package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/coder/serpent"
)

type wowMapReuseLayer struct {
	Format    string           `json:"format"`
	Target    wowMapTarget     `json:"target"`
	Instances []wowMapInstance `json:"instances"`
}

// wowMapLayer contains only the metadata needed to attach optional artwork.
// Keep this separate from wowMapManifest so a layer cannot replace original metadata.
type wowMapLayer struct {
	Format    string                `json:"format"`
	Target    wowMapTarget          `json:"target"`
	Instances []wowMapLayerInstance `json:"instances"`
}

type wowMapLayerInstance struct {
	MapID int32 `json:"mapID"`
	// Name is required when meshes or renders create an instance;
	// the original's name wins for an existing instance.
	Name    string                  `json:"name,omitempty"`
	Floors  []wowMapLayerFloor      `json:"floors,omitempty"`
	Styled  *wowMapRenderedInstance `json:"styled,omitempty"`
	Mesh    *wowMapMeshInstance     `json:"mesh,omitempty"`
	Renders *wowMapManualRender     `json:"renders,omitempty"`
}

type wowMapLayerFloor struct {
	Floor       int32               `json:"floor"`
	Preferred2D string              `json:"preferred2D,omitempty"`
	Mesh        *wowMapMeshInstance `json:"mesh,omitempty"`
	Renders     *wowMapManualRender `json:"renders,omitempty"`
}

// MergeWowdataMapsCmd joins independently generated instance artwork with
// the original, authoritative map manifest.
func MergeWowdataMapsCmd() *serpent.Command {
	var original, reuses, styled, meshes, renders, out string
	return &serpent.Command{
		Use:   "merge-wowdata-maps",
		Short: "Merge original, styled, renders and mesh map manifests.",
		Options: serpent.OptionSet{
			{Name: "original", Description: "Original map manifest (required).", Flag: "original", Value: serpent.StringOf(&original)},
			{Name: "reuses", Description: "Optional copied full-instance map layer.", Flag: "reuses", Value: serpent.StringOf(&reuses)},
			{Name: "styled", Description: "Optional styled map layer.", Flag: "styled", Value: serpent.StringOf(&styled)},
			{Name: "meshes", Description: "Optional dungeon mesh layer.", Flag: "meshes", Value: serpent.StringOf(&meshes)},
			{Name: "renders", Description: "Optional manually uploaded 2D render layer.", Flag: "renders", Value: serpent.StringOf(&renders)},
			{Name: "out", Description: "Output merged manifest path.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(_ *serpent.Invocation) error {
			if original == "" || out == "" {
				return fmt.Errorf("--original and --out are required")
			}
			return mergeWowdataMaps(original, styled, meshes, renders, out, reuses)
		},
	}
}

func mergeWowdataMaps(originalPath, styledPath, meshesPath, rendersPath, outPath string, reusePaths ...string) error {
	data, err := os.ReadFile(originalPath)
	if err != nil {
		return fmt.Errorf("read original map manifest: %w", err)
	}
	var manifest wowMapManifest
	if err := decodeWowMapJSON(data, &manifest); err != nil {
		return fmt.Errorf("decode original map manifest: %w", err)
	}
	if manifest.Format != wowMapManifestFormat {
		return fmt.Errorf("unsupported original map format %q", manifest.Format)
	}
	if manifest.Target.Product == "" {
		return fmt.Errorf("original map manifest has no target product")
	}
	mapIDs := make(map[int32]struct{}, len(manifest.Maps))
	for _, record := range manifest.Maps {
		if _, exists := mapIDs[record.ID]; exists {
			return fmt.Errorf("duplicate original UI map ID %d", record.ID)
		}
		mapIDs[record.ID] = struct{}{}
	}
	originalCount := len(manifest.Instances)
	instances := make(map[int32]int, originalCount)
	created := make(map[int32]struct{})
	for i := range manifest.Instances {
		instance := &manifest.Instances[i]
		if _, exists := instances[instance.MapID]; exists {
			return fmt.Errorf("duplicate original instance mapID %d", instance.MapID)
		}
		// The original manifest owns metadata, not optional artwork. This also
		// makes rerunning a merge independent of any stale original overlays.
		instance.ReusedFrom = nil
		instance.Styled, instance.Mesh, instance.Renders = nil, nil, nil
		for floorIndex := range instance.Floors {
			floor := &instance.Floors[floorIndex]
			floor.Preferred2D, floor.Mesh, floor.Renders = "", nil, nil
		}
		instances[instance.MapID] = i
	}
	reusesPath := ""
	if len(reusePaths) > 0 {
		reusesPath = reusePaths[0]
	}
	if err := mergeWowMapReuseLayer(reusesPath, &manifest, instances, created); err != nil {
		return err
	}
	for _, layer := range []struct{ kind, file string }{{"styled", styledPath}, {"meshes", meshesPath}, {"renders", rendersPath}} {
		if err := mergeWowMapLayer(layer.file, layer.kind, &manifest, instances, created); err != nil {
			return err
		}
	}
	// Preserve native ordering and deterministically append layer-only instances.
	sort.Slice(manifest.Instances[originalCount:], func(i, j int) bool {
		return manifest.Instances[originalCount+i].MapID < manifest.Instances[originalCount+j].MapID
	})
	return writeWowMapManifest(outPath, manifest)
}

func mergeWowMapReuseLayer(file string, manifest *wowMapManifest, instances map[int32]int, created map[int32]struct{}) error {
	if file == "" {
		return nil
	}
	data, err := os.ReadFile(file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read reuses map layer: %w", err)
	}
	var layer wowMapReuseLayer
	if err := decodeWowMapJSON(data, &layer); err != nil {
		return fmt.Errorf("decode reuses map layer: %w", err)
	}
	if layer.Format != wowMapManifestFormat {
		return fmt.Errorf("unsupported reuses map layer format %q", layer.Format)
	}
	target := manifest.Target
	if layer.Target.Product != target.Product || layer.Target.Build != "" || layer.Target.Region != "" || layer.Target.Locale != "" {
		return fmt.Errorf("reuses map layer target does not match original")
	}
	seen := make(map[int32]struct{}, len(layer.Instances))
	for _, instance := range layer.Instances {
		if _, exists := seen[instance.MapID]; exists {
			return fmt.Errorf("duplicate reuses map layer mapID %d", instance.MapID)
		}
		seen[instance.MapID] = struct{}{}
		if err := validateWowMapReusedInstance(&instance); err != nil {
			return err
		}
		if index, exists := instances[instance.MapID]; exists {
			manifest.Instances[index] = instance
		} else {
			instances[instance.MapID] = len(manifest.Instances)
			manifest.Instances = append(manifest.Instances, instance)
			created[instance.MapID] = struct{}{}
		}
	}
	return nil
}

func validateWowMapReusedInstance(instance *wowMapInstance) error {
	if instance.MapID <= 0 || strings.TrimSpace(instance.Name) == "" || instance.ReusedFrom == nil ||
		strings.TrimSpace(instance.ReusedFrom.Namespace) == "" || instance.ReusedFrom.MapID <= 0 {
		return fmt.Errorf("invalid reuses map layer instance mapID %d", instance.MapID)
	}
	if instance.Styled != nil && !validWowMapAbsoluteAssetPath(instance.Styled.Path, "render-styled/", ".png", ".webp", ".jpeg") {
		return fmt.Errorf("invalid reuses map layer styled artwork for mapID %d", instance.MapID)
	}
	if instance.Renders != nil && !validWowMapAbsoluteAssetPath(instance.Renders.Path, "renders/", ".png", ".webp") {
		return fmt.Errorf("invalid reuses map layer render for mapID %d", instance.MapID)
	}
	if instance.Mesh != nil {
		if !validWowMapAbsoluteAssetPath(instance.Mesh.Path, "3d/", ".glb") || validateWowMapLayerMesh(instance.MapID, 0, instance.Mesh) != nil {
			return fmt.Errorf("invalid reuses map layer mesh for mapID %d", instance.MapID)
		}
	}
	for _, floor := range instance.Floors {
		for _, tile := range floor.Tiles {
			if !validWowMapAbsoluteAssetPath(tile.Path, "original/", ".webp") && !validWowMapAbsoluteAssetPath(tile.Path, "tiles/", ".webp") {
				return fmt.Errorf("invalid reuses map layer tile for mapID %d floor %d", instance.MapID, floor.Floor)
			}
		}
		if floor.Renders != nil && !validWowMapAbsoluteAssetPath(floor.Renders.Path, "renders/", ".png", ".webp") {
			return fmt.Errorf("invalid reuses map layer render for mapID %d floor %d", instance.MapID, floor.Floor)
		}
		if floor.Mesh != nil && (!validWowMapAbsoluteAssetPath(floor.Mesh.Path, "3d/", ".glb") || validateWowMapLayerMesh(instance.MapID, floor.Floor, floor.Mesh) != nil) {
			return fmt.Errorf("invalid reuses map layer mesh for mapID %d floor %d", instance.MapID, floor.Floor)
		}
	}
	return nil
}

func decodeWowMapJSON(data []byte, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err != nil {
			return err
		}
		return fmt.Errorf("unexpected trailing JSON value")
	}
	return nil
}

// mergeWowMapLayer applies a layer file to manifest.Instances, indexed by
// mapID in instances. Meshes and renders may create floorless instances;
// styled layers need an existing instance.
func mergeWowMapLayer(file, kind string, manifest *wowMapManifest, instances map[int32]int, created map[int32]struct{}) error {
	if file == "" {
		return nil
	}
	data, err := os.ReadFile(file)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s map layer: %w", kind, err)
	}
	var layer wowMapLayer
	if err := decodeWowMapJSON(data, &layer); err != nil {
		return fmt.Errorf("decode %s map layer: %w", kind, err)
	}
	if layer.Format != wowMapManifestFormat {
		return fmt.Errorf("unsupported %s map layer format %q", kind, layer.Format)
	}
	// Optional artwork is published per product and carried across builds.
	target := manifest.Target
	if layer.Target.Product != target.Product || layer.Target.Build != "" || layer.Target.Region != "" || layer.Target.Locale != "" {
		return fmt.Errorf("%s map layer target does not match original", kind)
	}
	seen := make(map[int32]struct{}, len(layer.Instances))
	for _, entry := range layer.Instances {
		if _, exists := seen[entry.MapID]; exists {
			return fmt.Errorf("duplicate %s map layer mapID %d", kind, entry.MapID)
		}
		seen[entry.MapID] = struct{}{}
		index, known := instances[entry.MapID]
		if !known {
			if kind != "meshes" && kind != "renders" {
				return fmt.Errorf("unknown %s map layer mapID %d", kind, entry.MapID)
			}
			if entry.MapID <= 0 || strings.TrimSpace(entry.Name) == "" {
				return fmt.Errorf("%s map layer mapID %d needs a positive mapID and name to create an instance", kind, entry.MapID)
			}
			index = len(manifest.Instances)
			manifest.Instances = append(manifest.Instances, wowMapInstance{MapID: entry.MapID, Name: entry.Name, Floors: []wowMapInstanceFloor{}})
			instances[entry.MapID] = index
			created[entry.MapID] = struct{}{}
		} else if _, wasCreated := created[entry.MapID]; wasCreated && entry.Name != "" && entry.Name != manifest.Instances[index].Name {
			return fmt.Errorf("conflicting names for manually created instance mapID %d", entry.MapID)
		}
		if err := applyWowMapLayerEntry(kind, entry, &manifest.Instances[index]); err != nil {
			return err
		}
	}
	return nil
}

// wowMapMeshLiquidColor is the only colour syntax the frontend applies.
var wowMapMeshLiquidColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// applyWowMapLayerEntry copies the artwork a layer of `kind` may carry
// for an instance or its floors, after checking paths and metadata.
func applyWowMapLayerEntry(kind string, entry wowMapLayerInstance, instance *wowMapInstance) error {
	if len(entry.Floors) > 0 {
		if entry.Styled != nil || entry.Mesh != nil || entry.Renders != nil || kind == "styled" {
			return fmt.Errorf("%s map layer mapID %d cannot mix floors with instance artwork", kind, entry.MapID)
		}
		seen := make(map[int32]struct{}, len(entry.Floors))
		for _, layerFloor := range entry.Floors {
			if _, exists := seen[layerFloor.Floor]; exists {
				return fmt.Errorf("duplicate %s map layer floor %d for mapID %d", kind, layerFloor.Floor, entry.MapID)
			}
			seen[layerFloor.Floor] = struct{}{}
			floor := wowMapInstanceFloorByNumber(instance, layerFloor.Floor)
			if floor == nil {
				instance.Floors = append(instance.Floors, wowMapInstanceFloor{Floor: layerFloor.Floor, Tiles: []wowMapTile{}})
				floor = &instance.Floors[len(instance.Floors)-1]
			}
			if err := applyWowMapFloorLayerEntry(kind, entry.MapID, layerFloor, floor); err != nil {
				return err
			}
		}
		sort.Slice(instance.Floors, func(i, j int) bool { return instance.Floors[i].Floor < instance.Floors[j].Floor })
		return nil
	}
	if kind == "meshes" {
		if entry.Mesh == nil || entry.Styled != nil || entry.Renders != nil {
			return fmt.Errorf("meshes map layer mapID %d must contain mesh only", entry.MapID)
		}
		if err := validateWowMapLayerMesh(entry.MapID, 0, entry.Mesh); err != nil {
			return err
		}
		instance.Mesh = entry.Mesh
		return nil
	}
	if kind == "renders" {
		if entry.Renders == nil || entry.Styled != nil || entry.Mesh != nil {
			return fmt.Errorf("invalid renders map layer artwork for mapID %d", entry.MapID)
		}
		if err := validateWowMapLayerRender(entry.MapID, 0, entry.Renders); err != nil {
			return err
		}
		instance.Renders = entry.Renders
		return nil
	}
	if entry.Styled == nil || entry.Mesh != nil || entry.Renders != nil {
		return fmt.Errorf("styled map layer mapID %d must contain styled only", entry.MapID)
	}
	artwork := entry.Styled
	if !validWowMapLayerPath(artwork.Path, "render-styled/") || artwork.Width <= 0 || artwork.Height <= 0 {
		return fmt.Errorf("invalid styled map layer artwork for mapID %d", entry.MapID)
	}
	instance.Styled = artwork
	return nil
}

func wowMapInstanceFloorByNumber(instance *wowMapInstance, number int32) *wowMapInstanceFloor {
	for i := range instance.Floors {
		if instance.Floors[i].Floor == number {
			return &instance.Floors[i]
		}
	}
	return nil
}

func applyWowMapFloorLayerEntry(kind string, mapID int32, layer wowMapLayerFloor, floor *wowMapInstanceFloor) error {
	if kind == "meshes" {
		if layer.Mesh == nil || layer.Renders != nil || layer.Preferred2D != "" {
			return fmt.Errorf("meshes map layer mapID %d floor %d must contain mesh only", mapID, layer.Floor)
		}
		if err := validateWowMapLayerMesh(mapID, layer.Floor, layer.Mesh); err != nil {
			return err
		}
		floor.Mesh = layer.Mesh
		return nil
	}
	if layer.Renders == nil || layer.Mesh != nil || (layer.Preferred2D != "" && layer.Preferred2D != "renders" && layer.Preferred2D != "art") {
		return fmt.Errorf("invalid renders map layer artwork for mapID %d floor %d", mapID, layer.Floor)
	}
	if err := validateWowMapLayerRender(mapID, layer.Floor, layer.Renders); err != nil {
		return err
	}
	floor.Renders = layer.Renders
	floor.Preferred2D = layer.Preferred2D
	return nil
}

func validateWowMapLayerMesh(mapID, floor int32, mesh *wowMapMeshInstance) error {
	location := fmt.Sprintf("mapID %d", mapID)
	if floor != 0 {
		location += fmt.Sprintf(" floor %d", floor)
	}
	if !validWowMapMeshPath(mesh.Path) ||
		!(mesh.Bounds.MinX < mesh.Bounds.MaxX) || !(mesh.Bounds.MinY < mesh.Bounds.MaxY) || !(mesh.ZMin < mesh.ZMax) ||
		mesh.Frame != wowMapMeshFrame {
		return fmt.Errorf("invalid meshes map layer mesh for %s", location)
	}
	if liquid := mesh.Liquid; liquid != nil && (!wowMapMeshLiquidColor.MatchString(liquid.Color) || !(liquid.Opacity > 0) || liquid.Opacity > 1) {
		return fmt.Errorf("invalid meshes map layer liquid for %s", location)
	}
	return nil
}

func validWowMapAbsoluteAssetPath(assetPath, prefix string, extensions ...string) bool {
	assetURL, err := url.Parse(assetPath)
	if err != nil || assetURL.Scheme != "https" || assetURL.Host != "icons.chronicleclassic.com" ||
		assetURL.User != nil || assetURL.RawQuery != "" || assetURL.Fragment != "" {
		return false
	}
	parts := strings.SplitN(strings.TrimPrefix(assetURL.Path, "/"), "/maps/", 2)
	if len(parts) != 2 || parts[0] == "" || !validWowMapLayerPath(parts[1], prefix) {
		return false
	}
	for _, extension := range extensions {
		if strings.HasSuffix(parts[1], extension) {
			return true
		}
	}
	return false
}

func validWowMapMeshPath(assetPath string) bool {
	if validWowMapLayerPath(assetPath, "3d/") && strings.HasSuffix(assetPath, ".glb") {
		return true
	}
	return validWowMapAbsoluteAssetPath(assetPath, "3d/", ".glb")
}

func validateWowMapLayerRender(mapID, floor int32, artwork *wowMapManualRender) error {
	if !validWowMapLayerPath(artwork.Path, "renders/") || !validWowMapRenderExtension(artwork.Path) || artwork.Width <= 0 || artwork.Height <= 0 {
		if floor != 0 {
			return fmt.Errorf("invalid renders map layer artwork for mapID %d floor %d", mapID, floor)
		}
		return fmt.Errorf("invalid renders map layer artwork for mapID %d", mapID)
	}
	return nil
}

func validWowMapRenderExtension(assetPath string) bool {
	return strings.HasSuffix(assetPath, ".png") || strings.HasSuffix(assetPath, ".webp")
}

// validWowMapLayerPath accepts a clean, relative asset path under prefix.
func validWowMapLayerPath(assetPath, prefix string) bool {
	return strings.HasPrefix(assetPath, prefix) && len(assetPath) > len(prefix) && path.Clean(assetPath) == assetPath &&
		!strings.Contains(assetPath, "\\") && !strings.Contains(assetPath, "//")
}

// writeWowMapLayer writes a sparse, product-scoped source manifest.
func writeWowMapLayer(file string, layer wowMapLayer) error {
	data, err := json.MarshalIndent(layer, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(file, append(data, '\n'), 0o644)
}
