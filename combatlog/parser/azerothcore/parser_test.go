package azerothcore

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/consumers"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/encounters"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
)

var _ gamedb.GameDB = (*stubSpellDB)(nil)

type stubSpellDB struct{}

func (stubSpellDB) ResolveGear([]combatant.GearItem)                       {}
func (stubSpellDB) Creature(int32) (*database.WorldCreatureTemplate, bool) { return nil, false }
func (stubSpellDB) Spell(_ context.Context, _ chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, fmt.Errorf("no spell database loaded")
}
func (stubSpellDB) SpellsByName(_ context.Context, _ string) ([]*chrondbc.Spell, error) {
	return nil, fmt.Errorf("no spell database loaded")
}
func (stubSpellDB) TalentTrees(_ context.Context, _ uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, fmt.Errorf("no talent database loaded")
}
func (stubSpellDB) ExtraAttackSpell(_ context.Context, _ int32) (dbcmem.ExtraAttackSpell, bool) {
	return dbcmem.ExtraAttackSpell{}, false
}
func (stubSpellDB) DurationModifiers(_ context.Context) (*chrondbc.DurationModifierSet, error) {
	return nil, nil
}
func (stubSpellDB) PeriodicSpells(_ context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return nil, nil
}

func newTestParser(t *testing.T, logData string) *Parser {
	t.Helper()
	p, err := New(context.Background(), slog.Default(), strings.NewReader(logData), stubSpellDB{}, nil)
	require.NoError(t, err)
	return p
}

func creatureGUID(entry uint32, seed uint32) guid.GUID {
	return guid.GUID(0xF130000000000000 | uint64(entry&0xFFFFFF)<<24 | uint64(seed&0xFFFFFF))
}

// advanceOne calls Advance and returns the first non-Unit/non-Combatant message.
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

func advanceNonUnitMessages(t *testing.T, p *Parser) []messages.Message {
	t.Helper()
	msgs, err := p.Advance(context.Background())
	require.NoError(t, err)

	result := make([]messages.Message, 0, len(msgs))
	for _, m := range msgs {
		switch m.(type) {
		case *messages.Unit, *messages.Combatant:
			continue
		}
		result = append(result, m)
	}
	return result
}

func TestParseSpellAbsorbed_Melee(t *testing.T) {
	t.Parallel()
	// Melee variant: no damage spell prefix (PW:S absorbs a melee hit).
	line := `1777166257180  SPELL_ABSORBED,0xF130002C36000022,"Ragefire Trogg",0x0,0x0000000000000001,"Chronicle",0x0,0x0000000000000001,"Chronicle",0x400,10901,"Power Word: Shield",0x2,11`

	p := newTestParser(t, line)
	msgs := advanceNonUnitMessages(t, p)
	require.Len(t, msgs, 2)

	damage, ok := msgs[0].(*messages.Damage)
	require.True(t, ok, "expected *messages.Damage, got %T", msgs[0])
	assert.True(t, damage.IsSynthetic())
	assert.Equal(t, int32(0), damage.Amount)
	assert.Equal(t, types.HitTypeFullAbsorb, damage.HitType)
	assert.Equal(t, types.PhysicalSchool, damage.School)
	require.Len(t, damage.Trailer, 1)
	require.NotNil(t, damage.Trailer[0].Amount)
	assert.Equal(t, uint32(11), *damage.Trailer[0].Amount)
	assert.Equal(t, types.HitTypeFullAbsorb, damage.Trailer[0].HitType)

	sa, ok := msgs[1].(*messages.Absorbed)
	require.True(t, ok, "expected *messages.Absorbed, got %T", msgs[1])

	assert.Equal(t, guid.GUID(0xF130002C36000022), sa.Attacker)
	assert.Equal(t, guid.GUID(0x0000000000000001), sa.Target)
	assert.Nil(t, sa.DamageSpell, "melee absorbed should have nil DamageSpell")
	assert.Equal(t, guid.GUID(0x0000000000000001), sa.Caster)
	// Spell lookup returns nil from stub, but ID was parsed correctly.
	assert.Nil(t, sa.AbsorbSpell)
	assert.Equal(t, types.School(0x2), sa.AbsorbSchool) // Holy
	assert.Equal(t, int32(11), sa.Amount)
}

func TestParseSpellAbsorbed_Spell(t *testing.T) {
	t.Parallel()
	// Spell variant: includes damage spell prefix (PW:S absorbs a Fireball).
	line := `1777166257180  SPELL_ABSORBED,0xF130002C36000022,"Ragefire Trogg",0x0,0x0000000000000001,"Chronicle",0x0,12345,"Fireball",0x4,0x0000000000000001,"Chronicle",0x400,10901,"Power Word: Shield",0x2,50`

	p := newTestParser(t, line)
	msgs := advanceNonUnitMessages(t, p)
	require.Len(t, msgs, 2)

	damage, ok := msgs[0].(*messages.Damage)
	require.True(t, ok, "expected *messages.Damage, got %T", msgs[0])
	assert.True(t, damage.IsSynthetic())
	assert.Equal(t, int32(0), damage.Amount)
	assert.Equal(t, types.HitTypeFullAbsorb, damage.HitType)
	assert.Equal(t, types.School(0x4), damage.School)
	require.NotNil(t, damage.SpellName)
	assert.Equal(t, "Fireball", *damage.SpellName)
	require.Len(t, damage.Trailer, 1)
	require.NotNil(t, damage.Trailer[0].Amount)
	assert.Equal(t, uint32(50), *damage.Trailer[0].Amount)
	assert.Equal(t, types.HitTypeFullAbsorb, damage.Trailer[0].HitType)

	sa, ok := msgs[1].(*messages.Absorbed)
	require.True(t, ok, "expected *messages.Absorbed, got %T", msgs[1])

	assert.Equal(t, guid.GUID(0xF130002C36000022), sa.Attacker)
	assert.Equal(t, guid.GUID(0x0000000000000001), sa.Target)
	// Spell lookup returns nil from stub, but the spell variant was detected.
	assert.Nil(t, sa.DamageSpell)
	assert.Equal(t, guid.GUID(0x0000000000000001), sa.Caster)
	assert.Nil(t, sa.AbsorbSpell)
	assert.Equal(t, types.School(0x2), sa.AbsorbSchool) // Holy
	assert.Equal(t, int32(50), sa.Amount)
}

func TestParseSpellInterrupt(t *testing.T) {
	t.Parallel()
	// Kick (spell 1766) interrupts Healing Wave (spell 331).
	line := `1777228582945  SPELL_INTERRUPT,0x0000000000000001,"Chronicle",0x400,0xF130002C36000022,"Ragefire Trogg",0x0,1766,"Kick",0x1,331,"Healing Wave",0x8`

	p := newTestParser(t, line)
	msg := advanceOne(t, p)

	ir, ok := msg.(*messages.Interrupt)
	require.True(t, ok, "expected *messages.Interrupt, got %T", msg)

	assert.Equal(t, guid.GUID(0x0000000000000001), ir.Caster)
	assert.Equal(t, guid.GUID(0xF130002C36000022), ir.Target)
	assert.Equal(t, "Healing Wave", ir.SpellName)
	assert.Equal(t, int32(331), ir.ExtraSpellID)
	assert.Equal(t, types.School(0x8), ir.ExtraSchool) // Nature
	// Spell lookups return nil from stub DB.
	assert.Nil(t, ir.InterruptSpell)
	assert.Nil(t, ir.InterruptedSpell)
}

func TestParseSpellPeriodicDrain(t *testing.T) {
	t.Parallel()
	line := `1777228582945  SPELL_PERIODIC_DRAIN,0x0000000000000001,"Chronicle",0x400,0xF130002C36000022,"Ragefire Trogg",0x0,8129,"Mana Burn",0x40,15,0,0`

	p := newTestParser(t, line)
	msg := advanceOne(t, p)

	rc, ok := msg.(*messages.ResourceChange)
	require.True(t, ok, "expected *messages.ResourceChange, got %T", msg)

	assert.Equal(t, guid.GUID(0xF130002C36000022), rc.Target)
	assert.NotNil(t, rc.Caster)
	assert.Equal(t, guid.GUID(0x0000000000000001), *rc.Caster)
	assert.Equal(t, int32(15), rc.Amount)
	assert.Equal(t, types.ResourceMana, rc.Resource)
	assert.Equal(t, types.ChangeDirectionLoss, rc.Direction)
}

func TestParseSpellDispel(t *testing.T) {
	t.Parallel()
	line := `1777228582945  SPELL_DISPEL,0x0000000000000001,"Chronicle",0x400,0xF130002C36000022,"Ragefire Trogg",0x0,527,"Dispel Magic",0x2,331,"Healing Wave",0x8,BUFF`

	p := newTestParser(t, line)
	msg := advanceOne(t, p)

	dispel, ok := msg.(*messages.Dispel)
	require.True(t, ok, "expected *messages.Dispel, got %T", msg)

	assert.Equal(t, guid.GUID(0x0000000000000001), dispel.Caster)
	assert.Equal(t, guid.GUID(0xF130002C36000022), dispel.Target)
}

func TestParseSpellStolen(t *testing.T) {
	t.Parallel()
	line := `1777228582945  SPELL_STOLEN,0x0000000000000001,"Chronicle",0x400,0xF130002C36000022,"Ragefire Trogg",0x0,30449,"Spellsteal",0x10,1459,"Arcane Intellect",0x40,BUFF`

	p := newTestParser(t, line)
	msg := advanceOne(t, p)

	dispel, ok := msg.(*messages.Dispel)
	require.True(t, ok, "expected *messages.Dispel, got %T", msg)

	assert.Equal(t, guid.GUID(0x0000000000000001), dispel.Caster)
	assert.Equal(t, guid.GUID(0xF130002C36000022), dispel.Target)
}

func TestChronicleCustomEventsAreAcceptedAsNoops(t *testing.T) {
	t.Parallel()

	for _, event := range []string{
		`1777340510851  CHRONICLE_SPELL_TARGET_RESULT,0x0000000000000001,"Chronicle",12345,"Test Spell",0x1,"MISS"`,
		`1777340510851  CHRONICLE_LOOT_ITEM,"Chronicle",12345,"Test Item",2`,
		`1777340510851  CHRONICLE_LOOT_MONEY,"Chronicle",12500`,
	} {
		t.Run(event, func(t *testing.T) {
			t.Parallel()
			p := newTestParser(t, event)
			msgs, err := p.Advance(context.Background())
			require.NoError(t, err)
			assert.Empty(t, msgs)
		})
	}
}

func TestMetricsTotalLinesParsed(t *testing.T) {
	t.Parallel()

	p := newTestParser(t, strings.Join([]string{
		`1777340510851  CHRONICLE_HEADER,"","3.3.5a",12340`,
		`1777340510851  CHRONICLE_ZONE_INFO,"Zul'Farrak",209,230,"party"`,
	}, "\n"))

	_, err := p.Advance(context.Background())
	require.NoError(t, err)
	_, err = p.Advance(context.Background())
	require.NoError(t, err)

	require.EqualValues(t, 2, p.Metrics().TotalLinesParsed)
}

func TestZulFarrakBossEncounterRegression(t *testing.T) {
	t.Parallel()

	ctx := parsectx.WithType(context.Background(), database.LogTypeAzerothcoreClientside)
	reg := registry.RegistryForFlavor(slog.Default(), database.WoWFlavor{database.FlavorVanilla, database.FlavorWrath})
	bossGUID := creatureGUID(7272, 1)
	logData := strings.Join([]string{
		`1777340510851  CHRONICLE_HEADER,"","3.3.5a",12340`,
		`1777340510851  CHRONICLE_ZONE_INFO,"Zul'Farrak",209,230,"party"`,
		fmt.Sprintf(`1777340511000  SPELL_DAMAGE,0x0000000000000001,"Chronicle",0x400,0x%016X,"Theka the Martyr",0x0,1,"Test Spell",0x1,10,0,1,0,0,0,nil,nil,nil`, uint64(bossGUID)),
		fmt.Sprintf(`1777340512000  UNIT_DIED,0x0000000000000000,nil,0x80000000,0x%016X,"Theka the Martyr",0xa48`, uint64(bossGUID)),
	}, "\n")

	p, err := New(ctx, slog.Default(), strings.NewReader(logData), stubSpellDB{}, nil)
	require.NoError(t, err)

	output := encounters.New(ctx, slog.Default(), reg)
	c := consumers.New(slog.Default(), output)
	err = c.ConsumeAll(ctx, p)
	require.NoError(t, err)
	require.Len(t, output.Instances, 1)

	result, err := output.Instances[0].Finalize(ctx)
	require.NoError(t, err)
	require.Len(t, result.Encounters, 1)
	require.Equal(t, "Theka the Martyr", result.Encounters[0].Name)
	require.True(t, result.Encounters[0].Boss)
	require.Nil(t, result.UnknownUnits)
	require.EqualValues(t, 4, p.Metrics().TotalLinesParsed)
}
