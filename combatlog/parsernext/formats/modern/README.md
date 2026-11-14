# Modern Blizzard normalization extraction

This package owns the existing V9/HermesProxy/V22 **wire normalization and GUID
mapping algorithms**, moved from `parser/blizzard/modern`. It does not import or
instantiate an old parser, execute synthetics, select a
flavor, or construct downstream consumers.

`NewNormalizer(ctx)` requires both resolved Format and nonempty Flavor from
`parsectx`. It accepts only V9, HermesProxy and V22 formats. Flavor is copied,
retained and exposed without inference or mutation by version headers. The
format controls timestamp/name/layout behavior; the header retains its existing
layout-version behavior. No format-to-expansion profile/defaults are changed.

`Normalize(line)` currently returns the **exact legacy normalized text**, with
ordered records separated by newlines. This is an intermediate compatibility
boundary for the upcoming shared CLEU record decoder, not a complete parsernext
message source. Combat records precede advanced telemetry; landed swings can
emit telemetry only; existing ignored wire records produce empty text.
`GUIDMappings()` returns the canonical-to-compatibility dictionary snapshot.

The low-level TransformReader constructors and exported helpers exist for the
legacy adapter and preserve its constructor defaults, reader errors and framing.
New format-aware callers use NewNormalizer, not those legacy constructors.
Completing an input file does not finalize or reset normalization state. Explicit
reuse retains its GUID/name/version observations; a new instance isolates them.

## Next integration seam

The CLEU decoder accepts timestamp/event/token fields without executing
synthetics. Modern metadata/absorb handlers dispatch locally. Ordinary normalized
combat records use the shared decoder, then format-specific synthetics run before
the same consumers. `parser/blizzard/modern.NewNext` provides the independent
streaming composition, including companion state, clock normalization and one
V22 reorder stage. It constructs no legacy parser. The tooling-only baseline
engine selects this source; ordinary production routing remains legacy.

## Verification

Legacy modern tests still exercise the same algorithms through adapters. A
private-map collision test moved beside its GUID owner. Direct parity tests
compare exact output and canonical GUID values against the original source via
Go overlay, using inline V9/Hermes records and the existing two V22 fixtures.
Each is exercised with explicit Vanilla, TBC and Forever flavor tags to ensure
normalization never infers a flavor from the wire format/header. This is focused
fixture coverage, not a corpus run or end-to-end semantic/export parity.

## Independent message composition

`NewDecoder(ctx, DecoderOptions)` now combines normalization, modern-owned
metadata/absorb handlers and the shared CLEU semantic decoder. It does not
instantiate legacy modern/WotLK parsers. Format and Flavor are supplied through
parsectx; dataset spell lookup, CLEU spell resolution, companion framing and GUID
name recording are explicit narrow dependencies/hooks. HermesProxy requires a
companion hook rather than silently dropping addon frames. Talent data is read
from the existing parsectx dataset, not a database store.

`DecodeLineEach(resolvedTimestamp, rawLine, emit)` preserves the old normalized
record boundaries: the combat-event batch is emitted before each generated
telemetry batch. The caller runs format-specific synthetics on each batch, then
passes output to the same consumers. `DecodeLine` collects raw batches for
callers that do not run a pipeline; it does not execute synthetics itself.

Timestamp resolution/order remains source-owned: modern UTC offsets/base year,
HermesProxy legacy month/day/realm clock, V22's allowed regression and excluded
version timestamps must be retained by that source composition. This decoder
alone is not a replacement streaming source or end-to-end CLI integration.

Legacy modern handlers delegate to the moved algorithms through a narrow
compatibility state envelope. The old transport still constructs its historical
WotLK pipeline for callers not yet migrated; the new decoder never invokes it.
Tests compare complete messages against a pinned-original modern implementation,
with the existing synthetic options applied outside the new decoder at the same
record boundaries. This does not claim corpus or full CLI equivalence.
