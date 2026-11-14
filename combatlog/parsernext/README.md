# parsernext foundation

This is an isolated, runnable **complete-file source ingestion** foundation, not
an alternate combat parser yet. Production continues using `combatlog/parser`
and `chronicle/logparse_parse.go` unchanged. There are no legacy parser adapters,
registration side effects, database/River calls, or raid constructors here.

## Implemented boundary

```go
summary, err := parsernext.ReadFile(ctx, parsernext.Selection{
    Format: formats.TBCCompanion,
    Expansion: tbc.Name,
}, uncompressedReader, 1024*1024, func(line common.Line) error {
    // Source inspection only: Raw retains exact bytes and line endings.
    // Lines/derived state are provisional until ReadFile succeeds.
    return inspect(line.Number, line.Offset, line.Raw)
})
```

`ReadFile` validates the explicit format/expansion pair **before reading**, emits
owned physical lines in file order, bounds each line's memory, and returns byte
count, line count and SHA-256 only after clean EOF and successful callbacks.
CRLF, LF, blank lines and final unterminated lines are preserved exactly. Empty
input is a successful empty **source**, not a valid combat log. `ReadFile` itself
interprets no timestamps, CSV fields, companion frames, units or combat events.
The separate CC-v2 lexical decoder described below can be called by its visitor.

On cancellation, reader failure, visitor failure or line overflow, the result is
zero and an error is returned. Already emitted callbacks cannot be rolled back;
the caller must discard provisional derived state. The caller owns the reader
and must supply cancellation for blocking I/O; this API neither closes it nor
claims it can interrupt arbitrary `io.Reader.Read` calls. Each call owns one
complete source lifecycle; no state carries into a subsequent file.

## CC-v2 lexical extraction

`formats/ccv2.ParseLine` is the single implementation of the existing
`1.12a-cc-addon` pipe-record envelope: Unix-millisecond timestamp, event name and
ordered string payload fields. Legacy `parserv2.ParseLine` delegates to it and
retains its own `Matched` cursor and typed helpers. The new leaf package imports
only the standard library; it does not import or hide the old parser.

To use it in a `ReadFile` visitor, remove the physical line terminator as the
legacy `bufio.ScanLines` does, then decode:

```go
content := strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r")
timestamp, event, fields, err := ccv2.ParseLine(content)
```

Only lexical semantics have moved. Timestamp parsing still happens **before**
trimming; event/payload fields are trimmed without dropping empty fields; a
record with only timestamp and event is accepted. Empty/malformed errors remain
unchanged, including the historical "at least 3 parts" text and `time.Now()`
returned alongside a numeric timestamp error. Consumers must ignore results on
error. These quirks are characterized, not silently repaired in this extraction.

The legacy scanner currently reports EOF even when `scanner.Err()` is non-nil;
characterization tests retain that limitation. The new complete-file reader
already rejects read failures, but this extraction does not change the legacy
lifecycle or claim equivalent error handling across those entry points.

This is **not combat parsing**. GUID/spell interpretation, message schemas,
header clock rules, synthetic events, identities, consumers and publication are
unchanged. Their ownership/migration choices still require explicit approval.

## Explicit source compositions

| Expansion policy | Wire-format IDs accepted for ingestion |
| --- | --- |
| `vanilla` | `1.12a-cc-addon` |
| `tbc` | `2.4.3-cc-addon` |
| `wotlk` | `3.3.5a-cc-addon`, `azerothcore-mod` |
| `forever` | `v22-cleu` |

The IDs match existing metadata but do not depend on database enums. These are
explicit initial source selections, **not claims of implemented combat decoding**
or an exhaustive compatibility map. No expansion is inferred from format.
Unknown, absent or mismatched selections fail. Older SuperWoW and HermesProxy
formats remain unsupported in this initial selection matrix rather than being
silently mapped to an expansion. The Forever selection follows `chronicle/logparse.go`, which identifies v22
as its dedicated format, and the explicit v22 Forever realm regression. V9
shares the modern decoder but is not thereby a Forever format; it remains
unselected in this initial foundation. No general format-to-content inference
is performed.

## Package/dependency map

| Package | Owns now | Direction / future boundary |
| --- | --- | --- |
| root `parsernext` | Explicit composition validation and complete-file entry point | Imports profiles + common; future pipeline composition stays here |
| `common` | Physical line, completed-file summary, reader lifecycle | Standard library only; no expansion/raid construction or global types drawer |
| `formats`, `formats/ccv2` | Stable wire-format names and shared CC-v2 lexical decoding | Standard library only; no identity or combat-message dependencies |
| `vanilla` | Vanilla source-compatibility policy | Imports common/formats; future vanilla state/rules stay here |
| `tbc` | TBC source-compatibility policy | Imports common/formats; **never routes through WotLK** |
| `wotlk` | Wrath source-compatibility policy | Imports common/formats; Wrath-specific state/rules stay here |
| `forever` | Explicit Forever source-compatibility policy | Imports common/formats; Forever-specific state/rules stay here |
| `snapshot` | Documented orchestration boundary only | No executable snapshot API or persistence support yet |

The architecture test enforces production import direction and rejects imports
of the old parser, database/publication code, River and other external packages.
`common` cannot acquire expansion dependencies transitively through local imports.
It cannot construct a raid through a registered constructor or imported package.

## Deliberately not implemented

Combat-message decoding; clocks/timezone reconstruction; expansion combat rules;
character/raid state; event sorting or synthetic events; multiple-file merging;
semantic export parity; checkpoints, restore, snapshot schemas/codecs; publication.
There are no no-op implementations claiming these features work.

When state is introduced, its snapshot schema and codec must live beside its
owner (`common` or its expansion). `snapshot` may orchestrate owner-provided
codecs, but must not become the owner of all parser state. A completed source
summary is not a resumable checkpoint. No speculative universal event/state
interface has been introduced for functionality not implemented yet.

## Validation

```sh
go test ./combatlog/parsernext/...
go test -race ./combatlog/parsernext/...
golangci-lint run ./combatlog/parsernext/...
```

Tests cover the full accepted/rejected selection cross-product, rejection before
reader access, exact byte/line framing and digest, bounded long lines, clean EOF,
reader/visitor failures, cancellation including the final callback, and package
isolation. Shared-layer tests require no raid registry, game data or database.
