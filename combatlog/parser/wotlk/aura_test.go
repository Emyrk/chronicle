package wotlk

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types"
	"github.com/Emyrk/chronicle/combatlog/parser/types/combatant"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc/dbcmem"
	"github.com/Emyrk/chronicle/database/gamedb/talents"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type auraTestDB struct{}

func (auraTestDB) ResolveGear([]combatant.GearItem)                       {}
func (auraTestDB) Creature(int32) (*database.WorldCreatureTemplate, bool) { return nil, false }
func (auraTestDB) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	return &chrondbc.Spell{ID: id, Duration: dbcmem.SpellDuration{MaxDuration: 30_000}}, nil
}
func (auraTestDB) SpellsByName(context.Context, string) ([]*chrondbc.Spell, error) {
	return nil, fmt.Errorf("not implemented")
}
func (auraTestDB) TalentTrees(context.Context, uuid.UUID) (*talents.TalentTreeData, error) {
	return nil, fmt.Errorf("not implemented")
}
func (auraTestDB) ExtraAttackSpell(context.Context, int32) (dbcmem.ExtraAttackSpell, bool) {
	return dbcmem.ExtraAttackSpell{}, false
}
func (auraTestDB) DurationModifiers(context.Context) (*chrondbc.DurationModifierSet, error) {
	return nil, nil
}
func (auraTestDB) PeriodicSpells(context.Context) (map[int32]dbcmem.PeriodicSpell, error) {
	return nil, nil
}

func TestAuraTransitions(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		event      string
		suffix     string
		state      types.AuraState
		transition messages.AuraTransition
		stacks     int32
		auraCasts  int
	}{
		{name: "applied", event: "SPELL_AURA_APPLIED", suffix: "DEBUFF", state: types.AuraStateAdded, transition: messages.AuraTransitionApplied, stacks: 1, auraCasts: 1},
		{name: "refresh", event: "SPELL_AURA_REFRESH", suffix: "DEBUFF", state: types.AuraStateModified, transition: messages.AuraTransitionRefreshed, stacks: 1},
		{name: "applied dose", event: "SPELL_AURA_APPLIED_DOSE", suffix: "DEBUFF,2", state: types.AuraStateModified, transition: messages.AuraTransitionStackChanged, stacks: 2},
		{name: "removed dose", event: "SPELL_AURA_REMOVED_DOSE", suffix: "DEBUFF,1", state: types.AuraStateModified, transition: messages.AuraTransitionStackChanged, stacks: 1},
		{name: "removed", event: "SPELL_AURA_REMOVED", suffix: "DEBUFF", state: types.AuraStateRemoved, transition: messages.AuraTransitionRemoved, stacks: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			line := fmt.Sprintf("1/14 20:40:08.481  %s,0x00000000000019CA,\"Ioser\",0x512,0xF1300023890000A9,\"Scarshield Legionnaire\",0xa48,85080,\"Talon Rip\",0x1,%s", tt.event, tt.suffix)
			p, err := New(context.Background(), slog.Default(), strings.NewReader(line), auraTestDB{}, auraTestDB{}, nil)
			require.NoError(t, err)
			msgs, err := p.Advance(context.Background())
			require.NoError(t, err)

			var aura *messages.Aura
			var auraCasts int
			for _, msg := range msgs {
				switch typed := msg.(type) {
				case *messages.Aura:
					aura = typed
				case *messages.AuraCast:
					auraCasts++
				}
			}
			require.NotNil(t, aura)
			assert.Equal(t, tt.state, aura.State)
			assert.Equal(t, tt.transition, aura.Transition)
			assert.Equal(t, tt.stacks, aura.Amount)
			assert.Equal(t, tt.auraCasts, auraCasts)
		})
	}
}
