package parseresult

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
)

// The input uses canonical 1.12a CC-addon parser lines from parserv2 tests.
// Game-data lookups use a read-only stub.
type fixtureGameDB struct{}

func (fixtureGameDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, chrondbc.SpellNotFound(id)
}
func (fixtureGameDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, nil
}
func (fixtureGameDB) ResolveGear([]combatant.GearItem)                       {}
func (fixtureGameDB) Creature(int32) (*database.WorldCreatureTemplate, bool) { return nil, false }
func (fixtureGameDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}
func (fixtureGameDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	return chrondbc.ExtraAttackSpell{}, false
}
func (fixtureGameDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}
func (fixtureGameDB) PeriodicSpells(context.Context) (map[int32]chrondbc.PeriodicSpell, error) {
	return nil, nil
}

func TestParseCanonicalLinesRoundTrip(t *testing.T) {
	t.Parallel()
	log := strings.Join([]string{
		"1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309",
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0",
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0",
	}, "\n")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{})
	results, err := Parse(context.Background(), strings.NewReader(log), fixtureGameDB{}, reg, logger)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) == 0 {
		t.Fatal("expected a finalized instance from canonical parser lines")
	}
	foundEncounter := false
	for _, result := range results {
		if result.Format != database.LogFormat112aCcAddon {
			t.Fatalf("format: %q", result.Format)
		}
		if result.Name == "Zul'Gurub" && len(result.Encounters) > 0 && len(result.Events.Damage) > 0 {
			foundEncounter = true
		}
	}
	if !foundEncounter {
		t.Fatal("parser produced no encounter with damage stream")
	}
	data, err := json.Marshal(results)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []Result
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(results, decoded) {
		t.Fatal("parsed result changed after JSON roundtrip")
	}
}
