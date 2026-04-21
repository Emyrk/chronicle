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
//go:generate go run -tags turtle ../../../../scripts/dbcdata derived-statics --server=turtle --assets-dir=../../../../assets/turtle/generated --go-dir=turtle --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/turtle
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=turtle --out=../../../../assets/turtle
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=turtle --out=../../../../frontend/imagecache/turtle/blp
//go:generate go run -tags turtle ../../../../scripts/dbcdata spell-test-data --server=turtle --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Epoch (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=epoch -o epoch
//go:generate go run -tags epoch ../../../../scripts/dbcdata derived-statics --server=epoch --assets-dir=../../../../assets/epoch/generated --go-dir=epoch --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/epoch
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=epoch --out=../../../../assets/epoch
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=epoch --out=../../../../frontend/imagecache/epoch/blp
//go:generate go run -tags epoch ../../../../scripts/dbcdata spell-test-data --server=epoch --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Kronos (1.12.1)
//go:generate go run ../../../../scripts/dbcdata static --server=kronos -o kronos
//go:generate go run -tags kronos ../../../../scripts/dbcdata derived-statics --server=kronos --assets-dir=../../../../assets/kronos/generated --go-dir=kronos --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/kronos
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=kronos --out=../../../../assets/kronos
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=kronos --out=../../../../frontend/imagecache/kronos/blp
//go:generate go run -tags kronos ../../../../scripts/dbcdata spell-test-data --server=kronos --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Warmane (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=warmane -o warmane
//go:generate go run -tags warmane ../../../../scripts/dbcdata derived-statics --server=warmane --assets-dir=../../../../assets/warmane/generated --go-dir=warmane --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/warmane
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=warmane --out=../../../../assets/warmane
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=warmane --out=../../../../frontend/imagecache/warmane/blp
//go:generate go run -tags warmane ../../../../scripts/dbcdata spell-test-data --server=warmane --ts-dir=../../../../frontend/chronicle/src/api/testdata

// Ascension (3.3.5a)
//go:generate go run ../../../../scripts/dbcdata static --server=ascension -o ascension
//go:generate go run -tags ascension ../../../../scripts/dbcdata derived-statics --server=ascension --assets-dir=../../../../assets/ascension/generated --go-dir=ascension --ts-dir=../../../../frontend/chronicle/src/constants/dbmem/ascension
//go:generate go run ../../../../scripts/dbcdata extract-dbc --server=ascension --out=../../../../assets/ascension
//go:generate go run ../../../../scripts/dbcdata extract-icons --server=ascension --out=../../../../frontend/imagecache/ascension/blp
//go:generate go run -tags ascension ../../../../scripts/dbcdata spell-test-data --server=ascension --ts-dir=../../../../frontend/chronicle/src/api/testdata
