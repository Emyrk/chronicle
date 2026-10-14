package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"strings"

	"github.com/coder/serpent"
)

// wowMapLayer contains only the metadata needed to attach rendered artwork.
// Keep this separate from wowMapManifest so a layer cannot replace original metadata.
type wowMapLayer struct {
	Format    string                `json:"format"`
	Target    wowMapTarget          `json:"target"`
	Instances []wowMapLayerInstance `json:"instances"`
}

type wowMapLayerInstance struct {
	MapID int32 `json:"mapID"`
	// Name is required only when a meshes layer creates a mesh-only instance
	// for a mapID the original manifest has no instance for (a dungeon
	// without in-game map artwork); the original's name wins otherwise.
	Name     string                  `json:"name,omitempty"`
	Rendered *wowMapRenderedInstance `json:"rendered,omitempty"`
	Styled   *wowMapRenderedInstance `json:"styled,omitempty"`
	Mesh     *wowMapMeshInstance     `json:"mesh,omitempty"`
}

// MergeWowdataMapsCmd joins independently generated instance artwork with
// the original, authoritative map manifest.
func MergeWowdataMapsCmd() *serpent.Command {
	var original, render, styled, meshes, out string
	return &serpent.Command{
		Use:   "merge-wowdata-maps",
		Short: "Merge original, rendered, styled and mesh map manifests.",
		Options: serpent.OptionSet{
			{Name: "original", Description: "Original map manifest (required).", Flag: "original", Value: serpent.StringOf(&original)},
			{Name: "render", Description: "Optional rendered map layer.", Flag: "render", Value: serpent.StringOf(&render)},
			{Name: "styled", Description: "Optional styled map layer.", Flag: "styled", Value: serpent.StringOf(&styled)},
			{Name: "meshes", Description: "Optional dungeon mesh layer.", Flag: "meshes", Value: serpent.StringOf(&meshes)},
			{Name: "out", Description: "Output merged manifest path.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(_ *serpent.Invocation) error {
			if original == "" || out == "" {
				return fmt.Errorf("--original and --out are required")
			}
			return mergeWowdataMaps(original, render, styled, meshes, out)
		},
	}
}

func mergeWowdataMaps(originalPath, renderPath, styledPath, meshesPath, outPath string) error {
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
	instances := make(map[int32]int, len(manifest.Instances))
	for i := range manifest.Instances {
		instance := &manifest.Instances[i]
		if _, exists := instances[instance.MapID]; exists {
			return fmt.Errorf("duplicate original instance mapID %d", instance.MapID)
		}
		// The original manifest owns metadata, not rendered artwork. This also
		// makes rerunning a merge independent of any stale original overlays.
		instance.Rendered, instance.Styled, instance.Mesh = nil, nil, nil
		instances[instance.MapID] = i
	}
	for _, layer := range []struct{ kind, file string }{{"render", renderPath}, {"styled", styledPath}, {"meshes", meshesPath}} {
		if err := mergeWowMapLayer(layer.file, layer.kind, &manifest, instances); err != nil {
			return err
		}
	}
	return writeWowMapManifest(outPath, manifest)
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
// mapID in instances. A meshes layer may add a mesh-only instance for a
// mapID the original lacks; every other layer needs an existing instance.
func mergeWowMapLayer(file, kind string, manifest *wowMapManifest, instances map[int32]int) error {
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
	// Rendered geometry is drawn for one build; styled art and meshes are
	// published per product and carried across builds.
	target := manifest.Target
	if kind == "render" && layer.Target != target || kind != "render" && (layer.Target.Product != target.Product || layer.Target.Build != "" || layer.Target.Region != "" || layer.Target.Locale != "") {
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
			if kind != "meshes" {
				return fmt.Errorf("unknown %s map layer mapID %d", kind, entry.MapID)
			}
			if entry.Name == "" {
				return fmt.Errorf("meshes map layer mapID %d has no instance in the original manifest and no name", entry.MapID)
			}
			// Mesh-only instance: a dungeon without in-game map artwork, so
			// no floors; the mesh is all the frontend has to show.
			index = len(manifest.Instances)
			manifest.Instances = append(manifest.Instances, wowMapInstance{MapID: entry.MapID, Name: entry.Name, Floors: []wowMapInstanceFloor{}})
			instances[entry.MapID] = index
		}
		if err := applyWowMapLayerEntry(kind, entry, &manifest.Instances[index]); err != nil {
			return err
		}
	}
	return nil
}

// wowMapMeshLiquidColor is the only colour syntax the frontend applies.
var wowMapMeshLiquidColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// applyWowMapLayerEntry copies the one artwork a layer of `kind` may carry
// for an instance onto it, after checking its path and metadata.
func applyWowMapLayerEntry(kind string, entry wowMapLayerInstance, instance *wowMapInstance) error {
	if kind == "meshes" {
		mesh := entry.Mesh
		if mesh == nil || entry.Rendered != nil || entry.Styled != nil {
			return fmt.Errorf("meshes map layer mapID %d must contain mesh only", entry.MapID)
		}
		if !validWowMapLayerPath(mesh.Path, "3d/") || !strings.HasSuffix(mesh.Path, ".glb") ||
			!(mesh.Bounds.MinX < mesh.Bounds.MaxX) || !(mesh.Bounds.MinY < mesh.Bounds.MaxY) || !(mesh.ZMin < mesh.ZMax) ||
			mesh.Frame != wowMapMeshFrame {
			return fmt.Errorf("invalid meshes map layer mesh for mapID %d", entry.MapID)
		}
		if liquid := mesh.Liquid; liquid != nil && (!wowMapMeshLiquidColor.MatchString(liquid.Color) || !(liquid.Opacity > 0) || liquid.Opacity > 1) {
			return fmt.Errorf("invalid meshes map layer liquid for mapID %d", entry.MapID)
		}
		instance.Mesh = mesh
		return nil
	}
	var artwork *wowMapRenderedInstance
	prefix := "render/"
	if kind == "render" {
		if entry.Rendered == nil || entry.Styled != nil || entry.Mesh != nil {
			return fmt.Errorf("render map layer mapID %d must contain rendered only", entry.MapID)
		}
		artwork = entry.Rendered
	} else {
		if entry.Styled == nil || entry.Rendered != nil || entry.Mesh != nil {
			return fmt.Errorf("styled map layer mapID %d must contain styled only", entry.MapID)
		}
		artwork = entry.Styled
		prefix = "render-styled/"
	}
	if !validWowMapLayerPath(artwork.Path, prefix) || artwork.Width <= 0 || artwork.Height <= 0 {
		return fmt.Errorf("invalid %s map layer artwork for mapID %d", kind, entry.MapID)
	}
	if kind == "render" {
		instance.Rendered = artwork
	} else {
		instance.Styled = artwork
	}
	return nil
}

// validWowMapLayerPath accepts a clean, relative asset path under prefix.
func validWowMapLayerPath(assetPath, prefix string) bool {
	return strings.HasPrefix(assetPath, prefix) && path.Clean(assetPath) == assetPath &&
		!strings.Contains(assetPath, "\\") && !strings.Contains(assetPath, "//")
}
