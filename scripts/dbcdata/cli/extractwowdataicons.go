package cli

import (
	"fmt"
	"os/exec"

	"github.com/coder/serpent"
)

// ExtractWowdataIconsCmd extracts the modern snapshot metadata needed to find
// referenced icons, then exports those CASC textures directly as WebP files.
func ExtractWowdataIconsCmd() *serpent.Command {
	var dbcPath, server, outDir string
	var wowdataBin, extractor, iconExtractor string
	var product, build, region, locale, cache string

	return &serpent.Command{
		Use:   "extract-wowdata-icons",
		Short: "Extract referenced icon WebP files from a modern WoW client.",
		Options: serpent.OptionSet{
			DBCOption(&dbcPath),
			ServerOption(&server),
			{Name: "out", Description: "Output directory for extracted WebP files.", Flag: "out", Value: serpent.StringOf(&outDir)},
			{Name: "wowdata", Description: "Wowdata executable. A pinned build is provisioned when omitted.", Flag: "wowdata", Env: "WOWDATA_BIN", Default: wowdataDefaultBinary, Value: serpent.StringOf(&wowdataBin)},
			{Name: "extractor", Description: "Path to Chronicle's wowdata snapshot extraction script.", Flag: "extractor", Default: "scripts/dbcdata/extract-wowdata.sh", Value: serpent.StringOf(&extractor)},
			{Name: "icon-extractor", Description: "Path to Chronicle's wowdata icon export script.", Flag: "icon-extractor", Default: "scripts/dbcdata/extract-wowdata-icons.sh", Value: serpent.StringOf(&iconExtractor)},
			{Name: "product", Description: "CASC product to extract.", Flag: "product", Default: "wow_classic_beta", Value: serpent.StringOf(&product)},
			{Name: "build", Description: "WoW build to extract; empty uses the extractor default.", Flag: "build", Value: serpent.StringOf(&build)},
			{Name: "region", Description: "Blizzard region.", Flag: "region", Env: "WOW_REGION", Default: "us", Value: serpent.StringOf(&region)},
			{Name: "locale", Description: "Data locale.", Flag: "locale", Env: "WOW_LOCALE", Default: "enUS", Value: serpent.StringOf(&locale)},
			{Name: "cache", Description: "Optional wowdata cache directory.", Flag: "cache", Env: "WOWDATA_CACHE", Value: serpent.StringOf(&cache)},
		},
		Handler: func(inv *serpent.Invocation) error {
			if outDir == "" {
				return fmt.Errorf("--out is required")
			}
			client, err := ResolveDBCPath(dbcPath, server)
			if err != nil {
				return err
			}
			resolvedWowdata, err := resolveWowdataBinary(inv, wowdataBin)
			if err != nil {
				return err
			}
			snapshot, cleanup, err := extractWowdata(inv, wowdataExtractOptions{
				Client: client, WowdataBin: resolvedWowdata, Extractor: extractor,
				Product: product, Build: build, Region: region, Locale: locale, Cache: cache,
			})
			if err != nil {
				return err
			}
			defer cleanup()

			args := []string{"--snapshot", snapshot, "--client", client, "--out", outDir, "--wowdata", resolvedWowdata}
			if cache != "" {
				args = append(args, "--cache", cache)
			}
			cmd := exec.CommandContext(inv.Context(), iconExtractor, args...)
			cmd.Stdout = inv.Stdout
			cmd.Stderr = inv.Stderr
			if err := cmd.Run(); err != nil {
				return fmt.Errorf("extract wowdata icons: %w", err)
			}
			return nil
		},
	}
}
