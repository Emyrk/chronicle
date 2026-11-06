package parseresult

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"reflect"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
)

func TestCollectInstancesPartialAndLegacySemantics(t *testing.T) {
	t.Parallel()
	makeTasks := func() []instanceTask {
		return []instanceTask{
			{name: "empty", run: func() (Result, bool, string, error) { return Result{}, false, "", errors.New("ignored like legacy") }},
			{name: "raid", run: func() (Result, bool, string, error) { return Result{Name: "first"}, true, "", nil }},
			{name: "raid", run: func() (Result, bool, string, error) { return Result{}, true, "finalize", errors.New("bad finalize") }},
			{name: "raid", run: func() (Result, bool, string, error) { return Result{}, true, "project", errors.New("bad projection") }},
			{name: "raid", run: func() (Result, bool, string, error) { return Result{Name: "last"}, true, "", nil }},
		}
	}
	partial, err := collectInstances(context.Background(), makeTasks(), true)
	if err != nil {
		t.Fatal(err)
	}
	if diff := []string{partial.Results[0].Name, partial.Results[1].Name}; !reflect.DeepEqual(diff, []string{"first", "last"}) || len(partial.Failures) != 2 {
		t.Fatalf("lost successful instances or failures: %+v", partial)
	}
	if partial.Failures[0] != (InstanceFailure{Key: "raid_2", Stage: "finalize", Message: "bad finalize"}) ||
		partial.Failures[1] != (InstanceFailure{Key: "raid_3", Stage: "project", Message: "bad projection"}) {
		t.Fatalf("wrong failure keys or diagnostics: %+v", partial.Failures)
	}
	encoded, err := json.Marshal(partial)
	if err != nil {
		t.Fatal(err)
	}
	var decoded ParseOutcome
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(partial, decoded) {
		t.Fatalf("successful results or failures changed in transit: %+v", decoded)
	}
	strict, err := collectInstances(context.Background(), makeTasks(), false)
	if err == nil || !strings.Contains(err.Error(), "finalize instance \"raid\": bad finalize") || len(strict.Results) != 0 {
		t.Fatalf("strict Parse semantics changed: outcome=%+v err=%v", strict, err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	_, err = collectInstances(ctx, []instanceTask{{name: "raid", run: func() (Result, bool, string, error) {
		cancel()
		return Result{}, true, "finalize", context.Canceled
	}}}, true)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation swallowed as instance failure: %v", err)
	}
}

func TestParseWithFailuresRejectsIncompatibleContext(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ctx := parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormatAzerothcoreMod})
	_, err := ParseWithFailures(ctx, strings.NewReader(""), fixtureGameDB{}, registry.RegistryForFlavor(logger, nil), logger)
	if err == nil || !strings.Contains(err.Error(), "unsupported parse-result format") {
		t.Fatalf("mismatched context accepted: %v", err)
	}
}

type contextCheckingGameDB struct {
	fixtureGameDB
	check func(context.Context)
}

func (db contextCheckingGameDB) DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error) {
	db.check(ctx)
	return &chrondbc.DurationModifierSet{}, nil
}
func (db contextCheckingGameDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}

func TestParseWithFailuresStampsDefaultContextAndKeepsConfiguredContext(t *testing.T) {
	t.Parallel()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	reg := registry.RegistryForFlavor(logger, database.WoWFlavor{database.FlavorVanillaPlus})
	input := "1771564196000|ZONE_INFO|Zul'Gurub||1|raid|0|309\n" +
		"1771564197000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564200000|SWING|0x000000000001C7AC|0xF1300039F2000001|194|2|1|1|0|0|0\n" +
		"1771564205000|ZONE_INFO|Stranglethorn Vale||0|none|0"
	for _, tc := range []struct {
		name string
		ctx  context.Context
	}{
		{name: "default", ctx: context.Background()},
		{name: "configured", ctx: parsectx.With(context.Background(), parsectx.Context{
			Type: database.LogTypeKronos, Format: database.LogFormat112aCcAddon,
			Flavor: reg.Flavor(), DatasetID: uuid.New(), TalentTrees: &talents.TalentTreeData{},
		})},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			wantDataset := uuid.Nil
			if tc.name == "configured" {
				wantDataset, _ = parsectx.DatasetTalents(tc.ctx)
			}
			db := contextCheckingGameDB{check: func(ctx context.Context) {
				metadata, ok := parsectx.FromContext(ctx)
				if !ok || metadata.Format != database.LogFormat112aCcAddon || !reflect.DeepEqual(metadata.Flavor, reg.Flavor()) || metadata.DatasetID != wantDataset {
					t.Errorf("wrong parse context: %+v", metadata)
				}
				if tc.name == "configured" && (metadata.Type != database.LogTypeKronos || metadata.TalentTrees == nil) {
					t.Errorf("caller-supplied type/talent trees lost: %+v", metadata)
				}
			}}
			outcome, err := ParseWithFailures(tc.ctx, strings.NewReader(input), db, reg, logger)
			if err != nil || len(outcome.Results) != 1 || len(outcome.Failures) != 0 {
				t.Fatalf("parse with context: %+v, %v", outcome, err)
			}
			if outcome.Results[0].SchemaVersion != 8 || outcome.Results[0].DatasetID != wantDataset ||
				!reflect.DeepEqual(outcome.Results[0].Flavor, reg.Flavor()) {
				t.Fatalf("resolved parse identity missing: %+v", outcome.Results[0])
			}
			encoded, err := json.Marshal(outcome.Results[0])
			if err != nil {
				t.Fatal(err)
			}
			var decoded Result
			if err := json.Unmarshal(encoded, &decoded); err != nil {
				t.Fatal(err)
			}
			if decoded.DatasetID != wantDataset || !reflect.DeepEqual(decoded.Flavor, reg.Flavor()) || decoded.SchemaVersion != 8 {
				t.Fatalf("identity changed after JSON roundtrip: %+v", decoded)
			}
		})
	}
}
