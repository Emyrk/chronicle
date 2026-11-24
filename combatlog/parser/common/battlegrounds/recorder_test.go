package battlegrounds_test

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/blizzard/modern"
	"github.com/Emyrk/chronicle/combatlog/parser/reorder"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database/gamedb/talents"

	"github.com/Emyrk/chronicle/api/chronicleproto"
	"github.com/Emyrk/chronicle/combatlog/parser/common/battlegrounds"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// decodeStream follows the existing encounterevents test decoder's wire framing.
func decodeStream(t *testing.T, data []byte, id uuid.UUID, origin time.Time) [][]byte {
	t.Helper()
	key, n := protowire.ConsumeString(data)
	require.Positive(t, n)
	data = data[n:]
	require.Equal(t, id.String(), key)
	ts, n := protowire.ConsumeVarint(data)
	require.Positive(t, n)
	data = data[n:]
	require.Equal(t, uint64(origin.UnixMilli()), ts)
	count, n := protowire.ConsumeVarint(data)
	require.Positive(t, n)
	data = data[n:]
	length, n := protowire.ConsumeVarint(data)
	require.Positive(t, n)
	data = data[n:]
	require.Equal(t, uint64(len(data)), length)
	var result [][]byte
	for len(data) > 0 {
		b, n := protowire.ConsumeBytes(data)
		require.Positive(t, n)
		result = append(result, b)
		data = data[n:]
	}
	require.Equal(t, count, uint64(len(result)))
	return result
}
func recorder(t *testing.T) *battlegrounds.Recorder {
	t.Helper()
	r, err := battlegrounds.NewRecorder(database.LogFormatV22Cleu, known)
	require.NoError(t, err)
	return r
}
func finished(t *testing.T, r *battlegrounds.Recorder) []battlegrounds.Recording {
	t.Helper()
	require.NoError(t, r.Finish())
	require.NoError(t, r.Finish())
	out, err := r.Recordings()
	require.NoError(t, err)
	return out
}
func TestRecorderContinuousSnapshots(t *testing.T) {
	t.Parallel()
	r := recorder(t)
	_, err := r.Recordings()
	require.Error(t, err)
	name := "fixture spell"
	caster := guid.GUID(1)
	amount := uint32(4)
	damage := &messages.Damage{MessageBase: messages.Base(at(3)), Amount: 42, Caster: &caster, SpellName: &name, SpellData: &chrondbc.Spell{ID: 123}, Trailer: types.Trailer{{Amount: &amount, HitType: types.HitTypePartialAbsorb}}}
	damage.AddActivity(1, messages.ActivityStart)
	pos := &messages.UnitPosition{MessageBase: messages.Base(at(6)), Unit: 1, X: 10, Y: 20, MapID: 1}
	for _, m := range []messages.Message{
		&messages.Damage{MessageBase: messages.Base(at(0))}, zoneAt(1, 100), zoneAt(2, 1), damage,
		&messages.Slain{MessageBase: messages.Base(at(4)), Victim: 1},
		&messages.Resurrection{MessageBase: messages.Base(at(5))}, pos,
		zoneAt(3600, 1), &messages.Heal{MessageBase: messages.Base(at(3601)), Amount: 17},
	} {
		require.NoError(t, r.Process(m))
	}
	require.Equal(t, map[guid.GUID]messages.ActivityEventType{1: messages.ActivityStart}, damage.Activity())
	// Every mutable nested field is changed after Process, before finalization.
	damage.Amount = 999
	damage.SpellData.ID = 999
	name = "changed"
	caster = 99
	amount = 99
	damage.AddActivity(1, messages.ActivityEnd)
	damage.ResetActivity()
	pos.X = 999
	out := finished(t, r)
	require.Len(t, out, 1)
	rec := out[0]
	require.Equal(t, at(3601), rec.Episode.LastObservedAt)
	require.Equal(t, battlegrounds.CloseEOF, rec.Episode.CloseReason)
	d := decodeStream(t, rec.Events.Damage, rec.PayloadID, at(2))
	require.Len(t, d, 1)
	var got chronicleproto.Damage
	require.NoError(t, proto.Unmarshal(d[0], &got))
	require.EqualValues(t, 42, got.Amount)
	require.EqualValues(t, 123, got.SpellData.Id)
	require.Equal(t, "fixture spell", got.SourceName)
	require.Equal(t, guid.GUID(1).String(), got.GetCaster())
	require.EqualValues(t, 4, got.Tailers[0].GetAmount())
	require.EqualValues(t, 1000, got.Meta.OffsetMilli)
	require.Equal(t, "start", got.Meta.Activity[0].EventType)
	h := decodeStream(t, rec.Events.Healing, rec.PayloadID, at(2))
	require.Len(t, h, 1)
	var heal chronicleproto.Heal
	require.NoError(t, proto.Unmarshal(h[0], &heal))
	require.EqualValues(t, 3599000, heal.Meta.OffsetMilli)
	p := decodeStream(t, rec.Events.UnitPosition, rec.PayloadID, at(2))
	require.Len(t, p, 1)
	var position chronicleproto.UnitPosition
	require.NoError(t, proto.Unmarshal(p[0], &position))
	require.Equal(t, float64(10), position.X)
	require.EqualValues(t, 4000, position.Meta.OffsetMilli)
	// Indices share one episode-wide order even though events occupy separate streams.
	require.EqualValues(t, 0, got.Meta.Index)
	require.Greater(t, position.Meta.Index, got.Meta.Index)
	require.Greater(t, heal.Meta.Index, position.Meta.Index)
	require.Len(t, decodeStream(t, rec.Events.Slain, rec.PayloadID, at(2)), 1)
	require.Len(t, decodeStream(t, rec.Events.Resurrection, rec.PayloadID, at(2)), 1)
	require.ErrorContains(t, r.Process(damage), "after finish")
	again, err := r.Recordings()
	require.NoError(t, err)
	require.Equal(t, out, again)
}

func TestRecorderTransitionsWithoutDamage(t *testing.T) {
	t.Parallel()
	r := recorder(t)
	for _, m := range []messages.Message{zoneAt(1, 1), zoneAt(2, 1), zoneAt(3, 100), &messages.Heal{MessageBase: messages.Base(at(4))}, zoneAt(5, 1), zoneAt(6, 2)} {
		require.NoError(t, r.Process(m))
	}
	out := finished(t, r)
	require.Len(t, out, 3)
	for i, rec := range out {
		require.EqualValues(t, i+1, rec.Episode.ID)
		require.NotEqual(t, uuid.Nil, rec.PayloadID)
		require.Empty(t, decodeStream(t, rec.Events.Damage, rec.PayloadID, rec.Episode.FirstObservedAt))
		require.Empty(t, decodeStream(t, rec.Events.Healing, rec.PayloadID, rec.Episode.FirstObservedAt))
	}
	require.NotEqual(t, out[0].PayloadID, out[1].PayloadID)
	require.Equal(t, at(3), out[0].Episode.ExitAt)
	require.Equal(t, at(2), out[0].Episode.LastObservedAt)
	require.Equal(t, at(6), out[1].Episode.ExitAt)
	require.Equal(t, battlegrounds.CloseEOF, out[2].Episode.CloseReason)
	require.Empty(t, finished(t, recorder(t)))
}

func TestRecorderTerminalErrors(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"version", "encoding"} {
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			r := recorder(t)
			require.NoError(t, r.Process(zoneAt(1, 1)))
			m := header("21")
			if kind == "encoding" {
				m = &messages.Heal{MessageBase: messages.Base(at(2)), SpellName: string([]byte{0xff})}
			}
			err := r.Process(m)
			require.Error(t, err)
			require.Same(t, err, r.Process(zoneAt(3, 2)))
			require.Same(t, err, r.Finish())
			require.Same(t, err, r.Finish())
			out, resultErr := r.Recordings()
			require.Same(t, err, resultErr)
			require.Nil(t, out)
		})
	}
	for _, format := range append(database.AllLogFormatValues(), "", "unknown") {
		if format == database.LogFormatV22Cleu {
			continue
		}
		r, err := battlegrounds.NewRecorder(format, known)
		require.Error(t, err)
		require.Nil(t, r)
	}
	_, err := battlegrounds.NewRecorder(database.LogFormatV22Cleu, nil)
	require.Error(t, err)
}

// fixtureDB supplies deterministic spell metadata only; no live game database.
type fixtureDB struct{}

func (fixtureDB) ResolveGear([]combatant.GearItem)                       {}
func (fixtureDB) Creature(int32) (*database.WorldCreatureTemplate, bool) { return nil, false }
func (fixtureDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return &chrondbc.Spell{ID: id}, nil
}
func (fixtureDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) { return nil, nil }
func (fixtureDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, nil
}
func (fixtureDB) ExtraAttackSpell(context.Context, int32) (chrondbc.ExtraAttackSpell, bool) {
	return chrondbc.ExtraAttackSpell{}, false
}
func (fixtureDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return &chrondbc.DurationModifierSet{}, nil
}
func (fixtureDB) PeriodicSpells(context.Context) (map[int32]chrondbc.PeriodicSpell, error) {
	return nil, nil
}

func TestRecorderModernReorderEOFTail(t *testing.T) {
	t.Parallel()
	// Handwritten synthetic fixture, NOT real battleground telemetry. Map 1 is
	// classified solely by this test. Damage arrives before an earlier entry Zone.
	const fixture = `9/20/2026 12:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,0,BUILD_VERSION,1.60.1,PROJECT_ID,18
9/20/2026 12:00:02.000  SPELL_DAMAGE,Player-2-00000001,"Fixture One",0x514,0,Player-2-00000002,"Fixture Two",0x514,0,1,"Fixture Spell",0x1,25,25,-1,1,0,0,0,nil,nil,nil
9/20/2026 12:00:01.000  ZONE_CHANGE,1,"Fixture Map",1
`
	p, err := modern.New(t.Context(), slog.New(slog.NewTextHandler(io.Discard, nil)), strings.NewReader(fixture), fixtureDB{}, fixtureDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	ordered := reorder.New(p, time.Hour) // Entire short fixture must drain at EOF.
	r := recorder(t)
	for {
		batch, err := ordered.Advance(t.Context())
		if err == io.EOF {
			require.Empty(t, batch)
			break
		}
		require.NoError(t, err)
		for _, m := range batch {
			require.NoError(t, r.Process(m))
		}
	}
	out := finished(t, r)
	require.Len(t, out, 1)
	require.Equal(t, at(1), out[0].Episode.FirstObservedAt)
	require.Equal(t, at(2), out[0].Episode.LastObservedAt)
	body := decodeStream(t, out[0].Events.Damage, out[0].PayloadID, at(1))
	require.Len(t, body, 1)
	var damage chronicleproto.Damage
	require.NoError(t, proto.Unmarshal(body[0], &damage))
	require.EqualValues(t, 25, damage.Amount)
	require.EqualValues(t, 1000, damage.Meta.OffsetMilli)
}
