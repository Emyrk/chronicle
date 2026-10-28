package api

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/Emyrk/chronicle/frontend"
)

const maxLuaTarBytes = 8 << 20
const maxLuaExpandedBytes = 16 << 20
const maxLuaFiles = 128

// luaAddonIcons are the icon names project.json "icon" may use; the browser draws the same list.
var luaAddonIcons = func() map[string]bool {
	var names []string
	if err := json.Unmarshal(frontend.AddonIcons, &names); err != nil {
		panic(fmt.Sprintf("decode addon icons: %v", err))
	}
	icons := make(map[string]bool, len(names))
	for _, name := range names {
		icons[name] = true
	}
	return icons
}()

// luaReadmeName is the package's optional Markdown README, shown on the addon page. It is never executed.
const luaReadmeName = "README.md"
const maxLuaReadmeBytes = 64 << 10

// luaPanelStreams are the instance event streams a panel may declare; they match /events/{type} and the
// frontend's PANEL_STREAMS.
var luaPanelStreams = map[string]bool{
	"damage": true, "heal": true, "absorbed": true, "resource_change": true, "extra_attack": true, "slain": true,
	"ressurection": true, "cast": true, "spell_start": true, "spell_go": true, "spell_fail": true, "aura": true,
	"aura_cast": true, "dispel": true, "interrupt": true, "unit_classification": true, "unit_position": true,
	"unit_resources": true, "combatant_info": true, "consume": true, "raid_group": true,
}

func safeLuaPackagePath(name string) bool {
	if name == "" || strings.Contains(name, "\\") || strings.HasPrefix(name, "/") || strings.ContainsRune(name, 0) || strings.Contains(name, ":") || path.Clean(name) != name || name == ".." || strings.HasPrefix(name, "../") || strings.Contains(name, "/../") {
		return false
	}
	// Restrict names to ASCII so Unicode normalization cannot create two ZIP
	// entries that the browser treats as the same package-local path.
	for _, r := range name {
		if r > 127 || r < 32 {
			return false
		}
	}
	for _, part := range strings.Split(name, "/") {
		if strings.HasPrefix(strings.ToLower(part), "chronicle.") {
			return false
		}
	}
	return true
}

func rasterAsset(name string) bool {
	switch path.Ext(name) {
	case ".png", ".jpg", ".jpeg", ".webp":
		return true
	default:
		return false
	}
}

// Do not rely on a file extension to identify user-supplied image bytes. In
// particular, SVG or HTML renamed to .png must not reach the browser as an asset.
func validRasterSignature(name string, data []byte) bool {
	switch path.Ext(name) {
	case ".png":
		return len(data) >= 8 && bytes.Equal(data[:8], []byte("\x89PNG\r\n\x1a\n"))
	case ".jpg", ".jpeg":
		return len(data) >= 3 && bytes.Equal(data[:3], []byte{0xff, 0xd8, 0xff})
	case ".webp":
		return len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP"
	default:
		return false
	}
}

// luaZIPFileBytes counts the logical file bytes inside the validated ZIP,
// excluding ZIP headers. ZIP entries currently use Store (no compression).
func luaZIPFileBytes(archive []byte) (int64, error) {
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return 0, err
	}
	var size int64
	for _, file := range reader.File {
		if file.UncompressedSize64 > uint64(maxLuaExpandedBytes)-uint64(size) {
			return 0, errors.New("ZIP exceeds expanded package limit")
		}
		size += int64(file.UncompressedSize64)
	}
	return size, nil
}

// canonicalLuaZIP rejects tar features which could escape a package root or
// produce different packages depending on the extraction environment.
func canonicalLuaZIP(input io.Reader, kind, projectName, slug string) ([]byte, error) {
	files := map[string][]byte{}
	raw, err := io.ReadAll(io.LimitReader(input, maxLuaTarBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxLuaTarBytes {
		return nil, errors.New("tar exceeds upload limit")
	}
	reader := tar.NewReader(bytes.NewReader(raw))
	var total int64
	var luaBytes int64
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("invalid tar: %w", err)
		}
		name := header.Name
		if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, "\\") || strings.ContainsRune(name, 0) || path.Clean(name) != strings.TrimSuffix(name, "/") || name == "." || name == ".." || strings.HasPrefix(name, "../") || strings.Contains(name, "/../") {
			return nil, fmt.Errorf("unsafe tar path %q", name)
		}
		if header.Typeflag == tar.TypeDir {
			continue
		}
		if header.Typeflag != tar.TypeReg {
			return nil, fmt.Errorf("unsupported tar entry %q", name)
		}
		if _, exists := files[name]; exists {
			return nil, fmt.Errorf("duplicate tar path %q", name)
		}
		if len(files) >= maxLuaFiles || header.Size < 0 || header.Size > 2<<20 || header.Size > maxLuaExpandedBytes-total {
			return nil, errors.New("tar exceeds package limits")
		}
		if path.Ext(name) == ".lua" {
			luaBytes += header.Size
			if luaBytes > 1<<20 {
				return nil, errors.New("lua source exceeds package limit")
			}
		}
		data, err := io.ReadAll(io.LimitReader(reader, header.Size+1))
		if err != nil || int64(len(data)) != header.Size {
			return nil, errors.New("truncated tar entry")
		}
		files[name] = data
		total += header.Size
	}
	manifestBytes, ok := files["project.json"]
	if !ok || len(manifestBytes) > 32<<10 {
		return nil, errors.New("missing or oversized project.json")
	}
	var manifest struct {
		ManifestVersion int      `json:"manifest_version"`
		Kind            string   `json:"kind"`
		Name            string   `json:"name"`
		Slug            string   `json:"slug"`
		Entrypoint      string   `json:"entrypoint"`
		Capabilities    []string `json:"capabilities"`
		Streams         []string `json:"streams"`
		StreamScope     string   `json:"stream_scope"`
		MaxEvents       *int64   `json:"max_events"`
		Assets          []string `json:"assets"`
		Icon            string   `json:"icon"`
	}
	decoder := json.NewDecoder(bytes.NewReader(manifestBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("invalid project.json: %w", err)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return nil, errors.New("project.json contains trailing data")
	}
	if manifest.ManifestVersion != 1 || manifest.Kind != kind || manifest.Name != projectName || manifest.Slug != slug {
		return nil, errors.New("project.json metadata mismatch")
	}
	seenStreams := map[string]bool{}
	for _, stream := range manifest.Streams {
		if !luaPanelStreams[stream] || seenStreams[stream] {
			return nil, fmt.Errorf("unsupported or duplicate stream %q", stream)
		}
		seenStreams[stream] = true
	}
	if manifest.StreamScope != "" && manifest.StreamScope != "selection" && manifest.StreamScope != "instance" {
		return nil, fmt.Errorf("unsupported stream_scope %q", manifest.StreamScope)
	}
	// Panels replay every event in scope; max_events is the author's optional bound, never a host cap.
	if manifest.MaxEvents != nil && (*manifest.MaxEvents < 1 || *manifest.MaxEvents > 1<<53) {
		return nil, errors.New("max_events must be a positive integer")
	}
	if manifest.Icon != "" && !luaAddonIcons[manifest.Icon] {
		return nil, fmt.Errorf("unsupported icon %q; use a name from the Addon API reference", manifest.Icon)
	}
	seenCapabilities := map[string]bool{}
	for _, capability := range manifest.Capabilities {
		if (capability != "ui" && capability != "input") || seenCapabilities[capability] {
			return nil, fmt.Errorf("unsupported or duplicate capability %q", capability)
		}
		seenCapabilities[capability] = true
	}
	if !safeLuaPackagePath(manifest.Entrypoint) || path.Ext(manifest.Entrypoint) != ".lua" {
		return nil, errors.New("invalid Lua entrypoint")
	}
	if _, exists := files[manifest.Entrypoint]; !exists {
		return nil, errors.New("lua entrypoint is missing")
	}
	assets := make(map[string]bool, len(manifest.Assets))
	for _, asset := range manifest.Assets {
		if !safeLuaPackagePath(asset) || !rasterAsset(asset) || assets[asset] {
			return nil, fmt.Errorf("invalid or duplicate asset %q", asset)
		}
		assets[asset] = true
		data, exists := files[asset]
		if !exists || len(data) > 2<<20 || !validRasterSignature(asset, data) {
			return nil, fmt.Errorf("declared asset %q is missing, oversized, or not a supported image", asset)
		}
	}
	if readme, ok := files[luaReadmeName]; ok && (len(readme) > maxLuaReadmeBytes || !utf8.Valid(readme) || bytes.IndexByte(readme, 0) >= 0) {
		return nil, errors.New("README.md must be UTF-8 text of at most 64 KiB")
	}
	for name := range files {
		if name == "project.json" || name == luaReadmeName {
			continue
		}
		if !safeLuaPackagePath(name) || (path.Ext(name) != ".lua" && (!rasterAsset(name) || !assets[name])) {
			return nil, fmt.Errorf("unsupported package file %q", name)
		}
	}
	if len(files) == 0 {
		return nil, errors.New("empty tar package")
	}
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	for _, name := range names {
		header := &zip.FileHeader{Name: name, Method: zip.Store}
		header.SetMode(0644)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return nil, err
		}
		if _, err := entry.Write(files[name]); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	if out.Len() > maxLuaTarBytes {
		return nil, errors.New("ZIP exceeds runtime archive limit")
	}
	return out.Bytes(), nil
}

// luaPackageIcon returns project.json "icon" from a package canonicalLuaZIP produced, or "" when unset.
func luaPackageIcon(archive []byte) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(archive), int64(len(archive)))
	if err != nil {
		return "", err
	}
	file, err := reader.Open("project.json")
	if err != nil {
		return "", err
	}
	defer file.Close()
	var manifest struct {
		Icon string `json:"icon"`
	}
	if err := json.NewDecoder(io.LimitReader(file, 32<<10)).Decode(&manifest); err != nil {
		return "", err
	}
	return manifest.Icon, nil
}
