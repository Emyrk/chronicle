package chronicle

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	azencounters "github.com/Emyrk/chronicle/combatlog/parser/azerothcore/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parsernext/snapshot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

func acoreSessionFixture(t *testing.T, flavor database.WoWFlavor, unknown, identityMode bool) (context.Context, CompleteSessionOptions, []string) {
	t.Helper()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	db := &checkpointGameDB{}
	identity := checkpointTestIdentity()
	identity.Source.Format = database.LogFormatAzerothcoreMod
	identity.Source.Flavor = flavor.CanonicalKey()
	identity.IdentityMode = identityMode
	reg := registry.RegistryForFlavor(logger, flavor)
	prepared, err := azencounters.PrepareGraph(reg, &chrondbc.DurationModifierSet{}, &chrondbc.ConsumableCatalog{}, db)
	require.NoError(t, err)
	identity.Recipe = prepared.RecipeID()
	zoneA, zoneB, mapA, mapB, entryA, entryB := "Zul'Farrak", "Molten Core", 209, 409, 7272, 11502
	if unknown {
		zoneA, zoneB, mapA, mapB, entryA, entryB = "Uncatalogued Vault", "Uncatalogued Summit", 89001, 89002, 900001, 900002
	}
	target := func(entry int) string { return fmt.Sprintf("0x%016X", uint64(0xF130000000000001)|uint64(entry)<<24) }
	zone := func(at int64, name string, id int) string {
		return fmt.Sprintf(`%d  CHRONICLE_ZONE_INFO,%q,%d,%d,"raid"`, at, name, id, id+100)
	}
	unit := func(at int64, entry int) string {
		return fmt.Sprintf(`%d  CHRONICLE_UNIT_INFO,%s,"Observed Boss",83,0x0,nil,100000,"hostile",true`, at, target(entry))
	}
	combat := func(at int64, entry int) string {
		return fmt.Sprintf(`%d  CHRONICLE_UNIT_COMBAT,%s,"Observed Boss",0x0000000000000001,"Player"`, at, target(entry))
	}
	damage := func(at int64, entry, amount int) string {
		return fmt.Sprintf(`%d  SPELL_DAMAGE,0x0000000000000001,"Player",0x400,%s,"Observed Boss",0x0,17,"Strike",0x1,%d,0,1,0,0,0,nil,nil,nil`, at, target(entry), amount)
	}
	death := func(at int64, entry int) string {
		return fmt.Sprintf(`%d  UNIT_DIED,0x0000000000000000,nil,0x80000000,%s,"Observed Boss",0xa48`, at, target(entry))
	}
	const at int64 = 1777340510000
	inputs := []string{
		strings.Join([]string{fmt.Sprintf(`%d  CHRONICLE_HEADER,"Realm","3.3.5a",12340`, at), zone(at+1, zoneA, mapA), unit(at+2, entryA), combat(at+3, entryA), damage(at+10, entryA, 100)}, "\n"),
		strings.Join([]string{damage(at+20, entryA, 200), death(at+30, entryA), zone(at+40, zoneB, mapB), unit(at+41, entryB), combat(at+42, entryB), damage(at+50, entryB, 150)}, "\n"),
		strings.Join([]string{damage(at+60, entryB, 250), death(at+70, entryB)}, "\n"),
	}
	files := make([]CompleteFile, len(inputs))
	for i, input := range inputs {
		files[i] = checkpointTestFile(fmt.Sprintf("file-%d", i), input)
	}
	spell, err := db.Spell(t.Context(), 17)
	require.NoError(t, err)
	opts := CompleteSessionOptions{Compatibility: identity, Files: files, Logger: logger, GameDB: db, Gear: db, Registry: reg, Prepared: prepared, PreparedSpells: map[chrondbc.SpellID]*chrondbc.Spell{17: spell}}
	ctx := snapshot.WithCompatibility(parsectx.With(t.Context(), parsectx.Context{Format: identity.Source.Format, Flavor: flavor}), identity.Source.RuntimeIdentity())
	return ctx, opts, inputs
}

func assertACoreSessionOutput(t *testing.T, wantSession, gotSession *CompleteFileSession, want, got []*instances.FinalizedInstance) {
	t.Helper()
	require.Equal(t, normalizedSessionOutput(t, want), normalizedSessionOutput(t, got))
	require.Equal(t, normalizedExpansionEvents(t, wantSession, want), normalizedExpansionEvents(t, gotSession, got))
	require.Equal(t, wantSession.root.result.logCapabilities, gotSession.root.result.logCapabilities)
	require.Equal(t, wantSession.root.result.report.totalLines, gotSession.root.result.report.totalLines)
	if wantSession.options.Compatibility.IdentityMode {
		require.Equal(t, wantSession.root.result.creaturesState, gotSession.root.result.creaturesState)
	}
}
func TestACoreCompleteSessionProductionDiskParity(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorWrath}, database.ServerFlavor("azerothcore", database.FlavorWrath)} {
		for _, unknown := range []bool{false, true} {
			for _, identityMode := range []bool{false, true} {
				for _, boundary := range []int{1, 2} {
					t.Run(fmt.Sprintf("%s/unknown=%t/identity=%t/boundary=%d", flavor.CanonicalKey(), unknown, identityMode, boundary), func(t *testing.T) {
						t.Parallel()
						ctx, opts, inputs := acoreSessionFixture(t, flavor, unknown, identityMode)
						newSession := func() *CompleteFileSession {
							s, err := NewCompleteFileSession(ctx, opts)
							require.NoError(t, err)
							return s
						}
						process := func(s *CompleteFileSession, start, end int) {
							for i := start; i < end; i++ {
								require.NoError(t, s.ProcessFile(ctx, opts.Files[i], strings.NewReader(inputs[i])))
							}
						}
						prefix := newSession()
						process(prefix, 0, boundary)
						require.Len(t, prefix.root.result.encountersState.Instances, boundary)
						require.True(t, prefix.root.result.encountersState.CurrentInstance.FightActive())
						path := filepath.Join(t.TempDir(), "prefix.json")
						require.NoError(t, prefix.SnapshotPath(path))
						baseline := newSession()
						process(baseline, 0, len(inputs))
						want, err := baseline.Finalize(ctx)
						require.NoError(t, err)
						require.Len(t, want, 2)
						for _, instance := range want {
							require.NotEmpty(t, instance.Encounters)
							require.True(t, instance.Encounters[0].Boss)
						}
						if unknown {
							require.Equal(t, "Uncatalogued Vault", baseline.root.result.encountersState.Instances[0].Name())
							require.Equal(t, "Uncatalogued Summit", baseline.root.result.encountersState.Instances[1].Name())
							require.EqualValues(t, 89001, want[0].Encounters[0].Combat.MapID)
							require.EqualValues(t, 89002, want[1].Encounters[0].Combat.MapID)
						}
						// A fresh restore can finalize immediately, without processing more files.
						prefixBaseline := newSession()
						process(prefixBaseline, 0, boundary)
						prefixWant, err := prefixBaseline.Finalize(ctx)
						require.NoError(t, err)
						spy := opts.GameDB.(*checkpointGameDB)
						spy.forbidQueries = true
						immediate, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, boundary))
						require.NoError(t, err)
						a, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, boundary))
						require.NoError(t, err)
						b, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, boundary))
						require.NoError(t, err)
						require.NotSame(t, a.root.source, b.root.source)
						require.NotSame(t, a.root.result.encountersState.Units, b.root.result.encountersState.Units)
						for _, s := range []*CompleteFileSession{immediate, a, b} {
							state := s.root.result.encountersState
							require.Zero(t, state.Auras.GraphObserverCount())
							if identityMode {
								require.NotSame(t, state.Units, s.root.result.creaturesState.Units)
							}
							require.NoError(t, s.WireRuntime(ctx))
							for _, instance := range state.Instances {
								require.NoError(t, instance.ValidateGraphSharedOwners(state.Units, state.Auras, state.ConsumeTracker, state.Vehicles, state.RaidGroups))
							}
						}
						spy.forbidQueries = false
						prefixGot, err := immediate.Finalize(ctx)
						require.NoError(t, err)
						assertACoreSessionOutput(t, prefixBaseline, immediate, prefixWant, prefixGot)
						require.Error(t, immediate.ProcessFile(ctx, opts.Files[boundary], strings.NewReader(inputs[boundary])))
						require.Error(t, immediate.SnapshotPath(path))
						for _, branch := range []*CompleteFileSession{prefix, a, b} {
							process(branch, boundary, len(inputs))
							require.NoError(t, branch.SnapshotPath(filepath.Join(t.TempDir(), "complete.json")))
							got, err := branch.Finalize(ctx)
							require.NoError(t, err)
							assertACoreSessionOutput(t, baseline, branch, want, got)
						}
						// Terminal finalization of either original/restored graphs leaves disk resumable.
						again, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, boundary))
						require.NoError(t, err)
						require.NoError(t, again.WireRuntime(ctx))
						process(again, boundary, len(inputs))
						got, err := again.Finalize(ctx)
						require.NoError(t, err)
						assertACoreSessionOutput(t, baseline, again, want, got)
					})
				}
			}
		}
	}
}

func TestACoreCompleteSessionRejectsDependenciesAndInputFailures(t *testing.T) {
	t.Parallel()
	for _, flavor := range []database.WoWFlavor{{database.FlavorVanilla}, {database.FlavorWrath}, database.ServerFlavor("azerothcore", database.FlavorWrath)} {
		t.Run(flavor.CanonicalKey(), func(t *testing.T) {
			t.Parallel()
			ctx, opts, inputs := acoreSessionFixture(t, flavor, true, true)
			prefix, err := NewCompleteFileSession(ctx, opts)
			require.NoError(t, err)
			require.NoError(t, prefix.ProcessFile(ctx, opts.Files[0], strings.NewReader(inputs[0])))
			path := filepath.Join(t.TempDir(), "prefix.json")
			require.NoError(t, prefix.SnapshotPath(path))
			before, err := os.ReadFile(path)
			require.NoError(t, err)
			wrong := opts
			wrong.Compatibility.Source.DatasetRevision++
			_, err = RestoreCompleteFileSessionPath(path, futureSessionOptions(wrong, 1))
			require.ErrorContains(t, err, "compatibility mismatch")
			wrong = opts
			wrong.Files = append([]CompleteFile(nil), opts.Files...)
			wrong.Files[0], wrong.Files[1] = wrong.Files[1], wrong.Files[0]
			_, err = RestoreCompleteFileSessionPath(path, futureSessionOptions(wrong, 1))
			require.Error(t, err, "replaying an already checkpointed file ID must fail")
			s, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
			require.NoError(t, err)
			badIdentity := opts.Compatibility.Source.RuntimeIdentity()
			badIdentity.DatasetRevision++
			require.Error(t, s.WireRuntime(snapshot.WithCompatibility(ctx, badIdentity)))
			require.Zero(t, s.root.result.encountersState.Auras.GraphObserverCount())
			for _, reader := range []io.Reader{completeSessionFailReader{}, strings.NewReader("malformed")} {
				s, err := RestoreCompleteFileSessionPath(path, futureSessionOptions(opts, 1))
				require.NoError(t, err)
				require.NoError(t, s.WireRuntime(ctx))
				require.Error(t, s.ProcessFile(ctx, opts.Files[1], reader))
				require.Error(t, s.SnapshotPath(path))
				_, err = s.Finalize(ctx)
				require.Error(t, err)
				after, err := os.ReadFile(path)
				require.NoError(t, err)
				require.Equal(t, before, after)
			}
		})
	}
}
