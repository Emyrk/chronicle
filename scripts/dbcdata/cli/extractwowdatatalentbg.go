package cli

import (
	"context"
	"fmt"
	"image"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Emyrk/chronicle/internal/wowdata"

	"github.com/HugoSmits86/nativewebp"
	"github.com/coder/serpent"
)

var foreverTalentBackgroundNames = func() map[string]bool {
	names := wowdata.ForeverTalentBackgroundNames()
	result := make(map[string]bool, len(names))
	for _, name := range names {
		result[strings.ToLower(name)] = true
	}
	return result
}()

type wowdataTalentBackgroundExtractOptions struct {
	WowdataBin string
	OutDir     string
	Client     string
	Source     string
	Product    string
	Build      string
	Region     string
	Locale     string
	Cache      string
	Workers    int64
}

// ExtractWowdataTalentBackgroundsCmd exports the classic talent-tree artwork
// retained by modern WoW clients and combines each four-quadrant background.
func ExtractWowdataTalentBackgroundsCmd() *serpent.Command {
	var opts wowdataTalentBackgroundExtractOptions
	var dbcPath, server string

	return &serpent.Command{
		Use:   "extract-wowdata-talent-backgrounds",
		Short: "Extract WoW Forever talent-tree backgrounds.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "out", Description: "Output directory for combined WebP files.", Flag: "out", Value: serpent.StringOf(&opts.OutDir)},
			{Name: "wowdata", Description: "Wowdata executable. A pinned build is provisioned when omitted.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: wowdataDefaultBinary, Value: serpent.StringOf(&opts.WowdataBin)},
			{Name: "source", Description: "Read CASC data from local client archives or Blizzard's CDN.", Flag: "source", Default: "remote", Value: serpent.StringOf(&opts.Source)},
			{Name: "product", Description: "CASC product to extract.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&opts.Product)},
			{Name: "build", Description: "WoW build to extract.", Flag: "build", Default: "latest", Value: serpent.StringOf(&opts.Build)},
			{Name: "region", Description: "Blizzard region.", Flag: "region", Env: "WOW_REGION", Default: "us", Value: serpent.StringOf(&opts.Region)},
			{Name: "locale", Description: "Data locale.", Flag: "locale", Env: "WOW_LOCALE", Default: "enUS", Value: serpent.StringOf(&opts.Locale)},
			{Name: "cache", Description: "Optional wowdata cache directory.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&opts.Cache)},
			{Name: "workers", Description: "Concurrent texture exports.", Flag: "workers", Default: "4", Value: serpent.Int64Of(&opts.Workers)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if opts.OutDir == "" {
				return fmt.Errorf("--out is required")
			}
			if opts.Workers < 1 {
				return fmt.Errorf("--workers must be at least 1")
			}
			client, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			opts.Client = client
			resolvedWowdata, err := resolveWowdataBinary(inv, opts.WowdataBin)
			if err != nil {
				return err
			}
			opts.WowdataBin = resolvedWowdata
			return extractWowdataTalentBackgrounds(inv.Context(), inv.Stdout, inv.Stderr, opts)
		},
	}
}

func (opts wowdataTalentBackgroundExtractOptions) mapOptions() wowMapExtractOptions {
	return wowMapExtractOptions{
		WowdataBin: opts.WowdataBin,
		OutDir:     opts.OutDir,
		Client:     opts.Client,
		Source:     opts.Source,
		Product:    opts.Product,
		Build:      opts.Build,
		Region:     opts.Region,
		Locale:     opts.Locale,
		Cache:      opts.Cache,
		Workers:    opts.Workers,
	}
}

type wowdataTalentBackground struct {
	Name      string
	Quadrants [4]wowdataFile
}

func extractWowdataTalentBackgrounds(
	ctx context.Context,
	stdout, stderr io.Writer,
	opts wowdataTalentBackgroundExtractOptions,
) error {
	target := opts.mapOptions()
	build, err := resolveWowdataBuild(ctx, stderr, target)
	if err != nil {
		return err
	}
	target.Build = build
	_, _ = fmt.Fprintf(stdout, "Resolved WoW build %s\n", build)

	files, err := searchWowMapFiles(ctx, stderr, target, "interface/talentframe/")
	if err != nil {
		return err
	}
	backgrounds, err := selectWowdataTalentBackgrounds(files)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(opts.OutDir, 0o755); err != nil {
		return fmt.Errorf("create talent background output directory: %w", err)
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return fmt.Errorf("find talent background cache directory: %w", err)
	}
	tempDir := filepath.Join(cacheDir, "chronicle", "talent-backgrounds", build)
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		return fmt.Errorf("create talent background cache directory: %w", err)
	}

	type pendingExport struct {
		temporary string
		final     string
	}
	exports := make([]wowdataFileExport, 0, len(backgrounds)*len(talentBackgroundQuadrants))
	pending := make([]pendingExport, 0, len(backgrounds)*len(talentBackgroundQuadrants))
	for _, background := range backgrounds {
		for index, file := range background.Quadrants {
			output := filepath.Join(tempDir, fmt.Sprintf("%s-%d.blp", background.Name, index))
			if validCachedTalentBackgroundQuadrant(output) {
				continue
			}
			_ = os.Remove(output)
			temporary := output + ".partial"
			_ = os.Remove(temporary)
			exports = append(exports, wowdataFileExport{
				FileDataID: file.FileDataID,
				Output:     temporary,
				Label:      fmt.Sprintf("talent-background %s", background.Name),
			})
			pending = append(pending, pendingExport{temporary: temporary, final: output})
		}
	}
	if err := exportWowdataFiles(ctx, stderr, target, exports, int(opts.Workers)); err != nil {
		return err
	}
	for _, export := range pending {
		if !validCachedTalentBackgroundQuadrant(export.temporary) {
			return fmt.Errorf("exported invalid talent background quadrant %s", export.temporary)
		}
		if err := os.Rename(export.temporary, export.final); err != nil {
			return fmt.Errorf("finalize talent background quadrant %s: %w", export.final, err)
		}
	}

	for _, background := range backgrounds {
		quadrants := make([]image.Image, 0, len(talentBackgroundQuadrants))
		for index := range background.Quadrants {
			path := filepath.Join(tempDir, fmt.Sprintf("%s-%d.blp", background.Name, index))
			data, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("read %s quadrant %d: %w", background.Name, index, err)
			}
			img, err := decodeBLP2(data)
			if err != nil {
				return fmt.Errorf("decode %s quadrant %d: %w", background.Name, index, err)
			}
			quadrants = append(quadrants, img)
		}
		combined, err := combineTalentBackgroundQuadrants(quadrants)
		if err != nil {
			return fmt.Errorf("combine %s: %w", background.Name, err)
		}
		output := filepath.Join(opts.OutDir, background.Name+".webp")
		file, err := os.Create(output)
		if err != nil {
			return fmt.Errorf("create %s: %w", output, err)
		}
		if err := nativewebp.Encode(file, combined, nil); err != nil {
			_ = file.Close()
			_ = os.Remove(output)
			return fmt.Errorf("encode %s: %w", output, err)
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(output)
			return fmt.Errorf("close %s: %w", output, err)
		}
	}
	_, _ = fmt.Fprintf(stdout, "Extracted %d talent background files to %s\n", len(backgrounds), opts.OutDir)
	return nil
}

func validCachedTalentBackgroundQuadrant(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	_, err = decodeBLP2(data)
	return err == nil
}

func selectWowdataTalentBackgrounds(files []wowdataFile) ([]wowdataTalentBackground, error) {
	byName := make(map[string][4]wowdataFile)
	seen := make(map[string][4]bool)
	for _, file := range files {
		name := strings.ToLower(strings.ReplaceAll(file.FileName, "\\", "/"))
		if !strings.HasPrefix(name, "interface/talentframe/") || !strings.HasSuffix(name, ".blp") {
			continue
		}
		stem := strings.TrimSuffix(strings.TrimPrefix(name, "interface/talentframe/"), ".blp")
		for index, quadrant := range talentBackgroundQuadrants {
			suffix := strings.ToLower(quadrant.suffix)
			if !strings.HasSuffix(stem, suffix) {
				continue
			}
			base := strings.TrimSuffix(stem, suffix)
			if !foreverTalentBackgroundNames[base] {
				break
			}
			filesByQuadrant := byName[base]
			seenQuadrants := seen[base]
			if seenQuadrants[index] && filesByQuadrant[index].FileDataID != file.FileDataID {
				return nil, fmt.Errorf("talent background %s quadrant %s has multiple FileDataIDs", base, suffix)
			}
			filesByQuadrant[index] = file
			seenQuadrants[index] = true
			byName[base] = filesByQuadrant
			seen[base] = seenQuadrants
			break
		}
	}

	backgrounds := make([]wowdataTalentBackground, 0, len(foreverTalentBackgroundNames))
	for name := range foreverTalentBackgroundNames {
		quadrants := seen[name]
		for index, found := range quadrants {
			if !found {
				return nil, fmt.Errorf("talent background %s is missing quadrant %s", name, talentBackgroundQuadrants[index].suffix)
			}
		}
		backgrounds = append(backgrounds, wowdataTalentBackground{Name: name, Quadrants: byName[name]})
	}
	sort.Slice(backgrounds, func(i, j int) bool { return backgrounds[i].Name < backgrounds[j].Name })
	return backgrounds, nil
}
