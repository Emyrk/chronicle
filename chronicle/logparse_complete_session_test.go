package chronicle

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/rankings"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Fail loudly if semantic restoration or wiring performs dependency queries.
// Each fixture owns its spy; tests never share this mutable state.
type checkpointGameDB struct {
	sessionGameDB
	forbidQueries bool
}

func (d *checkpointGameDB) Spell(ctx context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	if d.forbidQueries {
		panic("spell query during restore")
	}
	return d.sessionGameDB.Spell(ctx, id)
}
func (d *checkpointGameDB) DurationModifiers(ctx context.Context) (*chrondbc.DurationModifierSet, error) {
	if d.forbidQueries {
		panic("modifier query during restore")
	}
	return d.sessionGameDB.DurationModifiers(ctx)
}
func (d *checkpointGameDB) ExtraAttackSpell(ctx context.Context, id int32) (chrondbc.ExtraAttackSpell, bool) {
	if d.forbidQueries {
		panic("extra attack query during restore")
	}
	return d.sessionGameDB.ExtraAttackSpell(ctx, id)
}

func completeSessionFixture(t *testing.T, identityMode bool) (context.Context, CompleteSessionOptions, []string) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	flavor := database.ServerFlavor("turtle", database.FlavorVanilla)
	identity := checkpointTestIdentity()
	identity.Source.Flavor = flavor.CanonicalKey()
	identity.IdentityMode = identityMode
	db := &checkpointGameDB{}
	reg := registry.RegistryForFlavor(logger, flavor)
	prepared, err := reg.PrepareGraph(identity.Source.Format, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, db)
	require.NoError(t, err)
	identity.Recipe = prepared.RecipeID()
	inputs := []string{
		strings.Join([]string{
			"0|HEADER|0x0000000000000001|Test Realm|Molten Core|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05",
			"9999|ZONE_INFO|Molten Core|1|409|raid|0|1",
			"10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3|||||||",
			"10001|AURA_CAST|17|0x0000000000000001|0x0000000000000001|6|69|0|127|30000|0",
			"10002|BUFF_ADD|0x0000000000000001|0|17|1|1|0|0",
			"10003|RAID_COMPOSITION|roster|1|1,1,1,0",
			"10004|UNIT_STATE|0x0000000000000001|10|100|2|20|0|1|0.25|0.75|",
			"10010|SPELL_DMG|0x0000000000000001|0xF130002CEE000001|17|100|0,0,0|0|0|2,0,0,0",
		}, "\n"),
		strings.Join([]string{
			"10020|SPELL_DMG|0x0000000000000001|0xF130002CEE000001|17|200|0,0,0|0|0|2,0,0,0",
			"10030|DEATH|0xF130002CEE000001",
		}, "\n"),
	}
	files := []CompleteFile{checkpointTestFile("first", inputs[0]), checkpointTestFile("second", inputs[1])}
	spell, err := db.Spell(t.Context(), 17)
	require.NoError(t, err)
	opts := CompleteSessionOptions{Compatibility: identity, Files: files, Logger: logger, GameDB: db, Gear: db, Registry: reg, Prepared: prepared, PreparedSpells: map[chrondbc.SpellID]*chrondbc.Spell{17: spell}}
	ctx := snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: identity.Source.Format, Flavor: flavor}), identity.Source.RuntimeIdentity())
	return ctx, opts, inputs
}

func TestCompleteSessionDiskContinuation(t *testing.T) {
	t.Parallel()
	for _, identityMode := range []bool{false, true} {
		name := "encounters"
		if identityMode {
			name = "identity"
		}
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			ctx, opts, inputs := completeSessionFixture(t, identityMode)
			original, err := NewCompleteFileSession(ctx, opts)
			require.NoError(t, err)
			require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
			require.NotEmpty(t, original.root.result.encountersState.Instances)
			path := filepath.Join(t.TempDir(), "session.json")
			require.NoError(t, original.SnapshotPath(path))
			baseline, err := NewCompleteFileSession(ctx, opts)
			require.NoError(t, err)
			for i, input := range inputs {
				require.NoError(t, baseline.ProcessFile(ctx, opts.Files[i], strings.NewReader(input)))
			}
			uninterrupted, err := baseline.Finalize(ctx)
			require.NoError(t, err)
			require.Error(t, baseline.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
			require.Error(t, baseline.SnapshotPath(filepath.Join(t.TempDir(), "finalized")))
			opts.GameDB.(*checkpointGameDB).forbidQueries = true
			first, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
			require.NoError(t, err)
			second, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
			require.NoError(t, err)
			require.NotSame(t, first.root, second.root)
			require.NotSame(t, first.root.result.encountersState, second.root.result.encountersState)
			require.NotSame(t, first.root.source, second.root.source)
			require.NotSame(t, first.root.result.encountersState.Units, second.root.result.encountersState.Units)
			require.NotSame(t, first.root.result.encountersState.Auras, second.root.result.encountersState.Auras)
			if identityMode {
				require.NotSame(t, first.root.result.creaturesState, second.root.result.creaturesState)
				require.NotSame(t, first.root.result.creaturesState.Units, first.root.result.encountersState.Units)
			}

			require.Zero(t, first.root.result.encountersState.Auras.GraphObserverCount())
			require.Zero(t, second.root.result.encountersState.Auras.GraphObserverCount())
			opts.GameDB.(*checkpointGameDB).forbidQueries = false
			require.NoError(t, original.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
			want, err := original.Finalize(ctx)
			require.NoError(t, err)
			require.NotEmpty(t, want)
			require.NotEmpty(t, want[0].Encounters)
			require.Equal(t, normalizedSessionOutput(t, uninterrupted), normalizedSessionOutput(t, want))
			for _, restored := range []*CompleteFileSession{first, second} {
				opts.GameDB.(*checkpointGameDB).forbidQueries = true
				require.NoError(t, restored.WireRuntime(ctx))
				opts.GameDB.(*checkpointGameDB).forbidQueries = false
				require.NoError(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
				require.NoError(t, restored.SnapshotPath(filepath.Join(t.TempDir(), "continued.json")))
				got, err := restored.Finalize(ctx)
				require.NoError(t, err)
				require.Equal(t, want, got)
			}
			// Original terminal finalization never changes the durable pre-Finalize bytes.
			again, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
			require.NoError(t, err)
			require.NoError(t, again.WireRuntime(ctx))
			require.NoError(t, again.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
			got, err := again.Finalize(ctx)
			require.NoError(t, err)
			require.Equal(t, want, got)
		})
	}
}

func TestCompleteSessionFailureKeepsCheckpoint(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, false)
	session, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, session.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	path := filepath.Join(t.TempDir(), "session.json")
	require.NoError(t, session.SnapshotPath(path))
	saved, err := os.ReadFile(path)
	require.NoError(t, err)
	// The next immutable descriptor is correct, but its actual content is not.
	require.ErrorContains(t, session.ProcessFile(ctx, opts.Files[1], strings.NewReader("malformed")), "content mismatch")
	require.Error(t, session.SnapshotPath(path))
	after, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, saved, after)
	restored, err := RestoreCompleteFileSession(bytes.NewReader(saved), futureSessionOptions(opts, 1))
	require.NoError(t, err)
	require.NoError(t, restored.WireRuntime(ctx))
	require.NoError(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	_, err = restored.Finalize(ctx)
	require.NoError(t, err)
}

type completeSessionFailReader struct{}

func (completeSessionFailReader) Read([]byte) (int, error) {
	return 0, errors.New("fixture read failure")
}
func TestCompleteSessionInputFailure(t *testing.T) {
	t.Parallel()
	ctx, opts, _ := completeSessionFixture(t, false)
	s, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.Error(t, s.ProcessFile(ctx, opts.Files[0], completeSessionFailReader{}))
	require.Error(t, s.SnapshotPath(filepath.Join(t.TempDir(), "failed")))
	_, err = s.Finalize(ctx)
	require.Error(t, err)
}

func TestCompleteSessionRuntimePreflightIsNonMutating(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, true)
	original, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	path := filepath.Join(t.TempDir(), "session.json")
	require.NoError(t, original.SnapshotPath(path))
	restored, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
	require.NoError(t, err)
	wrong := opts.Compatibility.Source.RuntimeIdentity()
	wrong.DatasetRevision++
	require.Error(t, restored.WireRuntime(snapshot.WithCompatibility(ctx, wrong)))
	require.Zero(t, restored.root.result.encountersState.Auras.GraphObserverCount())
	// Failed wiring cannot be retried on partially trusted state.
	require.Error(t, restored.WireRuntime(ctx))
	require.Error(t, restored.SnapshotPath(filepath.Join(t.TempDir(), "invalid.json")))
}

// Normalize only generated encounter/phase UUIDs and their typed references.
// Keep all gameplay values and event buffers in the comparison.
func normalizedSessionOutput(t *testing.T, input []*instances.FinalizedInstance) []*instances.FinalizedInstance {
	t.Helper()
	output := make([]*instances.FinalizedInstance, len(input))
	for i, instance := range input {
		value := *instance
		output[i] = &value
		value.Encounters = slices.Clone(instance.Encounters)
		ids := map[uuid.UUID]uuid.UUID{}
		for j := range value.Encounters {
			e := &value.Encounters[j]
			id := uuid.NewSHA1(uuid.Nil, []byte(fmt.Sprintf("encounter/%d/%d", i, j)))
			ids[e.Combat.EncounterID] = id
			e.Combat.EncounterID = id
			e.Phases = slices.Clone(e.Phases)
			for k := range e.Phases {
				e.Phases[k].ID = uuid.NewSHA1(id, []byte(fmt.Sprint(k)))
			}
		}
		if instance.Rankings != nil {
			r := *instance.Rankings
			value.Rankings = &r
			if r.DPS != nil {
				r.DPS = make(map[uuid.UUID]*rankings.DPSResult, len(r.DPS))
			}
			for id, result := range instance.Rankings.DPS {
				require.Contains(t, ids, id)
				r.DPS[ids[id]] = result
			}
			if r.Survivability != nil {
				r.Survivability = make(map[uuid.UUID]*rankings.SurvivabilityResult, len(r.Survivability))
			}
			for id, result := range instance.Rankings.Survivability {
				require.Contains(t, ids, id)
				r.Survivability[ids[id]] = result
			}
		}
		value.RaidGroupSnapshots = slices.Clone(instance.RaidGroupSnapshots)
		for j := range value.RaidGroupSnapshots {
			if old := value.RaidGroupSnapshots[j].EncounterID; old != nil {
				require.Contains(t, ids, *old)
				id := ids[*old]
				value.RaidGroupSnapshots[j].EncounterID = &id
			}
		}
	}
	return output
}

func TestCompleteSessionRestoreThenImmediateFinalize(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, false)
	original, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	path := filepath.Join(t.TempDir(), "prefix.json")
	require.NoError(t, original.SnapshotPath(path))
	baseline, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, baseline.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	want, err := baseline.Finalize(ctx)
	require.NoError(t, err)
	restored, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, len(opts.Files)))
	require.NoError(t, err)
	require.NoError(t, restored.WireRuntime(ctx))
	got, err := restored.Finalize(ctx)
	require.NoError(t, err)
	require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
	require.Error(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	require.Error(t, restored.SnapshotPath(path))
	resumable, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
	require.NoError(t, err)
	require.NoError(t, resumable.WireRuntime(ctx))
	require.NoError(t, resumable.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
}

func TestCompleteSessionRejectsDifferentConsumerOwner(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, false)
	original, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, original.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	other, err := opts.Prepared.NewEncounterState(ctx, opts.Logger)
	require.NoError(t, err)
	original.root.result.consumers = consumers.New(opts.Logger, other)
	require.ErrorContains(t, original.SnapshotPath(filepath.Join(t.TempDir(), "bad")), "consumer root owner mismatch")
}

type checkpointFailConsumer struct{}

func (checkpointFailConsumer) Process(messages.Message) error {
	return errors.New("fixture consumer failure")
}

func TestCompleteSessionConsumerFailureInvalidatesPrefix(t *testing.T) {
	t.Parallel()
	ctx, opts, inputs := completeSessionFixture(t, false)
	session, err := NewCompleteFileSession(ctx, opts)
	require.NoError(t, err)
	require.NoError(t, session.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
	path := filepath.Join(t.TempDir(), "prefix.json")
	require.NoError(t, session.SnapshotPath(path))
	saved, err := os.ReadFile(path)
	require.NoError(t, err)
	// Inject a late consumer failure after the actual encounter consumer mutates.
	session.root.result.consumers = consumers.New(opts.Logger, session.root.result.encountersState, checkpointFailConsumer{})
	require.ErrorContains(t, session.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])), "fixture consumer failure")
	require.Equal(t, 1, session.completed)
	require.Error(t, session.SnapshotPath(path))
	require.Error(t, session.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
	_, err = session.Finalize(ctx)
	require.Error(t, err)
	after, err := os.ReadFile(path)
	require.NoError(t, err)
	require.Equal(t, saved, after)
	restored, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
	require.NoError(t, err)
	require.NoError(t, restored.WireRuntime(ctx))
	require.NoError(t, restored.ProcessFile(ctx, opts.Files[1], strings.NewReader(inputs[1])))
}
