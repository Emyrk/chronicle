package chronicle

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type expansionSessionCase struct {
	format database.LogFormat
	flavor database.WoWFlavor
}

func expansionSessionCases() []expansionSessionCase {
	flavors := []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorTBC}, {database.FlavorWrath}, {database.FlavorWrath, database.FlavorAzerothcoreProgression}, {database.FlavorWrath, database.FlavorChromieCraft}, database.ServerFlavor("wow-forever", database.FlavorVanilla), database.ServerFlavor("azerothcore", database.FlavorWrath), database.ServerFlavor("epoch", database.FlavorWrath)}
	var cases []expansionSessionCase
	for _, format := range []database.LogFormat{database.LogFormat243CcAddon, database.LogFormat335aCcAddon, database.LogFormatV9Cleu, database.LogFormatV22Cleu, database.LogFormatHermesproxy1142Cc} {
		for _, flavor := range flavors {
			if format == database.LogFormat243CcAddon && !flavor.Has(database.FlavorTBC) || format == database.LogFormat335aCcAddon && !flavor.Has(database.FlavorWrath) {
				continue
			}
			cases = append(cases, expansionSessionCase{format, flavor})
		}
	}
	return cases
}
func expansionSessionFixture(t *testing.T, tc expansionSessionCase, identityMode bool) (context.Context, CompleteSessionOptions, []string) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	db := &checkpointGameDB{}
	identity := checkpointTestIdentity()
	identity.Source.Format = tc.format
	identity.Source.Flavor = tc.flavor.CanonicalKey()
	identity.IdentityMode = identityMode
	reg := registry.RegistryForFlavor(logger, tc.flavor)
	prepared, err := reg.PrepareGraph(tc.format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, db)
	require.NoError(t, err)
	identity.Recipe = prepared.RecipeID()
	name, mapID, entry := "Molten Core", 409, 11502
	if tc.flavor.Has(database.FlavorTBC) {
		name, mapID, entry = "Karazhan", 532, 15687
	}
	if tc.flavor.Has(database.FlavorWrath) {
		name, mapID, entry = "Obsidian Sanctum", 615, 28860
	}
	if tc.flavor.Has(database.FlavorAzerothcoreProgression) {
		name, mapID, entry = "Onyxia's Lair", 249, 301000
	}
	if tc.flavor.Has(database.FlavorEpoch) {
		name, mapID, entry = "Onyxia's Lair", 249, 45133
	}
	modern := tc.format == database.LogFormatV9Cleu || tc.format == database.LogFormatV22Cleu || tc.format == database.LogFormatHermesproxy1142Cc
	stamp := func(second string) string {
		if tc.format == database.LogFormatV9Cleu || tc.format == database.LogFormatV22Cleu {
			return "1/14/2026 20:40:" + second + "+0  "
		}
		return "1/14 20:40:" + second + "  "
	}
	var prefix, suffix []string
	if modern {
		version := 9
		if tc.format == database.LogFormatV22Cleu {
			version = 22
		}
		prefix = append(prefix, stamp("00.000")+fmt.Sprintf("COMBAT_LOG_VERSION,%d,ADVANCED_LOG_ENABLED,0", version))
	}
	player, target, flags := `0x0000000000000001`, fmt.Sprintf("0x%016X", uint64(0xF130000000000001)|uint64(entry)<<24), `0x512`
	if modern {
		player, target, flags = "Player-2-00000001", fmt.Sprintf("Creature-0-1-%d-1-%d-1", mapID, entry), "0x512,0"
	}
	targetFlags := "0xa48"
	if modern {
		targetFlags += ",0"
	}
	companion := func(second, payload string) string {
		return stamp(second) + fmt.Sprintf(`SPELL_CAST_FAILED,%s,"Player",%s,%s,"Player",%s,1,"Companion",0x1,"%s"`, player, flags, player, flags, payload)
	}
	prefix = append(prefix, companion("00.010", fmt.Sprintf("[1Z:%s,raid,1,10 Player,10,0,0,%d,0,]", name, mapID)))
	damage := func(second string, amount int) string {
		tail := fmt.Sprintf("%d,0,1,0,0,0,nil,nil,nil", amount)
		if tc.format != database.LogFormat243CcAddon {
			tail = fmt.Sprintf("%d,0,0,1,0,0,0,nil,nil,nil", amount)
		}
		return stamp(second) + fmt.Sprintf(`SPELL_DAMAGE,%s,"Player",%s,%s,"Boss",%s,17,"Strike",0x1,%s`, player, flags, target, targetFlags, tail)
	}
	// V22 receives deliberately reversed records in each file, and file two
	// overlaps file one's timestamps. The session must retain per-file reorder,
	// never concatenate files into a global timestamp sort.
	if tc.format == database.LogFormatV22Cleu {
		prefix = append(prefix, damage("03.000", 100), damage("02.000", 50))
		suffix = append(suffix, damage("04.000", 200), damage("02.500", 25))
	} else {
		prefix = append(prefix, damage("02.000", 100))
		suffix = append(suffix, damage("04.000", 200))
	}
	suffix = append(suffix, stamp("05.000")+fmt.Sprintf(`UNIT_DIED,0x0000000000000000,nil,%s,%s,"Boss",%s`, flags, target, targetFlags))
	inputs := []string{strings.Join(prefix, "\n"), strings.Join(suffix, "\n")}
	files := []CompleteFile{checkpointTestFile("first", inputs[0]), checkpointTestFile("second", inputs[1])}
	spells := map[chrondbc.SpellID]*chrondbc.Spell{}
	for _, id := range []chrondbc.SpellID{1, 17} {
		spells[id], err = db.Spell(t.Context(), id)
		require.NoError(t, err)
	}
	opts := CompleteSessionOptions{Compatibility: identity, Files: files, Logger: logger, GameDB: db, Gear: db, Registry: reg, Prepared: prepared, PreparedSpells: spells}
	ctx := snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: tc.format, Flavor: tc.flavor}), identity.Source.RuntimeIdentity())
	return ctx, opts, inputs
}
func newExpansionSession(t *testing.T, ctx context.Context, opts CompleteSessionOptions) *CompleteFileSession {
	t.Helper()
	s, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	// Native and Hermes timestamps omit years. Seed the source's supported clock
	// input to keep fixtures independent of the wall clock, then persist it.
	clock := time.Date(2026, 1, 14, 20, 40, 0, 0, time.UTC)
	s.root.source.(interface{ SetRealmClockInfo(*realmclock.Info) }).SetRealmClockInfo(&realmclock.Info{LocalTime: clock, UTCTime: clock})
	return s
}
func TestExpansionCompleteSessionDiskContinuation(t *testing.T) {
	t.Parallel()
	for _, tc := range expansionSessionCases() {
		for _, identityMode := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/%s/identity=%t", tc.format, tc.flavor.CanonicalKey(), identityMode), func(t *testing.T) {
				t.Parallel()
				ctx, opts, inputs := expansionSessionFixture(t, tc, identityMode)
				original := newExpansionSession(t, ctx, opts)
				require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
				require.NotEmpty(t, original.root.result.encountersState.Instances)
				require.True(t, original.root.result.encountersState.CurrentInstance.FightActive())
				path := filepath.Join(t.TempDir(), "prefix.json")
				require.NoError(t, original.SnapshotPath(path))
				baseline := newExpansionSession(t, ctx, opts)
				for i, input := range inputs {
					require.NoError(t, baseline.ProcessFile(ctx, opts.Files[i], strings.NewReader(input)))
				}
				want, err := baseline.Finalize(ctx)
				require.NoError(t, err)
				require.NotEmpty(t, want)
				require.NotEmpty(t, want[0].Encounters)
				if tc.flavor.Has(database.FlavorEpoch) {
					require.True(t, want[0].Encounters[0].Boss)
					require.Equal(t, "Onyxia", want[0].Encounters[0].Name)
				}
				db := opts.GameDB.(*checkpointGameDB)
				db.forbidQueries = true
				a, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				b, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				require.NotSame(t, a.root.source, b.root.source)
				require.NotSame(t, a.root.result.encountersState.Units, b.root.result.encountersState.Units)
				for _, restored := range []*CompleteFileSession{a, b} {
					require.Zero(t, restored.root.result.encountersState.Auras.GraphObserverCount())
					require.NoError(t, restored.WireRuntime(ctx))
				}
				db.forbidQueries = false
				for _, branch := range []*CompleteFileSession{original, a, b} {
					require.NoError(t, branch.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
					require.NoError(t, branch.SnapshotPath(filepath.Join(t.TempDir(), "complete.json")))
					got, err := branch.Finalize(ctx)
					require.NoError(t, err)
					require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
					require.Equal(t, normalizedExpansionEvents(t, baseline, want), normalizedExpansionEvents(t, branch, got))
					require.Equal(t, baseline.root.result.logCapabilities, branch.root.result.logCapabilities)
					require.Equal(t, baseline.root.result.report.totalLines, branch.root.result.report.totalLines)
					if identityMode {
						require.Equal(t, baseline.root.result.creaturesState, branch.root.result.creaturesState)
					}

					require.Error(t, branch.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
					require.Error(t, branch.SnapshotPath(filepath.Join(t.TempDir(), "terminal.json")))
				}
				// A finalized live graph never consumes or edits its durable prefix.
				restored, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				require.NoError(t, restored.WireRuntime(ctx))
				require.NoError(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
				got, err := restored.Finalize(ctx)
				require.NoError(t, err)
				require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
				require.Equal(t, normalizedExpansionEvents(t, baseline, want), normalizedExpansionEvents(t, restored, got))
				saved, err := os.ReadFile(path)
				require.NoError(t, err)
				changed := opts
				changed.Compatibility.Source.Flavor = "different"
				_, err = RestoreCompleteFileSession(strings.NewReader(string(saved)), futureSessionOptions(changed, 1))
				require.ErrorContains(t, err, "compatibility mismatch")
				changed = opts
				changed.Files = append([]CompleteFile(nil), opts.Files...)
				changed.Files[0], changed.Files[1] = changed.Files[1], changed.Files[0]
				_, err = RestoreCompleteFileSession(strings.NewReader(string(saved)), futureSessionOptions(changed, 1))
				require.Error(t, err, "replaying an already checkpointed file ID must fail")
			})
		}
	}
}

func TestExpansionCompleteSessionFailures(t *testing.T) {
	t.Parallel()
	for _, tc := range expansionSessionCases() {
		t.Run(string(tc.format)+"/"+tc.flavor.CanonicalKey(), func(t *testing.T) {
			t.Parallel()
			ctx, opts, inputs := expansionSessionFixture(t, tc, true)
			original := newExpansionSession(t, ctx, opts)
			require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
			path := filepath.Join(t.TempDir(), "prefix.json")
			require.NoError(t, original.SnapshotPath(path))
			before, err := os.ReadFile(path)
			require.NoError(t, err)
			for _, input := range []io.Reader{completeSessionFailReader{}, strings.NewReader("malformed")} {
				s, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				require.NoError(t, s.WireRuntime(ctx))
				require.Error(t, s.ProcessFile(ctx, opts.Files[1], input))
				require.Equal(t, 1, s.completed)
				require.Error(t, s.SnapshotPath(path))
				_, err = s.Finalize(ctx)
				require.Error(t, err)
				after, err := os.ReadFile(path)
				require.NoError(t, err)
				require.Equal(t, before, after)
			}
			// Runtime fingerprint validation must fail before observer attachment.
			s, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
			require.NoError(t, err)
			wrong := opts.Compatibility.Source.RuntimeIdentity()
			wrong.DatasetRevision++
			require.Error(t, s.WireRuntime(snapshot.WithCompatibility(ctx, wrong)))
			require.Zero(t, s.root.result.encountersState.Auras.GraphObserverCount())
			require.Error(t, s.WireRuntime(ctx))
		})
	}
}

func TestExpansionV22FileLocalOrdering(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := expansionSessionFixture(t, expansionSessionCase{database.LogFormatV22Cleu, database.WoWFlavor{database.FlavorWrath}}, false)
	s := newExpansionSession(t, ctx, opts)
	observed := &sessionCollector{}
	// This separate ordering probe adds a nonpersisted observer; the disk matrix
	// above checkpoints only the actual production root, without this observer.
	s.root.result.consumers = consumers.New(opts.Logger, s.root.result.encountersState, observed)
	for i, input := range inputs {
		require.NoError(t, s.ProcessFile(ctx, opts.Files[i], strings.NewReader(input)))
	}
	var seconds []time.Duration
	at := time.Date(2026, 1, 14, 20, 40, 0, 0, time.UTC)
	for _, message := range observed.messages {
		if _, ok := message.(*messages.Damage); ok {
			seconds = append(seconds, message.Date().Sub(at))
		}
	}
	require.Equal(t, []time.Duration{2 * time.Second, 3 * time.Second, 2500 * time.Millisecond, 4 * time.Second}, seconds)
}

func TestCompleteSessionRejectsBlockedSources(t *testing.T) {
	t.Parallel()
	ctx, opts, _ := completeSessionFixture(t, false)
	for _, tc := range []struct {
		format database.LogFormat
		reason string
	}{{database.LogFormat112aSuperwowAddon, "intentionally excluded"}} {
		t.Run(string(tc.format), func(t *testing.T) {
			t.Parallel()
			changed := opts
			changed.Compatibility.Source.Format = tc.format
			_, err := NewCompleteFileSession(ctx, changed)
			require.ErrorContains(t, err, tc.reason)
		})
	}
}

// Compare every published protobuf stream, preserving payload bytes and order.
// Stream headers encode only generated encounter UUIDs as fixed-length strings;
// normalize those IDs and leave timestamps, messages, and all other bytes alone.
func normalizedExpansionEvents(t *testing.T, s *CompleteFileSession, output []*instances.FinalizedInstance) []map[string][]byte {
	t.Helper()
	var result []map[string][]byte
	require.Len(t, s.root.result.encountersState.Instances, len(output))
	for i, instance := range s.root.result.encountersState.Instances {
		data, err := json.Marshal(instance.Events())
		require.NoError(t, err)
		var streams map[string][]byte
		require.NoError(t, json.Unmarshal(data, &streams))
		require.NotEmpty(t, streams["Damage"])
		for name, stream := range streams {
			for j, enc := range output[i].Encounters {
				id := uuid.NewSHA1(uuid.Nil, []byte(fmt.Sprintf("encounter/%d/%d", i, j)))
				stream = bytes.ReplaceAll(stream, []byte(enc.Combat.EncounterID.String()), []byte(id.String()))
			}
			streams[name] = stream
		}
		result = append(result, streams)
	}
	return result
}
