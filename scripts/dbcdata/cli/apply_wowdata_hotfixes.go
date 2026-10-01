package cli

import (
	"fmt"

	"github.com/Emyrk/chronicle/internal/wowdata"
	"github.com/coder/serpent"
)

// ApplyWowdataHotfixesCmd is an extraction helper. It overlays one validated
// DBCache onto a normalized snapshot and writes the provenance receipt.
func ApplyWowdataHotfixesCmd() *serpent.Command {
	var snapshot, dbcache, dbdDir, product, build, region, locale string
	return &serpent.Command{
		Use:   "apply-wowdata-hotfixes",
		Short: "Apply a build-matching DBCache to a wowdata snapshot.",
		Options: serpent.OptionSet{
			{Name: "snapshot", Flag: "snapshot", Description: "Snapshot directory to update.", Value: serpent.StringOf(&snapshot)},
			{Name: "dbcache", Flag: "dbcache", Description: "Locale-specific DBCache.bin path.", Value: serpent.StringOf(&dbcache)},
			{Name: "dbd-dir", Flag: "dbd-dir", Description: "Directory containing build-specific table DBD files.", Value: serpent.StringOf(&dbdDir)},
			{Name: "product", Flag: "product", Description: "Expected snapshot product.", Value: serpent.StringOf(&product)},
			{Name: "build", Flag: "build", Description: "Expected snapshot and DBCache build.", Value: serpent.StringOf(&build)},
			{Name: "region", Flag: "region", Description: "Expected Blizzard region string.", Value: serpent.StringOf(&region)},
			{Name: "locale", Flag: "locale", Description: "Expected snapshot and cache locale.", Value: serpent.StringOf(&locale)},
		},
		Handler: func(*serpent.Invocation) error {
			if snapshot == "" || dbcache == "" || dbdDir == "" || product == "" || build == "" || region == "" || locale == "" {
				return fmt.Errorf("--snapshot, --dbcache, --dbd-dir, --product, --build, --region, and --locale are required")
			}
			return wowdata.ApplyHotfixes(wowdata.HotfixOptions{
				SnapshotDir: snapshot, CachePath: dbcache, DBDDir: dbdDir,
				Product: product, Build: build, Region: region, Locale: locale,
			})
		},
	}
}
