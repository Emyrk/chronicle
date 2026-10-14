package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"sort"
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
	MapID    int32                   `json:"mapID"`
	Name     string                  `json:"name,omitempty"`
	Rendered *wowMapRenderedInstance `json:"rendered,omitempty"`
	Styled   *wowMapRenderedInstance `json:"styled,omitempty"`
	Renders  *wowMapManualRender     `json:"renders,omitempty"`
	Model3D  *wowMap3DAsset          `json:"3d,omitempty"`
}

// MergeWowdataMapsCmd joins independently generated instance artwork with
// the original, authoritative map manifest.
func MergeWowdataMapsCmd() *serpent.Command {
	var original, render, styled, renders, model3d, out string
	return &serpent.Command{
		Use:   "merge-wowdata-maps",
		Short: "Merge native, generated, and manually uploaded map layers.",
		Options: serpent.OptionSet{
			{Name: "original", Description: "Original map manifest (required).", Flag: "original", Value: serpent.StringOf(&original)},
			{Name: "render", Description: "Optional rendered map layer.", Flag: "render", Value: serpent.StringOf(&render)},
			{Name: "styled", Description: "Optional styled map layer.", Flag: "styled", Value: serpent.StringOf(&styled)},
			{Name: "renders", Description: "Optional manually uploaded 2D render layer.", Flag: "renders", Value: serpent.StringOf(&renders)},
			{Name: "3d", Description: "Optional manually uploaded 3D model layer.", Flag: "3d", Value: serpent.StringOf(&model3d)},
			{Name: "out", Description: "Output merged manifest path.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(_ *serpent.Invocation) error {
			if original == "" || out == "" {
				return fmt.Errorf("--original and --out are required")
			}
			return mergeWowdataMapsWithManual(original, render, styled, renders, model3d, out)
		},
	}
}

func mergeWowdataMaps(originalPath, renderPath, styledPath, outPath string) error {
	return mergeWowdataMapsWithManual(originalPath, renderPath, styledPath, "", "", outPath)
}

func mergeWowdataMapsWithManual(originalPath, renderPath, styledPath, rendersPath, model3dPath, outPath string) error {
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
	instances := make(map[int32]*wowMapInstance, len(manifest.Instances))
	for i := range manifest.Instances {
		instance := &manifest.Instances[i]
		if _, exists := instances[instance.MapID]; exists {
			return fmt.Errorf("duplicate original instance mapID %d", instance.MapID)
		}
		// The original manifest owns metadata, not rendered artwork. This also
		// makes rerunning a merge independent of any stale original overlays.
		instance.Rendered, instance.Styled = nil, nil
		instance.Renders, instance.Model3D = nil, nil
		instances[instance.MapID] = instance
	}
	created := make(map[int32]*wowMapInstance)
	if err := mergeWowMapLayer(renderPath, "render", manifest.Target, instances, created); err != nil {
		return err
	}
	if err := mergeWowMapLayer(styledPath, "styled", manifest.Target, instances, created); err != nil {
		return err
	}
	if err := mergeWowMapLayer(rendersPath, "renders", manifest.Target, instances, created); err != nil {
		return err
	}
	if err := mergeWowMapLayer(model3dPath, "3d", manifest.Target, instances, created); err != nil {
		return err
	}
	ids := make([]int32, 0, len(created))
	for id := range created {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, id := range ids {
		manifest.Instances = append(manifest.Instances, *created[id])
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

func mergeWowMapLayer(file, kind string, target wowMapTarget, instances, created map[int32]*wowMapInstance) error {
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
	if kind == "render" && layer.Target != target || kind != "render" && (layer.Target.Product != target.Product || layer.Target.Build != "" || layer.Target.Region != "" || layer.Target.Locale != "") {
		return fmt.Errorf("%s map layer target does not match original", kind)
	}
	seen := make(map[int32]struct{}, len(layer.Instances))
	for _, entry := range layer.Instances {
		if _, exists := seen[entry.MapID]; exists {
			return fmt.Errorf("duplicate %s map layer mapID %d", kind, entry.MapID)
		}
		seen[entry.MapID] = struct{}{}
		instance := instances[entry.MapID]
		if instance == nil {
			if kind != "renders" && kind != "3d" {
				return fmt.Errorf("unknown %s map layer mapID %d", kind, entry.MapID)
			}
			if entry.MapID <= 0 || strings.TrimSpace(entry.Name) == "" {
				return fmt.Errorf("%s map layer mapID %d needs a positive mapID and name to create an instance", kind, entry.MapID)
			}
			instance = &wowMapInstance{MapID: entry.MapID, Name: entry.Name, InstanceType: 1, Floors: []wowMapInstanceFloor{}}
			instances[entry.MapID] = instance
			created[entry.MapID] = instance
		} else if created[entry.MapID] != nil && entry.Name != "" && entry.Name != instance.Name {
			return fmt.Errorf("conflicting names for manually created instance mapID %d", entry.MapID)
		}
		fields := 0
		for _, present := range []bool{entry.Rendered != nil, entry.Styled != nil, entry.Renders != nil, entry.Model3D != nil} {
			if present {
				fields++
			}
		}
		if fields != 1 {
			return fmt.Errorf("%s map layer mapID %d must contain only its own artwork", kind, entry.MapID)
		}
		switch kind {
		case "render", "styled":
			artwork := entry.Rendered
			prefix := "render/"
			if kind == "styled" {
				artwork, prefix = entry.Styled, "render-styled/"
			}
			if artwork == nil {
				return fmt.Errorf("%s map layer mapID %d must contain %s only", kind, entry.MapID, kind)
			}
			if !validWowMapAssetPath(artwork.Path, prefix) || artwork.Width <= 0 || artwork.Height <= 0 {
				return fmt.Errorf("invalid %s map layer artwork for mapID %d", kind, entry.MapID)
			}
			if kind == "render" {
				instance.Rendered = artwork
			} else {
				instance.Styled = artwork
			}
		case "renders":
			artwork := entry.Renders
			if artwork == nil || !validWowMapAssetPath(artwork.Path, "renders/") || !strings.HasSuffix(artwork.Path, ".png") || artwork.Width <= 0 || artwork.Height <= 0 {
				return fmt.Errorf("invalid renders map layer artwork for mapID %d", entry.MapID)
			}
			instance.Renders = artwork
		case "3d":
			asset := entry.Model3D
			if asset == nil || !validWowMapAssetPath(asset.Path, "3d/") || !strings.HasSuffix(asset.Path, ".glb") {
				return fmt.Errorf("invalid 3d map layer artwork for mapID %d", entry.MapID)
			}
			instance.Model3D = asset
		default:
			return fmt.Errorf("unsupported map layer %q", kind)
		}
	}
	return nil
}

func validWowMapAssetPath(assetPath, prefix string) bool {
	return strings.HasPrefix(assetPath, prefix) && len(assetPath) > len(prefix) &&
		path.Clean(assetPath) == assetPath && !strings.Contains(assetPath, "\\") &&
		!strings.Contains(assetPath, "//")
}
