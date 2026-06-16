package wotlk

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/vanilla/state/encounters/registry"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var _ gamedb.GameDB = (*stubSpellDB)(nil)

// stubSpellDB implements gamedb.SpellFetcher with a no-op.
type stubSpellDB struct{}

func (d stubSpellDB) ResolveGear(gear []combatant.GearItem)                        {}
func (d stubSpellDB) Creature(entry int32) (*database.WorldCreatureTemplate, bool) { return nil, false }
func (stubSpellDB) Spell(_ context.Context, _ chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, fmt.Errorf("no spell database loaded")
}
func (stubSpellDB) SpellsByName(_ context.Context, _ string) ([]*chrondbc.Spell, error) {
	return nil, fmt.Errorf("no spell database loaded")
}
func (stubSpellDB) TalentTrees(_ context.Context, _ uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, fmt.Errorf("no talent database loaded")
}

func newTestParser(t *testing.T, logData string) *Parser {
	t.Helper()
	p, err := New(context.Background(), slog.Default(), strings.NewReader(logData), stubSpellDB{}, nil, registry.NewRegistry(slog.Default()))
	require.NoError(t, err)
	p.SetBaseYear(2025)
	return p
}

// advanceOne is a test helper that calls Advance and returns the first
// non-synthetic-Unit message (synthetic Unit messages are prepended by unitInfo).
func advanceOne(t *testing.T, p *Parser) messages.Message {
	t.Helper()
	msgs, err := p.Advance(context.Background())
	require.NoError(t, err)
	require.NotEmpty(t, msgs)
	for _, m := range msgs {
		switch m.(type) {
		case *messages.Unit, *messages.Combatant:
			continue
		}
		return m
	}
	return msgs[0]
}

func TestParser_SwingDamage(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:08.214  SWING_DAMAGE,0x000000000005B319,"Anasui",0x10512,0xF1300023890000AD,"Scarshield Legionnaire",0xa48,244,0,1,0,0,0,nil,nil,nil`)

	msg := advanceOne(t, p)
	dmg, ok := msg.(*messages.Damage)
	require.True(t, ok, "expected *messages.Damage, got %T", msg)

	assert.NotNil(t, dmg.Caster)
	assert.Equal(t, guid.GUID(0x000000000005B319), *dmg.Caster)
	assert.Equal(t, guid.GUID(0xF1300023890000AD), dmg.Target)
	assert.Equal(t, int32(244), dmg.Amount)
	assert.Equal(t, types.PhysicalSchool, dmg.School)
	assert.True(t, dmg.HitType.Has(types.HitTypeHit))
}

func TestParser_SwingMissed(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:08.853  SWING_MISSED,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,0x000000000005B319,"Anasui",0x10512,MISS`)

	msg := advanceOne(t, p)
	dmg, ok := msg.(*messages.Damage)
	require.True(t, ok, "expected *messages.Damage, got %T", msg)

	assert.True(t, dmg.HitType.Has(types.HitTypeMiss))
	assert.Equal(t, int32(0), dmg.Amount)
}

func TestParser_SpellEnergize(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:08.481  SPELL_ENERGIZE,0x00000000000019CA,"Ioser",0x512,0x00000000000019CA,"Ioser",0x512,35548,"Combat Potency",0x1,15,3`)

	msg := advanceOne(t, p)
	rc, ok := msg.(*messages.ResourceChange)
	require.True(t, ok, "expected *messages.ResourceChange, got %T", msg)

	assert.Equal(t, int32(15), rc.Amount)
	assert.Equal(t, types.ResourceEnergy, rc.Resource)
	assert.Equal(t, types.ChangeDirectionGain, rc.Direction)
}

func TestParser_SpellPeriodicEnergize(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:09.143  SPELL_PERIODIC_ENERGIZE,0x000000000005B319,"Anasui",0x10512,0x000000000005B319,"Anasui",0x10512,5229,"Enrage",0x1,2,1`)

	msg := advanceOne(t, p)
	rc, ok := msg.(*messages.ResourceChange)
	require.True(t, ok, "expected *messages.ResourceChange, got %T", msg)

	assert.Equal(t, int32(2), rc.Amount)
	assert.Equal(t, types.ResourceRage, rc.Resource)
}

func TestParser_SpellCastSuccess(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:09.143  SPELL_CAST_SUCCESS,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,6774,"Slice and Dice",0x1`)

	msg := advanceOne(t, p)
	sg, ok := msg.(*messages.SpellGo)
	require.True(t, ok, "expected *messages.SpellGo, got %T", msg)

	assert.Equal(t, guid.GUID(0x00000000000019CA), sg.Caster)
	assert.NotNil(t, sg.Target)
	assert.Equal(t, guid.GUID(0xF1300023890000A9), *sg.Target)
}

func TestParser_SpellAuraApplied(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:09.143  SPELL_AURA_APPLIED,0x00000000000019CA,"Ioser",0x512,0x00000000000019CA,"Ioser",0x512,6774,"Slice and Dice",0x1,BUFF`)

	msg := advanceOne(t, p)
	aura, ok := msg.(*messages.Aura)
	require.True(t, ok, "expected *messages.Aura, got %T", msg)

	assert.True(t, aura.IsBuff)
	assert.Equal(t, "Slice and Dice", aura.SpellName)
	assert.Equal(t, types.AuraStateAdded, aura.State)
}

func TestParser_SpellAuraAppliedDose(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:08.481  SPELL_AURA_APPLIED_DOSE,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,85080,"Talon Rip",0x1,DEBUFF,2`)

	msg := advanceOne(t, p)
	aura, ok := msg.(*messages.Aura)
	require.True(t, ok, "expected *messages.Aura, got %T", msg)

	assert.False(t, aura.IsBuff)
	assert.Equal(t, "Talon Rip", aura.SpellName)
	assert.Equal(t, int32(2), aura.Amount)
	assert.Equal(t, types.AuraStateAdded, aura.State)
}

func TestParser_SpellCastSuccessNilTarget(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:40:09.143  SPELL_CAST_SUCCESS,0x000000000004700C,"Ihleniel",0x512,0x0000000000000000,nil,0x80000000,84529,"Seal of Dedication",0x2`)

	msg := advanceOne(t, p)
	sg, ok := msg.(*messages.SpellGo)
	require.True(t, ok, "expected *messages.SpellGo, got %T", msg)

	assert.Equal(t, guid.GUID(0x000000000004700C), sg.Caster)
	// Target should be nil since destGUID is zero.
	assert.Nil(t, sg.Target)
}

func TestParser_UnitDied(t *testing.T) {
	t.Parallel()
	p := newTestParser(t, `1/14 20:41:00.000  UNIT_DIED,0x0000000000000000,nil,0x80000000,0xF1300023890000AD,"Scarshield Legionnaire",0xa48`)

	msg := advanceOne(t, p)
	slain, ok := msg.(*messages.Slain)
	require.True(t, ok, "expected *messages.Slain, got %T", msg)

	assert.Equal(t, guid.GUID(0xF1300023890000AD), slain.Victim)
	assert.Nil(t, slain.Killer)
}

func TestParser_MultiLine(t *testing.T) {
	t.Parallel()
	logData := strings.Join([]string{
		`1/14 20:40:08.214  SWING_DAMAGE,0x000000000005B319,"Anasui",0x10512,0xF1300023890000AD,"Scarshield Legionnaire",0xa48,244,0,1,0,0,0,nil,nil,nil`,
		`1/14 20:40:08.481  SWING_DAMAGE,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,187,0,1,0,0,0,nil,nil,nil`,
		`1/14 20:40:08.481  SPELL_AURA_APPLIED_DOSE,0x00000000000019CA,"Ioser",0x512,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,85080,"Talon Rip",0x1,DEBUFF,2`,
		`1/14 20:40:08.853  SWING_MISSED,0xF1300023890000A9,"Scarshield Legionnaire",0xa48,0x000000000005B319,"Anasui",0x10512,MISS`,
	}, "\n")

	p := newTestParser(t, logData)
	ctx := context.Background()

	var msgTypes []string
	for {
		msgs, err := p.Advance(ctx)
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
		for _, m := range msgs {
			switch m.(type) {
			case *messages.Unit, *messages.Combatant:
				continue // Skip synthetic unit/combatant info messages
			case *messages.Damage:
				msgTypes = append(msgTypes, "Damage")
			case *messages.Aura:
				msgTypes = append(msgTypes, "Aura")
			default:
				msgTypes = append(msgTypes, fmt.Sprintf("%T", m))
			}
		}
	}

	assert.Equal(t, []string{"Damage", "Damage", "Aura", "Damage"}, msgTypes)
}
