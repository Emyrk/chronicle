package cli

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
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
	Rendered *wowMapRenderedInstance `json:"rendered,omitempty"`
	Styled   *wowMapRenderedInstance `json:"styled,omitempty"`
}

// MergeWowdataMapsCmd joins independently generated instance artwork with
// the original, authoritative map manifest.
func MergeWowdataMapsCmd() *serpent.Command {
	var original, render, styled, out string
	return &serpent.Command{
		Use:   "merge-wowdata-maps",
		Short: "Merge original, rendered and styled map manifests.",
		Options: serpent.OptionSet{
			{Name: "original", Description: "Original map manifest (required).", Flag: "original", Value: serpent.StringOf(&original)},
			{Name: "render", Description: "Optional rendered map layer.", Flag: "render", Value: serpent.StringOf(&render)},
			{Name: "styled", Description: "Optional styled map layer.", Flag: "styled", Value: serpent.StringOf(&styled)},
			{Name: "out", Description: "Output merged manifest path.", Flag: "out", Value: serpent.StringOf(&out)},
		},
		Handler: func(_ *serpent.Invocation) error {
			if original == "" || out == "" {
				return fmt.Errorf("--original and --out are required")
			}
			return mergeWowdataMaps(original, render, styled, out)
		},
	}
}

func mergeWowdataMaps(originalPath, renderPath, styledPath, outPath string) error {
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
		instances[instance.MapID] = instance
	}
	if err := mergeWowMapLayer(renderPath, "render", manifest.Target, instances); err != nil {
		return err
	}
	if err := mergeWowMapLayer(styledPath, "styled", manifest.Target, instances); err != nil {
		return err
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

func mergeWowMapLayer(file, kind string, target wowMapTarget, instances map[int32]*wowMapInstance) error {
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
	if kind == "render" && layer.Target != target || kind == "styled" && (layer.Target.Product != target.Product || layer.Target.Build != "" || layer.Target.Region != "" || layer.Target.Locale != "") {
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
			return fmt.Errorf("unknown %s map layer mapID %d", kind, entry.MapID)
		}
		var artwork *wowMapRenderedInstance
		if kind == "render" {
			if entry.Rendered == nil || entry.Styled != nil {
				return fmt.Errorf("render map layer mapID %d must contain rendered only", entry.MapID)
			}
			artwork = entry.Rendered
		} else {
			if entry.Styled == nil || entry.Rendered != nil {
				return fmt.Errorf("styled map layer mapID %d must contain styled only", entry.MapID)
			}
			artwork = entry.Styled
		}
		prefix := kind + "/"
		if kind == "styled" {
			prefix = "render-styled/"
		}
		if !strings.HasPrefix(artwork.Path, prefix) || path.Clean(artwork.Path) != artwork.Path || strings.Contains(artwork.Path, "\\") || strings.Contains(artwork.Path, "//") || artwork.Width <= 0 || artwork.Height <= 0 {
			return fmt.Errorf("invalid %s map layer artwork for mapID %d", kind, entry.MapID)
		}
		if kind == "render" {
			instance.Rendered = artwork
		} else {
			instance.Styled = artwork
		}
	}
	return nil
}
