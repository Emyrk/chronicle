package chronicle

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/identifier"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/types/zone"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type sessionGameDB struct{ reportGameDB }

func (sessionGameDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return &chrondbc.Spell{ID: id, Effects: []chrondbc.SpellEffect{{Effect: chrondbc.EffectApplyAura, EffectAura: chrondbc.AuraEffectSchoolAbsorb}}}, nil
}
func (sessionGameDB) ResolveGear([]combatant.GearItem) {}
func (sessionGameDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	return chrondbc.ExtraAttackSpell{}, false
}

type sessionCollector struct {
	messages []messages.Message
	err      error
}

func (c *sessionCollector) Process(m messages.Message) error {
	c.messages = append(c.messages, m)
	return c.err
}

func newTestFileSession(t *testing.T) (context.Context, *vanillaFileSession, *sessionCollector) {
	t.Helper()
	ctx := parsectx.With(t.Context(), parsectx.Context{Format: database.LogFormat112aCcAddon})
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	session, err := newVanillaFileSession(ctx, logger, sessionGameDB{}, nil, false, "Test Realm")
	require.NoError(t, err)
	collector := &sessionCollector{}
	session.result.consumers = consumers.New(logger, session.result.encountersState, collector)
	return ctx, session, collector
}

func TestVanillaSessionSplitRecords(t *testing.T) {
	t.Parallel()
	lines := []string{
		"0|HEADER|0x0000000000000001|Test Realm|Test Zone|0.38.4|1.5|2.0||1.18.0|7234|build date|23.02.26 19:17:05|23.02.26 18:17:05",
		"10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;1001853:0:0:0:0|||",
		"10000|COMBATANT_TRANSMOG|Player|1:33440:61053",
		"10000|AURA_CAST|17|0x0000000000000001|0x0000000000000002|6|69|0|127|30000|0",
		"10050|BUFF_ADD|0x0000000000000002|0|17|1|1|0|0",
		"10051|SPELL_DMG|0x0000000000000002|0x0000000000000001|17|100|50,0,0|0|0|2,0,0,0",
		"10052|DEATH|0x0000000000000002",
		"10052|RAID_COMPOSITION|roster|1|1,1,1,0",
		"10052|UNIT_STATE|0x0000000000000001|10|100|2|20|0|1|0.25|0.75|",
		"malformed",
		"10052|SPELL_FAIL|client-side",
	}
	ctx, full, want := newTestFileSession(t)
	require.NoError(t, full.ProcessFile(ctx, strings.NewReader(strings.Join(lines, "\n"))))
	for split := 1; split < len(lines); split++ {
		t.Run(fmt.Sprint(split), func(t *testing.T) {
			t.Parallel()
			ctx, session, got := newTestFileSession(t)
			state := session.result.encountersState
			fanout := session.result.consumers
			pipeline := session.pipeline
			require.NoError(t, session.ProcessFile(ctx, strings.NewReader(strings.Join(lines[:split], "\n"))))
			require.EqualValues(t, split, session.result.report.totalLines)
			require.NoError(t, session.ProcessFile(ctx, strings.NewReader(strings.Join(lines[split:], "\n"))))
			require.Same(t, state, session.result.encountersState)
			require.Same(t, fanout, session.result.consumers)
			require.Same(t, pipeline, session.pipeline)
			require.Equal(t, want.messages, got.messages)
			require.EqualValues(t, len(lines), session.result.report.totalLines)
			require.Equal(t, full.result.logCapabilities, session.result.logCapabilities)
			require.Contains(t, session.result.logCapabilities, "raidgroup")
			require.Contains(t, session.result.logCapabilities, "unit-resources")
			require.Contains(t, session.result.logCapabilities, "unit-position")
			require.Equal(t, session.result.consumers.Times(), session.result.report.consumerTimes)
			before := session.result.report.totalLines
			require.NoError(t, session.ProcessFile(ctx, strings.NewReader("")))
			require.Equal(t, before, session.result.report.totalLines)
			require.Equal(t, full.result.logCapabilities, session.result.logCapabilities)
		})
	}
	var aura *messages.Aura
	var absorbed *messages.Absorbed
	var slain *messages.Slain
	var corrected *messages.Combatant
	for _, m := range want.messages {
		switch m := m.(type) {
		case *messages.Aura:
			aura = m
		case *messages.Absorbed:
			absorbed = m
		case *messages.Slain:
			slain = m
		case *messages.Combatant:
			corrected = m
		}
	}
	require.NotNil(t, aura.Source)
	require.NotNil(t, absorbed)
	require.NotNil(t, slain.Attribution)
	require.Equal(t, 33440, corrected.GearSetups[0].ItemID)
}

type sessionReadFailure struct{}

func (sessionReadFailure) Read([]byte) (int, error) { return 0, errors.New("broken source") }

type sessionForbiddenReader struct{}

func (sessionForbiddenReader) Read([]byte) (int, error) {
	panic("invalidated session read another file")
}

func TestVanillaSessionInvalidatesOnFailure(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"source", "consumer", "backward-clock", "cancelled"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			ctx, session, collector := newTestFileSession(t)
			require.NoError(t, session.ProcessFile(ctx, strings.NewReader("10000|COMBAT_END")))
			var input io.Reader = strings.NewReader("10001|COMBAT_END")
			switch kind {
			case "source":
				input = io.MultiReader(strings.NewReader("10001|COMBAT_END\n"), sessionReadFailure{})
			case "consumer":
				collector.err = errors.New("consumer failed")
			case "backward-clock":
				input = strings.NewReader("7999|COMBAT_END")
			case "cancelled":
				var cancel context.CancelFunc
				ctx, cancel = context.WithCancel(ctx)
				cancel()
			}
			require.Error(t, session.ProcessFile(ctx, input))
			require.EqualValues(t, 1, session.result.report.totalLines, "failed file must not commit progress")
			require.ErrorContains(t, session.ProcessFile(t.Context(), sessionForbiddenReader{}), "session is invalid")
		})
	}
}

type sessionFinalizer struct {
	instancehook.BaseHook
	calls int
}

func (h *sessionFinalizer) Finalize(context.Context) error { h.calls++; return nil }

func TestVanillaSessionEOFDoesNotFinalizeFight(t *testing.T) {
	t.Parallel()
	ctx, session, _ := newTestFileSession(t)
	hostiles := map[uint32]instances.Identity{}
	instances.LoadBosses(hostiles, map[uint32]string{900001: "Test Boss"})
	hook := &sessionFinalizer{}
	inst := instances.NewHookable(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), session.result.encountersState.Units, zone.Zone{Name: "test"}, instances.InstanceParams{Name: "Test", Idf: identifier.NewIdentifier(hostiles), ExtraHooks: []instancehook.Hook{hook}})
	session.result.encountersState.CurrentInstance = inst
	session.result.encountersState.Instances = append(session.result.encountersState.Instances, inst)
	boss := guid.GUID(0xF130000000000000 | uint64(900001)<<24 | 1)
	line := fmt.Sprintf("10000|SPELL_DMG|%s|0x0000000000000001|17|100|0,0,0|0|0|2,0,0,0", boss.String())
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader(line)))
	require.True(t, inst.FightActive())
	require.Zero(t, hook.calls)
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader("")))
	require.True(t, inst.FightActive())
	require.Zero(t, hook.calls)
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader(strings.Replace(line, "10000|", "10001|", 1))))
	require.True(t, inst.FightActive())
	require.Zero(t, hook.calls)
}

func (h *sessionFinalizer) ProcessMessage(bool, uuid.UUID, messages.Message) error { return nil }

func TestVanillaSessionCanonicalPlayerMetadata(t *testing.T) {
	t.Parallel()
	ctx, session, _ := newTestFileSession(t)
	state := session.result.encountersState
	inst := instances.NewHookable(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), state.Units, zone.Zone{Name: "test"}, instances.InstanceParams{Name: "Test", Idf: identifier.NewIdentifier(map[uint32]instances.Identity{})})
	state.CurrentInstance = inst
	state.Instances = append(state.Instances, inst)
	// This traverses source -> encounter state -> Hookable -> armory, including
	// the real duplicate Units processing, rather than simulating two calls.
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader("10000|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;1001853:0:0:0:0|||\n10001|COMBATANT_TRANSMOG|Player|1:33440:61053")))
	player, ok := state.Units.GetPlayer(guid.GUID(1))
	require.True(t, ok)
	require.Equal(t, 33440, player.GearSetups[0].ItemID)
	before := player.Clone()
	require.NoError(t, session.ProcessFile(ctx, strings.NewReader("10002|COMBATANT_INFO|0x0000000000000001|Player|HUNTER|NightElf|3||||Helm;1001853:0:0:0:0|||")))
	player, ok = state.Units.GetPlayer(guid.GUID(1))
	require.True(t, ok)
	require.Equal(t, before.GearSetups, player.GearSetups)
}
