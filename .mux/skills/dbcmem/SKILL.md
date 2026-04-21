---
name: dbcmem
description: Generate static Go code from WoW DBC files
globs:
  - database/gamedb/chrondbc/dbcmem/**
  - scripts/dbcdata/**
---

# dbcmem Code Generation

> **See also:** the `multi-server-build` skill for the full build pipeline,
> CI/CD, Docker, and how to add a new server.

The `dbcmem` package contains Go lookup tables generated from World of Warcraft
DBC (Database Client) files. Types and getters live in `dbcmem/types.go`;
actual data lives in server-specific sub-packages (e.g. `dbcmem/turtle/`).

## Quick Reference

```bash
# Regenerate turtle DBC data
go generate ./database/gamedb/chrondbc/dbcmem/...

# Or run the tool directly for a specific server
go run ./scripts/dbcdata static --server=turtle --dbc=/path/to/client -o database/gamedb/chrondbc/dbcmem/turtle
go run ./scripts/dbcdata derived-statics --server=turtle --dbc=/path/to/client \
  --go-dir=database/gamedb/chrondbc/dbcmem/turtle \
  --ts-dir=frontend/chronicle/src/constants/dbmem \
  --assets-dir=assets/generated
```

## Architecture

```
database/gamedb/chrondbc/dbcmem/
├── doc.go              # go:generate directives
├── types.go            # Shared types, nil vars, getters (NOT generated)
└── turtle/             # Generated data for Turtle WoW
    ├── casttimes.go    # func init() { dbcmem.SpellCastTimes = ... }
    ├── spellicons.go
    └── ... (11 files total)

scripts/dbcdata/
├── main.go             # CLI entry point
└── cli/
    ├── static.go       # Generates 7 DBC-direct tables
    ├── derivedstatics.go  # Orchestrates 4 derived generators + JSON/TS
    ├── periodic.go     # PeriodicSpells
    ├── vulnerability.go # VulnerabilitySpells
    ├── extraattacks.go # ExtraAttackSpells
    └── durationmodifiers.go # DurationModifiers + ByClassBit
```

## Adding a New DBC Table

1. **Add reader to `database/gamedb/dbcdb/db.go`**:
   ```go
   func (w *WoWClient) SpellFoo() (Table[dbdefs.Ent_SpellFoo], error) {
       data, err := w.ReadFile("DBFilesClient\\SpellFoo.dbc")
       // ...
   }
   ```

2. **Add struct type to `dbcmem/types.go`**:
   ```go
   type SpellFoo struct { ID int32; /* ... */ }
   var SpellFoos map[int32]SpellFoo
   func GetSpellFoo(id int32) SpellFoo { return SpellFoos[id] }
   ```

3. **Add generator + template to `scripts/dbcdata/cli/static.go`**:
   - Generator function: `generateSpellFoo(wc, outputDir, stdout, server)`
   - Template emits `package {{.Server}}` + `func init() { dbcmem.SpellFoos = ... }`

4. **Call generator in `StaticPopulateCmd` handler**

5. **Regenerate**: `go generate ./database/gamedb/chrondbc/dbcmem/...`

## Notes

- The `--server` flag controls the output package name and init() wrapping
- The `--dbc` flag defaults to the Turtle WoW client path; override for other servers
- Generated files have `// Code generated` header — don't edit manually
- `types.go` is NOT generated — edit it manually when adding new tables
