package parseresult

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/wotlk"
	"github.com/Emyrk/chronicle/database"
	"github.com/google/go-cmp/cmp"
	"github.com/google/go-cmp/cmp/cmpopts"
	"github.com/google/uuid"
)

func TestParseCLEUFormats(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		format database.LogFormat
		flavor database.WoWFlavor
		suffix string
	}{
		{name: "TBC", format: database.LogFormat243CcAddon, flavor: database.WoWFlavor{database.FlavorTBC}, suffix: "250,1,5,0,10,1,nil,nil"},
		{name: "Wrath", format: database.LogFormat335aCcAddon, flavor: database.WoWFlavor{database.FlavorWrath}, suffix: "250,0,1,0,0,0,nil,nil,nil"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			reg := registry.RegistryForFlavor(logger, tc.flavor)
			ctx := parsectx.With(context.Background(), parsectx.Context{Format: tc.format, Flavor: tc.flavor})
			log := strings.Join([]string{
				`8/8 18:43:42.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + tc.suffix,
				`8/8 18:43:44.478  SWING_DAMAGE,0x0000000000000001,"Raider",0x511,0xF1300043490001E0,"Nightbane",0x10a48,` + tc.suffix,
			}, "\n")
			results, err := Parse(ctx, strings.NewReader(log), fixtureGameDB{}, reg, logger)
			if err != nil {
				t.Fatal(err)
			}
			if len(results) != 1 || results[0].Format != tc.format ||
				len(results[0].Encounters) == 0 || len(results[0].Events.Damage) == 0 ||
				!reflect.DeepEqual(results[0].Core.Capabilities, []string{"overheal", "absorb", "interrupt"}) {
				t.Fatalf("CLEU format not parsed and projected: %+v", results)
			}
			// Independent in-memory baseline, matching the worker's CLEU
			// constructor/consumer/finalization sequence. No DB side effects.
			state := encounters.New(ctx, logger, reg)
			mods, err := (fixtureGameDB{}).DurationModifiers(ctx)
			if err != nil {
				t.Fatal(err)
			}
			state.Auras.SetDurationModifiers(mods)
			state.SetSpellFetcher(fixtureGameDB{})
			consumer := consumers.New(logger, state)
			var baseline *wotlk.Parser
			if tc.format == database.LogFormat243CcAddon {
				baseline, err = wotlk.NewTBC(ctx, logger, strings.NewReader(log), fixtureGameDB{}, fixtureGameDB{}, reg)
			} else {
				baseline, err = wotlk.New(ctx, logger, strings.NewReader(log), fixtureGameDB{}, fixtureGameDB{}, reg)
			}
			if err != nil {
				t.Fatal(err)
			}
			consumer.Advancer = baseline
			if err := consumer.ConsumeAll(ctx, baseline); err != nil && !errors.Is(err, io.EOF) {
				t.Fatal(err)
			}
			if len(state.Instances) != 1 {
				t.Fatalf("baseline instances: %d", len(state.Instances))
			}
			inst := state.Instances[0]
			fin, err := inst.Finalize(ctx)
			if err != nil {
				t.Fatal(err)
			}
			want, err := Build(Input{
				Format: tc.format, Name: inst.Name(), Finalized: fin, Events: inst.Events(),
				Category: string(inst.Category), DifficultyName: inst.CurrentZone.DifficultyName,
				MaxPlayers: int32(inst.CurrentZone.MaxPlayers), DynamicDifficulty: int32(inst.CurrentZone.DynamicDifficulty),
				Capabilities: []string{"overheal", "absorb", "interrupt"}, Units: state.Units,
				IdentifyUnit: inst.IdentifyUnit, Armory: fin.Guilds,
			})
			if err != nil {
				t.Fatal(err)
			}
			if diff := cmp.Diff(want.Core, results[0].Core); diff != "" {
				t.Fatalf("core projection (-baseline +new):\n%s", diff)
			}
			if diff := cmp.Diff(want.Overview, results[0].Overview); diff != "" {
				t.Fatalf("overview projection (-baseline +new):\n%s", diff)
			}
			if diff := cmp.Diff(want.Encounters, results[0].Encounters, cmpopts.IgnoreFields(Encounter{}, "ID")); diff != "" {
				t.Fatalf("encounters (-baseline +new):\n%s", diff)
			}
			oldDamage := bytes.Replace(want.Events.Damage, []byte("$"+want.Encounters[0].ID), []byte("$"+uuid.Nil.String()), 1)
			newDamage := bytes.Replace(results[0].Events.Damage, []byte("$"+results[0].Encounters[0].ID), []byte("$"+uuid.Nil.String()), 1)
			if diff := cmp.Diff(oldDamage, newDamage); diff != "" {
				t.Fatalf("damage events (-baseline +new):\n%s", diff)
			}
			encoded, err := json.Marshal(results)
			if err != nil {
				t.Fatal(err)
			}
			var decoded []Result
			if err := json.Unmarshal(encoded, &decoded); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(results, decoded) {
				t.Fatal("CLEU projection changed after JSON roundtrip")
			}
		})
	}
}
