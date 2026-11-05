package chronicle

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"sort"
	"testing"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/chronicle/parseresult"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/go-cmp/cmp"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// parityGameDB has only game-data reads; any unexpected database method is a
// compile-time error rather than accidentally exercising a persistence path.
type parityGameDB struct{}

func (parityGameDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, chrondbc.SpellNotFound(id)
}
func (parityGameDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) { return nil, nil }
func (parityGameDB) ResolveGear([]combatant.GearItem)                                {}
func (parityGameDB) Creature(int32) (*database.WorldCreatureTemplate, bool)          { return nil, false }
func (parityGameDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}
func (parityGameDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	return chrondbc.ExtraAttackSpell{}, false
}
func (parityGameDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}
func (parityGameDB) PeriodicSpells(context.Context) (map[int32]chrondbc.PeriodicSpell, error) {
	return nil, nil
}

// This exercises the legacy parseCombatLog entrypoint without WorkerLogParse's
// persistence flow. IDs generated while detecting fights differ per parse, so
// only encounter IDs are normalized. It does not establish DB-result parity.
func TestAddonDataOnlyParseMatchesWorkerProjection(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{})
	gameDB := parityGameDB{}
	log := []byte("1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0")
	worker := &WorkerLogParse{parent: &Chronicle{logger: logger}}
	parsed, err := worker.parseCombatLog(ctx, database.LogFormat112aCcAddon,
		[]database.LogFile{{}}, nil, gameDB, reg, false, log, "")
	if err != nil {
		t.Fatalf("legacy parse: %v", err)
	}
	legacy := make([]parseresult.Result, 0, len(parsed.encountersState.Instances))
	var legacyFinal *instances.FinalizedInstance
	for _, inst := range parsed.encountersState.Instances {
		fin, err := inst.Finalize(ctx)
		if err != nil {
			t.Fatalf("legacy finalize %q: %v", inst.Name(), err)
		}
		if fin == nil || len(fin.Encounters) == 0 {
			continue
		}
		legacyFinal = fin
		result, err := parseresult.Build(parseresult.Input{
			Format: database.LogFormat112aCcAddon, Name: inst.Name(),
			Finalized: fin, Events: inst.Events(), Units: parsed.encountersState.Units, IdentifyUnit: inst.IdentifyUnit,
			Category: string(inst.Category), DifficultyName: inst.CurrentZone.DifficultyName,
			MaxPlayers: int32(inst.CurrentZone.MaxPlayers), DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
			Capabilities: parsed.logCapabilities, Armory: fin.Guilds,
		})
		if err != nil {
			t.Fatalf("legacy projection %q: %v", inst.Name(), err)
		}
		legacy = append(legacy, *result)
	}
	fresh, err := parseresult.Parse(ctx, bytes.NewReader(log), gameDB, reg, logger)
	if err != nil {
		t.Fatalf("data-only parse: %v", err)
	}
	if len(legacy) != 1 || len(fresh) != 1 || len(legacy[0].Encounters) != 1 || len(fresh[0].Encounters) != 1 {
		t.Fatalf("unexpected encounter coverage: legacy=%d/%d new=%d/%d",
			len(legacy), countEncounters(legacy), len(fresh), countEncounters(fresh))
	}
	if legacy[0].Encounters[0].ID == uuid.Nil.String() || fresh[0].Encounters[0].ID == uuid.Nil.String() || len(legacy[0].Events.Damage) == 0 {
		t.Fatal("parses must produce identified encounters and nonempty damage events")
	}
	// The comparison below uses the same DTO builder on two independent parses.
	// Also anchor key core fields directly to the live legacy writer inputs.
	live := parsed.encountersState.Instances[0]
	liveEncounter := legacyFinal.Encounters[0]
	if fresh[0].SchemaVersion != 4 || fresh[0].Core.Category != string(live.Category) ||
		fresh[0].Core.DifficultyName != live.CurrentZone.DifficultyName ||
		fresh[0].Core.Start != liveEncounter.Combat.Start || fresh[0].Core.End != liveEncounter.Combat.End ||
		fresh[0].Overview.WipeCount != legacyFinal.Overview.WipeCount ||
		fresh[0].Overview.MetricsVersion != legacyFinal.Overview.MetricsVersion ||
		len(fresh[0].Encounters[0].Fights) != len(liveEncounter.Combat.Hostiles) ||
		len(fresh[0].Units) == 0 {
		t.Fatalf("core fields diverged from live writer inputs: %+v", fresh[0])
	}
	if err := normalizeGeneratedEncounterIDs(legacy); err != nil {
		t.Fatal(err)
	}
	if err := normalizeGeneratedEncounterIDs(fresh); err != nil {
		t.Fatal(err)
	}
	legacyClass, err := classificationEvents(legacy[0].Events.UnitClassification)
	if err != nil {
		t.Fatalf("decode legacy classification: %v", err)
	}
	freshClass, err := classificationEvents(fresh[0].Events.UnitClassification)
	if err != nil {
		t.Fatalf("decode data-only classification: %v", err)
	}
	if diff := cmp.Diff(legacyClass, freshClass, cmp.Comparer(proto.Equal)); diff != "" {
		t.Fatalf("classification events (-legacy +new):\n%s", diff)
	}
	// The classifier walks a map, so encoded event order and its sequence
	// indexes can vary even when classifications match. Compare decoded events
	// above; compare every other stream byte-for-byte below.
	legacy[0].Events.UnitClassification = nil
	fresh[0].Events.UnitClassification = nil
	if diff := cmp.Diff(legacy, fresh); diff != "" {
		t.Fatalf("legacy vs data-only parse projection (-legacy +new):\n%s", diff)
	}
}

// Raw streams start with "$<encounter UUID>" before their protobuf records.
// Replace only that known header, preserving every event byte for comparison.
func normalizeGeneratedEncounterIDs(results []parseresult.Result) error {
	for i := range results {
		streams := reflect.ValueOf(&results[i].Events).Elem()
		for j := range results[i].Encounters {
			id := results[i].Encounters[j].ID
			oldHeader := []byte("$" + id)
			newHeader := []byte("$" + uuid.Nil.String())
			for k := 0; k < streams.NumField(); k++ {
				field := streams.Field(k)
				stream := field.Bytes()
				if !bytes.Contains(stream, oldHeader) {
					return fmt.Errorf("instance %d stream %s missing encounter header %s", i, streams.Type().Field(k).Name, id)
				}
				field.SetBytes(bytes.Replace(stream, oldHeader, newHeader, 1))
			}
			results[i].Encounters[j].ID = uuid.Nil.String()
		}
	}
	return nil
}

func classificationEvents(stream []byte) ([]*chronicleproto.UnitClassification, error) {
	_, n := protowire.ConsumeString(stream)
	if n < 0 {
		return nil, fmt.Errorf("classification header UUID: %v", protowire.ParseError(n))
	}
	stream = stream[n:]
	_, n = protowire.ConsumeVarint(stream) // first event timestamp
	if n < 0 {
		return nil, fmt.Errorf("classification timestamp: %v", protowire.ParseError(n))
	}
	stream = stream[n:]
	count, n := protowire.ConsumeVarint(stream)
	if n < 0 {
		return nil, fmt.Errorf("classification count: %v", protowire.ParseError(n))
	}
	stream = stream[n:]
	bodySize, n := protowire.ConsumeVarint(stream)
	if n < 0 {
		return nil, fmt.Errorf("classification body size: %v", protowire.ParseError(n))
	}
	stream = stream[n:]
	if uint64(len(stream)) != bodySize {
		return nil, fmt.Errorf("classification body has %d bytes, declared %d", len(stream), bodySize)
	}
	entries := make([]*chronicleproto.UnitClassification, 0, count)
	for len(stream) > 0 {
		data, size := protowire.ConsumeBytes(stream)
		if size < 0 {
			return nil, fmt.Errorf("classification event: %v", protowire.ParseError(size))
		}
		entry := &chronicleproto.UnitClassification{}
		if err := proto.Unmarshal(data, entry); err != nil {
			return nil, err
		}
		if entry.Meta != nil {
			entry.Meta.Index = 0 // map iteration assigns a nondeterministic sequence index
		}
		entries = append(entries, entry)
		stream = stream[size:]
	}
	if uint64(len(entries)) != count {
		return nil, fmt.Errorf("classification has %d entries, declared %d", len(entries), count)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Target < entries[j].Target })
	return entries, nil
}

func countEncounters(results []parseresult.Result) int {
	count := 0
	for _, result := range results {
		count += len(result.Encounters)
	}
	return count
}
