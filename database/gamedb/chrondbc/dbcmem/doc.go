// Package dbcmem contains in-memory data generated from WoW DBC files.
//
// Types, variables, and getter functions are defined in types.go.
// The actual data is provided by server-specific sub-packages
// (e.g. dbcmem/turtle, dbcmem/epoch) which populate variables via init().
//
// To regenerate data for a specific server:
//
//	go generate -run "static|derived-statics|spell-test-data" ./database/gamedb/chrondbc/dbcmem/
package dbcmem

// Turtle WoW (1.12.1)
//go:generate go run ../../../../scripts/dbcdata static --server=turtle -o turtle
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=turtle --assets-dir=../../../../assets/turtle/generated --go-dir=turtle --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/turtle
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=turtle --out=../../../../assets/turtle
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=turtle --out=../../../../frontend/imagecache/turtle/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=turtle --out=../../../../frontend/imagecache/turtle/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=turtle --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Epoch (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=epoch -o epoch
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=epoch --assets-dir=../../../../assets/epoch/generated --go-dir=epoch --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/epoch
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=epoch --out=../../../../assets/epoch
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=epoch --out=../../../../frontend/imagecache/epoch/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=epoch --out=../../../../frontend/imagecache/epoch/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=epoch --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Kronos (1.12.1)
//go:generate go run ../../../../scripts/dbcdata static --server=kronos -o kronos
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=kronos --assets-dir=../../../../assets/kronos/generated --go-dir=kronos --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/kronos
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=kronos --out=../../../../assets/kronos
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=kronos --out=../../../../frontend/imagecache/kronos/blp
//DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=kronos --out=../../../../frontend/imagecache/kronos/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=kronos --ts-dir=../../../../frontend/chronicle/src/api/testdata

// AzerothCore (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=azerothcore -o azerothcore
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=azerothcore --assets-dir=../../../../assets/azerothcore/generated --go-dir=azerothcore --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/azerothcore
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=azerothcore --out=../../../../assets/azerothcore
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=azerothcore --out=../../../../frontend/imagecache/azerothcore/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=azerothcore --out=../../../../frontend/imagecache/azerothcore/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=azerothcore --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Ascension (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=ascension -o ascension
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=ascension --assets-dir=../../../../assets/ascension/generated --go-dir=ascension --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/ascension
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=ascension --out=../../../../assets/ascension
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=ascension --out=../../../../frontend/imagecache/ascension/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=ascension --out=../../../../frontend/imagecache/ascension/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=ascension --ts-dir=../../../../frontend/chronicle/src/api/testdata

// VanillaPlus (1.12.2)
//go:generate go run ../../../../scripts/dbcdata static --server=vanillaplus -o vanillaplus
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=vanillaplus --assets-dir=../../../../assets/vanillaplus/generated --go-dir=vanillaplus --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/vanillaplus
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=vanillaplus --out=../../../../assets/vanillaplus
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=vanillaplus --out=../../../../frontend/imagecache/vanillaplus/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=vanillaplus --out=../../../../frontend/imagecache/vanillaplus/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=vanillaplus --ts-dir=../../../../frontend/chronicle/src/api/testdata

// OctoWoW (1.12.x)
//go:generate go run ../../../../scripts/dbcdata static --server=octowow -o octowow
//go:generate go run ../../../../scripts/dbcdata derived-statics --server=octowow --assets-dir=../../../../assets/octowow/generated --go-dir=octowow --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/octowow
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=octowow --out=../../../../assets/octowow
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=octowow --out=../../../../frontend/imagecache/octowow/blp
// DISABLED go:generate go run ../../../../scripts/dbcdata extract-loading-screens --server=octowow --out=../../../../frontend/imagecache/octowow/loading-screens
//go:generate go run ../../../../scripts/dbcdata spell-test-data --server=octowow --ts-dir=../../../../frontend/chronicle/src/api/testdata
