package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/coder/serpent"
)

const wowLoadingScreenManifestFormat = "chronicle-wow-loading-screens-v1"

type wowLoadingScreenManifest struct {
	Format  string                   `json:"format"`
	Target  wowLoadingScreenTarget   `json:"target"`
	Screens []wowLoadingScreenRecord `json:"screens"`
}

type wowLoadingScreenTarget struct {
	Product string `json:"product"`
	Build   string `json:"build"`
	Region  string `json:"region"`
	Locale  string `json:"locale"`
}

type wowLoadingScreenRecord struct {
	ID                  int32                   `json:"id"`
	LoadingScreenSkinID int32                   `json:"loadingScreenSkinID,omitempty"`
	Images              []wowLoadingScreenImage `json:"images"`
	Maps                []wowLoadingScreenMap   `json:"maps,omitempty"`
}

type wowLoadingScreenImage struct {
	Variant    string `json:"variant"`
	FileDataID int32  `json:"fileDataID"`
	Path       string `json:"path"`
}

type wowLoadingScreenMap struct {
	ID           int32  `json:"id"`
	Name         string `json:"name"`
	Directory    string `json:"directory"`
	InstanceType int32  `json:"instanceType"`
}

type wowdataLoadingScreen struct {
	ID                      int32 `json:"ID"`
	LoadingScreenSkinID     int32 `json:"LoadingScreenSkinID"`
	LogoFileDataID          int32 `json:"LogoFileDataID"`
	MainImageFileDataID     int32 `json:"MainImageFileDataID"`
	NarrowScreenFileDataID  int32 `json:"NarrowScreenFileDataID"`
	WideScreenFileDataID    int32 `json:"WideScreenFileDataID"`
	WideScreen169FileDataID int32 `json:"WideScreen169FileDataID"`
}

type wowLoadingScreenExtractOptions struct {
	WowdataBin   string
	OutDir       string
	Client       string
	Source       string
	Product      string
	Build        string
	Region       string
	Locale       string
	Cache        string
	Workers      int64
	MetadataOnly bool
}

// ExtractWowdataLoadingScreensCmd exports modern loading-screen textures by
// FileDataID. Modern clients no longer store the legacy filename paths used by
// LoadingScreens.dbc, so the output includes a manifest that preserves variants
// and their Map associations.
func ExtractWowdataLoadingScreensCmd() *serpent.Command {
	var opts wowLoadingScreenExtractOptions
	var dbcPath, server string

	return &serpent.Command{
		Use:   "extract-wowdata-loading-screens",
		Short: "Extract WoW Forever loading-screen images and metadata.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "out", Description: "Output directory for manifest.json and loading-screen images.", Flag: "out", Value: serpent.StringOf(&opts.OutDir)},
			{Name: "wowdata", Description: "Wowdata executable. A pinned build is provisioned when omitted.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: wowdataDefaultBinary, Value: serpent.StringOf(&opts.WowdataBin)},
			{Name: "source", Description: "Read CASC data from local client archives or Blizzard's CDN.", Flag: "source", Default: "remote", Value: serpent.StringOf(&opts.Source)},
			{Name: "product", Description: "CASC product to extract.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&opts.Product)},
			{Name: "build", Description: "WoW build to extract.", Flag: "build", Default: "latest", Value: serpent.StringOf(&opts.Build)},
			{Name: "region", Description: "Blizzard region.", Flag: "region", Env: "WOW_REGION", Default: "us", Value: serpent.StringOf(&opts.Region)},
			{Name: "locale", Description: "Data locale.", Flag: "locale", Env: "WOW_LOCALE", Default: "enUS", Value: serpent.StringOf(&opts.Locale)},
			{Name: "cache", Description: "Optional wowdata cache directory.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&opts.Cache)},
			{Name: "workers", Description: "Concurrent texture exports.", Flag: "workers", Default: "4", Value: serpent.Int64Of(&opts.Workers)},
			{Name: "metadata-only", Description: "Write the manifest without exporting textures.", Flag: "metadata-only", Value: serpent.BoolOf(&opts.MetadataOnly)},
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
			return extractWowdataLoadingScreens(inv.Context(), inv.Stdout, inv.Stderr, opts)
		},
	}
}

func (opts wowLoadingScreenExtractOptions) mapOptions() wowMapExtractOptions {
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

func extractWowdataLoadingScreens(ctx context.Context, stdout, stderr io.Writer, opts wowLoadingScreenExtractOptions) error {
	mapOpts := opts.mapOptions()
	build, err := resolveWowdataBuild(ctx, stderr, mapOpts)
	if err != nil {
		return err
	}
	opts.Build = build
	mapOpts.Build = build
	_, _ = fmt.Fprintf(stdout, "Resolved WoW build %s\n", build)

	var screens []wowdataLoadingScreen
	if err := readWowMapTable(ctx, stdout, stderr, mapOpts, "LoadingScreens", &screens); err != nil {
		return err
	}
	var maps []wowdataMap
	if err := readWowMapTable(ctx, stdout, stderr, mapOpts, "Map", &maps); err != nil {
		return err
	}

	manifest, fileDataIDs := buildWowLoadingScreenManifest(screens, maps, wowLoadingScreenTarget{
		Product: opts.Product,
		Build:   build,
		Region:  opts.Region,
		Locale:  opts.Locale,
	})
	if err := os.MkdirAll(filepath.Join(opts.OutDir, "images"), 0o755); err != nil {
		return fmt.Errorf("create loading-screen output directory: %w", err)
	}
	if !opts.MetadataOnly {
		var exportIDs []int32
		for _, fileDataID := range fileDataIDs {
			output := filepath.Join(opts.OutDir, "images", fmt.Sprintf("%d.webp", fileDataID))
			if info, statErr := os.Stat(output); statErr == nil && info.Size() > 0 {
				continue
			}
			exportIDs = append(exportIDs, fileDataID)
		}
		unavailable, err := exportWowdataLoadingScreenTextures(ctx, stdout, stderr, opts, exportIDs)
		if err != nil {
			return err
		}
		if len(unavailable) > 0 {
			_, _ = fmt.Fprintf(stdout, "Skipped %d loading-screen images unavailable for %s\n", len(unavailable), opts.Locale)
			pruneUnavailableWowLoadingScreenImages(&manifest, unavailable)
			fileDataIDs = wowLoadingScreenManifestFileDataIDs(manifest)
		}
	}
	if err := writeWowLoadingScreenManifest(filepath.Join(opts.OutDir, "manifest.json"), manifest); err != nil {
		return err
	}
	_, _ = fmt.Fprintf(stdout, "Wrote %d loading screens referencing %d unique images to %s\n", len(manifest.Screens), len(fileDataIDs), opts.OutDir)
	return nil
}

func buildWowLoadingScreenManifest(screens []wowdataLoadingScreen, maps []wowdataMap, target wowLoadingScreenTarget) (wowLoadingScreenManifest, []int32) {
	mapsByScreen := make(map[int32][]wowLoadingScreenMap)
	for _, mapRow := range maps {
		if mapRow.LoadingScreenID == 0 {
			continue
		}
		mapsByScreen[mapRow.LoadingScreenID] = append(mapsByScreen[mapRow.LoadingScreenID], wowLoadingScreenMap{
			ID:           mapRow.ID,
			Name:         mapRow.Name,
			Directory:    mapRow.Directory,
			InstanceType: mapRow.InstanceType,
		})
	}
	for loadingScreenID := range mapsByScreen {
		sort.Slice(mapsByScreen[loadingScreenID], func(i, j int) bool {
			return mapsByScreen[loadingScreenID][i].ID < mapsByScreen[loadingScreenID][j].ID
		})
	}

	manifest := wowLoadingScreenManifest{Format: wowLoadingScreenManifestFormat, Target: target}
	for _, screen := range screens {
		record := wowLoadingScreenRecord{
			ID:                  screen.ID,
			LoadingScreenSkinID: screen.LoadingScreenSkinID,
			Maps:                mapsByScreen[screen.ID],
		}
		variants := []struct {
			name       string
			fileDataID int32
		}{
			{name: "main", fileDataID: screen.MainImageFileDataID},
			{name: "narrow", fileDataID: screen.NarrowScreenFileDataID},
			{name: "wide", fileDataID: screen.WideScreenFileDataID},
			{name: "wide169", fileDataID: screen.WideScreen169FileDataID},
			{name: "logo", fileDataID: screen.LogoFileDataID},
		}
		for _, variant := range variants {
			if variant.fileDataID == 0 {
				continue
			}
			record.Images = append(record.Images, wowLoadingScreenImage{
				Variant:    variant.name,
				FileDataID: variant.fileDataID,
				Path:       fmt.Sprintf("images/%d.webp", variant.fileDataID),
			})
		}
		manifest.Screens = append(manifest.Screens, record)
	}
	sort.Slice(manifest.Screens, func(i, j int) bool { return manifest.Screens[i].ID < manifest.Screens[j].ID })
	return manifest, wowLoadingScreenManifestFileDataIDs(manifest)
}

func wowLoadingScreenManifestFileDataIDs(manifest wowLoadingScreenManifest) []int32 {
	unique := make(map[int32]struct{})
	for _, screen := range manifest.Screens {
		for _, image := range screen.Images {
			unique[image.FileDataID] = struct{}{}
		}
	}
	ids := make([]int32, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

func pruneUnavailableWowLoadingScreenImages(manifest *wowLoadingScreenManifest, unavailable map[int32]struct{}) {
	for screenIndex := range manifest.Screens {
		images := manifest.Screens[screenIndex].Images[:0]
		for _, image := range manifest.Screens[screenIndex].Images {
			if _, missing := unavailable[image.FileDataID]; !missing {
				images = append(images, image)
			}
		}
		manifest.Screens[screenIndex].Images = images
	}
}

func exportWowdataLoadingScreenTextures(ctx context.Context, stdout, stderr io.Writer, opts wowLoadingScreenExtractOptions, fileDataIDs []int32) (map[int32]struct{}, error) {
	unavailable := make(map[int32]struct{})
	if len(fileDataIDs) == 0 {
		return unavailable, nil
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	jobs := make(chan int32)
	var workers sync.WaitGroup
	var stateMu sync.Mutex
	var outputMu sync.Mutex
	var firstErr error
	completed := 0

	worker := func() {
		defer workers.Done()
		for fileDataID := range jobs {
			stateMu.Lock()
			failed := firstErr != nil
			stateMu.Unlock()
			if failed {
				continue
			}
			output := filepath.Join(opts.OutDir, "images", fmt.Sprintf("%d.webp", fileDataID))
			var commandStderr bytes.Buffer
			err := exportWowdataTexture(ctx, &commandStderr, opts.mapOptions(), fileDataID, output)
			if commandStderr.Len() > 0 {
				outputMu.Lock()
				_, _ = stderr.Write(commandStderr.Bytes())
				outputMu.Unlock()
			}
			stateMu.Lock()
			switch {
			case err == nil:
				completed++
				if completed%10 == 0 || completed == len(fileDataIDs) {
					outputMu.Lock()
					_, _ = fmt.Fprintf(stdout, "Exported %d/%d new loading-screen images\n", completed, len(fileDataIDs))
					outputMu.Unlock()
				}
			case errors.Is(err, errWowdataFileUnavailable):
				unavailable[fileDataID] = struct{}{}
			case firstErr == nil:
				firstErr = err
				cancel()
			}
			stateMu.Unlock()
		}
	}
	for range int(opts.Workers) {
		workers.Add(1)
		go worker()
	}
feed:
	for _, fileDataID := range fileDataIDs {
		select {
		case jobs <- fileDataID:
		case <-ctx.Done():
			break feed
		}
	}
	close(jobs)
	workers.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return unavailable, nil
}

func writeWowLoadingScreenManifest(path string, manifest wowLoadingScreenManifest) error {
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode loading-screen manifest: %w", err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write loading-screen manifest: %w", err)
	}
	return nil
}
