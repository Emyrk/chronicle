# parsernext foundation

This is an isolated, runnable **complete-file source ingestion** foundation, plus a Vanilla record decoder and file-local message source, not a complete combat parser. Production continues using `combatlog/parser`
and `chronicle/logparse_parse.go` unchanged. There are no legacy parser execution wrappers,
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

At this lexical boundary, timestamp parsing still happens **before**
trimming; event/payload fields are trimmed without dropping empty fields; a
record with only timestamp and event is accepted. Empty/malformed errors remain
unchanged, including the historical "at least 3 parts" text and `time.Now()`
returned alongside a numeric timestamp error. Consumers must ignore results on
error. These quirks are characterized, not silently repaired in this extraction.

The legacy scanner currently reports EOF even when `scanner.Err()` is non-nil;
characterization tests retain that limitation. The new complete-file reader
already rejects read failures, but this extraction does not change the legacy
lifecycle or claim equivalent error handling across those entry points.

The lexical entry point itself does not perform combat parsing. Message schemas,
header clock rules, synthetic events, identities, consumers and publication are
unchanged. Their ownership/migration choices still require explicit approval.

## Known-critter classification contract (not pipeline wiring)

`common/units.Classification` separates entity `Kind`, refinement `Category`,
explicit `Known` status, `TrackFight`, and `RankedDamageTarget`. It owns neither
GUIDs nor observed names. A classifier's `handled` result is distinct from known
status: **unhandled does not mean unknown** and must continue through ordinary
classification. Knownness is not inferred from a label or from participation.

`vanilla.ClassifyCritter(id)` handles only actual creature GUIDs whose entries
are in `common/critters`. It returns a known creature/critter with both fight
tracking and ranked-damage-target eligibility false. `critters.Name(entry)`
provides a canonical label whether or not a name has been observed. The caller
retains the original GUID and observed-name ownership; this slice introduces no
second observation store, GUID representation or payload format.

Accepted behavior: **critters are known, labeled/countable units, not unknown
identities. Their damage/death events remain recordable and visible independently
of tracking/ranking eligibility. They never participate in fight detection or
activity and never qualify as ranked-damage targets.** There is deliberately no
`RecordEvents` flag that could suppress events based on this classification.
Unknown-reporting consumers must honor handled/known separately from tracking.

The existing entry/name table has one owner, `common/critters`; legacy
`parser/common/critters.IsCritter` delegates only entry lookup while retaining its
existing creature-GUID guard. Legacy unknown reporting, activity/ranking paths
and published payloads remain unchanged. The new model **is not yet wired into
an event pipeline, unknown-report collector or ranking publication**; contract
tests are not evidence of migrated runtime event visibility.

Vanilla may import the existing `parser/guid`
value helpers, explicitly allowed by the architecture test. The additional explicit message/value compatibility imports are listed below. No legacy decoder, consumer or raid constructor is imported into parsernext. Shared classification
and critter lookup modules remain standard-library-only leaves.

Player metadata/handling stays distinct from creature classification. Player,
pet, object, vehicle and unrecognized creature GUIDs are unhandled by this
critter-only function, leaving existing player/raid-friendly behavior untouched.
Vehicle/control roles and future Team1/Team2 relationships are intentionally not
modeled as new kinds or battleground policy. Temporal identity observations,
GUID/entry payload deduplication, broader classification and consumer/publication
integration still require separate approval.

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
| `common`, `common/units`, `common/critters` | Source lifecycle, classification contract and known critter labels | Standard library only; no expansion/raid construction, observation store or global types drawer |
| `formats`, `formats/ccv2` | Stable wire-format names and shared CC-v2 lexical decoding | Standard library only; no identity or combat-message dependencies |
| `vanilla` | Vanilla source selection, known-critter classification, the combat records listed below | Explicit common/format leaves and listed message/value compatibility; no encounter/publication wiring |
| `tbc` | TBC source-compatibility policy | Imports common/formats; **never routes through WotLK** |
| `wotlk` | Wrath source-compatibility policy | Imports common/formats; Wrath-specific state/rules stay here |
| `forever` | Explicit Forever source-compatibility policy | Imports common/formats; Forever-specific state/rules stay here |
| `snapshot` | Documented orchestration boundary only | No executable snapshot API or persistence support yet |

The architecture test enforces production import direction and rejects old
parser execution, database/publication, River and other external imports except
the exact Vanilla message/value, fatal-error and semver compatibility imports enumerated in the test.
`common` cannot acquire expansion dependencies transitively through local imports.
It cannot construct a raid through a registered constructor or imported package.

## Deliberately not implemented

Combat-message decoding beyond the explicitly listed records; timezone reconstruction beyond header interpretation; other expansion combat rules;
character/raid state; event sorting or the full synthetic pipeline inside parsernext; multiple-file merging;
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

## Runnable Vanilla combat slice

`vanilla.DecodeRecord(ctx, spellLookup, content)` decodes the following **explicitly supported records**
from a CC-v2 line without its newline.

| Family | Supported event names |
| --- | --- |
| Damage/heal/death | SWING, DEATH, HEAL, SPELL_DMG, MISS, ENV_DMG, DMG_SHIELD |
| Casts | SPELL_START, SPELL_GO |
| Auras | AURA_CAST, BUFF_ADD, BUFF_REM, DEBUFF_ADD, DEBUFF_REM |
| Resources/dispel | ENERGIZE, DISPEL |
| Metadata/capabilities | RG, RAID_COMPOSITION, UNIT_STATE, UNIT_INFO, ZONE_INFO, LOOT_TRADE, LOOT |

 It returns the existing concrete
`*messages.Damage`, `*messages.Heal`, `*messages.Slain` payloads, plus the existing
power-burn `*messages.ResourceChange` emitted locally by SPELL_DMG. Stateful records (HEADER and COMBATANT records in this stateless function) return
`ErrUnsupportedRecord`. Unknown record names retain their raw content as UnparsedLine. This is deliberately a record decoder, not a whole-file combat parser.
Call it from a `ReadFile` visitor for an explicitly selected Vanilla source;
callers must decide how to handle unsupported records rather than silently
claiming the complete log was decoded.

Vanilla owns the extracted combat conversions and message construction. Legacy handlers delegate to those same functions using their
existing cursor. `CombatFields` is the narrow migration seam; `SpellLookup`
requires only dataset-aware `Spell(context.Context, chrondbc.SpellID)`. Auto
Attack lookup, missing-spell fallback, integer narrowing, GUID validation,
trailer ordering, nil attribution and tolerated extra fields remain unchanged.
Temporary dependencies are precisely GUID, messages, legacy combat values,
chrondbc spell values, dependency-free synthetic spell IDs, ptr and bitmask—not the old parser or GameDB implementation.
No identity store or payload schema is introduced. Critter events are not
filtered by this decoder. Fight/ranking eligibility and synthetics are still
outside this boundary.

Parity tests use 22 unmodified Capybara SWING/DEATH records selected for distinct
hit-info/victim-state combinations, plus malformed fields, missing fields,
integer narrowing and missing/erroring spell lookups. The same tests can be run
against pre-extraction legacy files using a Go overlay to avoid a circular
comparison of delegates. This does not establish full synthetic/export parity.

### Spell-backed records

HEAL and SPELL_DMG share the migrated signed spell-ID lookup and strict int32
list conversions. Nonpositive spell IDs remain valid nil lookups for HEAL but
fail SPELL_DMG; missing IDs use UnknownSpell and other lookup failures remain
errors. The legacy adapter passes `Parser.Spell` (not raw GameDB), preserving
missed-spell counters and lookup order even when later fields are malformed.
Periodic/hybrid spell classification, mitigation order and power-burn synthesis
retain their original behavior, including default-difficulty effect selection.
The full synthetic pipeline is still not invoked by DecodeRecord.

The spell parity fixture contains 17 representative unchanged saved Capybara records. Its
lookup uses deterministic test spell values/fallbacks, not a claim of complete
production-dataset parity. Additional explicit spell fixtures cover periodic,
hybrid, crit/periodic healing and power burn, plus malformed and missing fields.
MISS, ENV_DMG and DMG_SHIELD are now decoded too. HEADER and the other unmigrated records remain explicit errors.

### Remaining damage records

MISS retains its zero-damage payload and periodic-only modifier. ENV_DMG and
DMG_SHIELD use the stable synthetic IDs in the dependency-free
`database/gamedb/chrondbc/spellids` module; GameDB retains typed compatibility
aliases and owns actual spell construction. No GameDB implementation import
was added to parsernext. Existing error messages and lookup fallback remain.

The checked-in spell fixture is reduced to 17 representative cases; 11 further
public records cover MISS/shields (the saved Capybara log has no ENV_DMG).
Synthetic tests enumerate environmental damage kinds and unknown kinds.
`CHRONICLE_PARSER_PARITY_GZIP` enables full local saved-corpus replay without
checking hundreds of raw records into git. The pre-extraction overlay replay
compared 53,628 supported records, with 132,180 unsupported records counted
separately, using missing-spell fallback—not complete production export parity.

### Pure casts, aura records, resources and dispels

These handlers now share their original implementation with the legacy adapter.
Optional GUID sentinels, unchecked ignored aura fields, optional corpse owner,
cast flags, resource-sign handling (including legacy int32 overflow), aura state
fallbacks and lookup choice/error precedence are preserved. Nine public source
records (one per event) plus generated boundary cases cover this family.
The saved Capybara replay now compares 178,288 supported records, leaving 7,520
unsupported, against the pre-extraction implementations with fallback spell data.

### Stateful header and timestamp boundary

`vanilla.NewDecoder(spellLookup, chronicleBuildVersion)` creates independent
clock/header state, matching a fresh legacy parser. Its `DecodeRecord` method
supports HEADER plus the record families above;
the stateless `vanilla.DecodeRecord` function still rejects HEADER because it
cannot supply per-source timestamp/version interpretation. Neither entry point
reads a file or claims unsupported identity/metadata was parsed.

```go
decoder := vanilla.NewDecoder(spells, buildVersion)
// Inside the existing ReadFile visitor:
content := strings.TrimSuffix(strings.TrimSuffix(line.Raw, "\n"), "\r")
messages, err := decoder.DecodeRecord(ctx, content)
```

`DecodeHeader` returns emitted Realm/Versions messages separately from an
optional companion-version update. Invalid semver retains the last valid
version, while malformed required fields/date strings return the original
errors. Legacy handlers delegate and retain the version-dependent combatant
interpretation. The build version is an explicit read-only input; header parsing
needs no database, roster or identity service.

`HeaderState` owns only the last timestamp and last valid companion version.
HEADER inherits the previous record's time. For an initial header, UTC is used
for its emitted messages **without updating the clock**. Exactly one second of
backward movement is tolerated; larger jumps remain fatal. Successful lexical
records advance time before semantic decoding, including unsupported records or
semantic failures. Lexical failures do not update time. These are preserved
legacy quirks, not new timestamp policy. State is not a checkpoint/saved payload;
callers decide whether to discard it with provisional output after an ingestion
failure. Completing a file does not finalize/reset the decoder. A future session
can explicitly retain this owner across consecutive files; separate decoder
instances provide isolation. No automatic continuity/reset policy is imposed.

Headers advertise version strings but do **not** establish observed raid-layout,
resource or position capabilities. RG/RAID_COMPOSITION and UNIT_STATE now update an explicit capability owner in
the stateful decoder. UNIT_STATE preserves the partial-observation quirk below.

### Combatant state and complete record outcomes

`Decoder` owns name-keyed combatant/transmog caches and talent normalization.
It retains these alongside clock/version/capability state across explicitly reused
file sources. Combatant inputs accept dataset talent trees and optional gear and
logging dependencies. No snapshot codec or identity redesign is implemented.

SPELL_FAIL silently drops client-side failures, with no new log/report/counter.
Server-side failures emit SpellFail. Malformed consumed fields remain errors,
including when the optional server flag is false. BUFF_DURATION/DEBUFF_DURATION
emit the existing Skip payload with reason `aura duration update not implemented`.
Unknown records, including CHANNEL_START, CHANNEL_UPDATE and COMBAT_END, emit
UnparsedLine retaining raw record content for later work.

### Pull source and completion

`common.NewFileReader` pulls one bounded owned physical line at a time. `ReadFile`
delegates to it. Summary becomes available only after a clean EOF, not when the
last line is delivered. Read failures and cancellation remain failures; no whole
file message buffer or goroutine bridge is used.

`vanilla.NewSource(reader, maxLineBytes, decoder)` implements the existing
Advance shape without importing the legacy parser. Use a fresh Source for each
file and retain Decoder explicitly for continuity. The source does not apply a
second clock or run synthetics. It marks framing/read errors fatal so existing
consumers cannot swallow them as recoverable malformed records. Ordinary record
errors remain recoverable. Its summary certifies physical ingestion, not semantic
validity or terminal finalization. Output is provisional until completion.


### Metadata and capability observations

The roster layouts (RG/RAID_COMPOSITION), UNIT_STATE telemetry, UNIT_INFO,
ZONE_INFO and LOOT_TRADE are extracted implementations, shared with legacy.
UNIT_INFO retains existing player semantics, buff parsing, optional owner/charm
and the existing narrow `unitname.ByGUID` fallback only for unknown nonplayers.
This is wire-to-message decoding, not roster reconciliation or a new registry.

`MetadataResult` separates messages from observed capability deltas. The stateful
decoder exposes its accumulated `Capabilities()` separately from HeaderState.
**Apply deltas even on error:** legacy UNIT_STATE sets resource capability after
valid health/power fields, before parsing map/coordinates. Bad later coordinates
return no messages but retain that observation. Both paths deliberately preserve
this quirk. RG/RAID_COMPOSITION only observe a raid layout after full validation.
Stateless DecodeRecord emits messages but does not retain capabilities.

Generated metadata tests use synthetic names/GUIDs; no further raw public player
metadata is checked in. Full saved-source overlay replay executes the original
parser in order (including all headers and version-dependent combatant handling),
compares every supported message plus clock/version/capability state, and counts
unsupported records separately: 179,109 matched and 6,699 unsupported.

Next concrete boundaries are combatant/transmog caches and dataset-dependent
talent normalization, plus the ordered synthetic pipeline. LOOT now has an approved bounds check replacing the old `rest[3]` panic with
an ordinary decode error; valid payloads and earlier item parsing errors remain
unchanged. SPELL_FAIL/aura-duration outcome decisions remain pending.

### Pending record outcomes: what legacy actually discards

* `SPELL_FAIL` with a first field not starting with lowercase `0x` is treated as
  a client failure and ignored without parsing the remainder. With a GUID prefix,
  it reads caster/spell and optional server-side boolean (default true). False
  emits no message. True emits SpellFail, but trailing reason fields are ignored.
  The saved public source has 4,572 false and 1,531 true cases. An anonymized
  example is `1|SPELL_FAIL|0x0000000000000001|11578|false|89`: no failure message
  survives, including reason 89. The reason's meaning is not inferred here.
  The handler itself omits Error(), but `advance` has a deferred cursor-error
  check: malformed **consumed** fields still return errors, possibly alongside
  a message. Unconsumed client-prefix/reason fields are not validated.
* `BUFF_DURATION`/`DEBUFF_DURATION` emit a SkippedMessage with reason
  `not yet implements`, without reading their fields. Timestamp/reason survive;
  no aura duration/update semantics are decoded. Neither event appears in this
  saved Capybara source, so tests use clearly synthetic examples.
* `CHANNEL_START`, `CHANNEL_UPDATE`, and `COMBAT_END` have no CC-v2 handlers and
  become UnparsedLine, retaining raw content but no affected units/semantic
  channel or combat transition. Saved examples (GUID anonymized) are
  observed payload shapes are `45924|<GUID>|-1`, `45924|<GUID>|0`, and empty,
  respectively. Their numeric fields are not assigned new meanings here.

Parsernext still rejects these events explicitly. No skip policy, channel state
or combat-finalization meaning has been introduced by this extraction.
