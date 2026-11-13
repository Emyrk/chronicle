package azerothcore

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func decoderContext() context.Context {
	return parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: database.WoWFlavor{database.FlavorWrath}})
}

type oracleGear struct{}

func (oracleGear) ResolveGear(items []combatant.GearItem) {}

func TestExtensionParityWithPinnedLegacy(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	lookup := func(id chrondbc.SpellID) *chrondbc.Spell {
		if id == 0 {
			return nil
		}
		value := chrondbc.UnknownSpell(id)
		return &value
	}
	oracle := &legacyOracle{logger: logger, lookupSpell: lookup, gear: oracleGear{}}
	const base = `0x0000000000000001,"Attacker",0x400,0xF130002C36000022,"Target",0x0,`
	for _, tc := range []struct {
		event, payload string
		handler        func(time.Time, *wotlk.Matched, string) ([]messages.Message, error)
	}{
		{"CHRONICLE_HEADER", `"Realm, Name","3.3.5a",12340`, oracle.parseHeader},
		{"CHRONICLE_ZONE_INFO", `"Raid",4294967295,12,"raid"`, oracle.parseZoneInfo},
		{"CHRONICLE_COMBATANT_INFO", `0x0000000000000001,"Player","MAGE","Human",1,80,"Guild","",""`, oracle.parseCombatantInfo},
		{"CHRONICLE_COMBATANT_INFO", `0x0000000000000001,"Player","unknown","unknown",2,80,"","","bad talents"`, oracle.parseCombatantInfo},
		{"CHRONICLE_UNIT_INFO", `0xF130002C36000022,"Creature",83,0x0,nil,9223372036854775807,"hostile",true`, oracle.parseUnitInfo},
		{"CHRONICLE_UNIT_INFO", `0xF130002C36000022,"Creature",nil,nil,0x0000000000000001,nil,"friendly",false`, oracle.parseUnitInfo},
		{"CHRONICLE_UNIT_INFO", `0xF130002C36000022,"Creature",1,0x0,0x0000000000000000,1,"neutral",true`, oracle.parseUnitInfo},
		{"CHRONICLE_UNIT_EVADE", `0xF130002C36000022,"Creature",3`, oracle.parseUnitEvade},
		{"CHRONICLE_UNIT_COMBAT", `0xF130002C36000022,"Creature",0x0000000000000001,"Player"`, oracle.parseUnitCombat},
		{"CHRONICLE_UNIT_DESPAWN", `0xF130002C36000022`, oracle.parseUnitDespawn},
		{"CHRONICLE_ENCOUNTER_CREDIT", `1,2,3,4,5,6,"Boss",7,0xF130002C36000022,"Creature"`, oracle.parseEncounterCredit},
		{"CHRONICLE_ENCOUNTER_START", `ignored`, oracle.parseEncounterNoop},
		{"CHRONICLE_ENCOUNTER_END", `ignored`, oracle.parseEncounterNoop},
		{"CHRONICLE_SPELL_TARGET_RESULT", `ignored`, oracle.parseChronicleNoop},
		{"CHRONICLE_LOOT_ITEM", `ignored`, oracle.parseChronicleNoop},
		{"CHRONICLE_LOOT_MONEY", `ignored`, oracle.parseChronicleNoop},
		{"SPELL_INTERRUPT", base + `1766,"Kick",0x1,331,"Healing Wave",0x8`, oracle.parseSpellInterrupt},
		{"SPELL_ABSORBED", base + `0x0000000000000001,"Player",0x400,10901,"Shield",0x2,11`, oracle.parseSpellAbsorbed},
		{"SPELL_ABSORBED", base + `12345,"Fireball",0x4,0x0000000000000001,"Player",0x400,10901,"Shield",0x2,50`, oracle.parseSpellAbsorbed},
	} {
		t.Run(tc.event, func(t *testing.T) {
			t.Parallel()
			decoder, err := NewDecoder(decoderContext(), logger, cleu.Hooks{LookupSpell: func(id chrondbc.SpellID, _ ...string) *chrondbc.Spell { return lookup(id) }}, oracle.gear.ResolveGear)
			require.NoError(t, err)
			// Both malformed/truncated and valid records exercise an independent frozen
			// handler, not the legacy adapter that now delegates to the new owner.
			for _, payload := range []string{tc.payload, "", "not-a-guid", strings.Split(tc.payload, ",")[0]} {
				raw := "1777166257180  " + tc.event + "," + payload
				ts, _, cursor, err := wotlk.ParseLineUnixMillis(raw)
				require.NoError(t, err)
				want, wantErr := tc.handler(ts, cursor, raw)
				got, gotErr := decoder.Decode(raw)
				require.Equal(t, wantErr, gotErr)
				require.Equal(t, want, got)
			}
		})
	}
}

func TestDecoderRequiresResolvedMetadata(t *testing.T) {
	t.Parallel()
	for _, ctx := range []context.Context{context.Background(), parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormatAzerothcoreMod}), parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormat335aCcAddon, Flavor: database.WoWFlavor{database.FlavorWrath}})} {
		_, err := NewDecoder(ctx, nil, cleu.Hooks{}, nil)
		require.Error(t, err)
	}
	// An explicit non-Wrath gameplay flavor is not inferred away from its format.
	ctx := parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: database.WoWFlavor{database.FlavorTBC}})
	_, err := NewDecoder(ctx, nil, cleu.Hooks{}, nil)
	require.NoError(t, err)
}

func TestDecoderRawRecordsAndCompanion(t *testing.T) {
	t.Parallel()
	decoder, err := NewDecoder(decoderContext(), nil, cleu.Hooks{DecodeCompanion: func(ts time.Time, payload string) ([]messages.Message, bool, error) {
		if payload != "companion" {
			return nil, false, nil
		}
		require.Equal(t, time.UnixMilli(-123), ts)
		return []messages.Message{&messages.Realm{MessageBase: messages.Base(ts)}}, true, nil
	}}, nil)
	require.NoError(t, err)
	got, err := decoder.Decode("-123  companion")
	require.NoError(t, err)
	require.Len(t, got, 1)
	for _, raw := range []string{"", "missing separator", "invalid  EVENT", "1/2 03:04:05.006  EVENT", "123  "} {
		_, err = decoder.Decode(raw)
		require.Error(t, err)
	}
	got, err = decoder.Decode(`123  CHRONICLE_UNKNOWN,a,b`)
	require.NoError(t, err)
	require.IsType(t, &messages.UnparsedLine{}, got[0])
	// Standard CLEU still uses the common semantic decoder, including hex schools.
	got, err = decoder.Decode(`123  SPELL_HEAL,0x0000000000000001,"Healer",0x400,0x0000000000000002,"Target",0x400,1,"Heal",0x2,61,0,0,nil`)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.IsType(t, &messages.Heal{}, got[0])
}
