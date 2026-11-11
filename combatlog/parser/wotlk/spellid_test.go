package wotlk

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
)

type missingSpellTestDB struct {
	auraTestDB
}

func (missingSpellTestDB) Spell(context.Context, chrondbc.SpellID) (*chrondbc.Spell, error) {
	return nil, fmt.Errorf("missing spell")
}

func TestCastMessagesPreserveRawSpellIDWhenLookupFails(t *testing.T) {
	t.Parallel()

	tests := []struct {
		event string
		check func(t *testing.T, msgs []messages.Message)
	}{
		{
			event: "SPELL_CAST_START",
			check: func(t *testing.T, msgs []messages.Message) {
				t.Helper()
				for _, msg := range msgs {
					if cast, ok := msg.(*messages.SpellStart); ok {
						require.Equal(t, chrondbc.SpellID(71189), cast.SpellID)
						require.Nil(t, cast.SpellData)
						return
					}
				}
				require.Fail(t, "SpellStart not emitted")
			},
		},
		{
			event: "SPELL_CAST_SUCCESS",
			check: func(t *testing.T, msgs []messages.Message) {
				t.Helper()
				for _, msg := range msgs {
					if cast, ok := msg.(*messages.SpellGo); ok {
						require.Equal(t, chrondbc.SpellID(71189), cast.SpellID)
						require.Nil(t, cast.SpellData)
						return
					}
				}
				require.Fail(t, "SpellGo not emitted")
			},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.event, func(t *testing.T) {
			t.Parallel()

			line := fmt.Sprintf("11/5 22:27:18.553  %s,0xF130008FB5000323,\"Valithria Dreamwalker\",0x30a18,0x0000000000000000,nil,0x80000000,71189,\"Dreamwalker's Rage\",0x8", tt.event)
			db := missingSpellTestDB{}
			parser, err := New(context.Background(), slog.Default(), strings.NewReader(line), db, db, nil)
			require.NoError(t, err)

			msgs, err := parser.Advance(context.Background())
			require.NoError(t, err)
			tt.check(t, msgs)
		})
	}
}

func TestCombatMessagesPreserveRawSpellIDWhenLookupFails(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		line  string
		check func(t *testing.T, msgs []messages.Message)
	}{
		{
			name: "damage",
			line: "11/5 22:27:21.549  SPELL_DAMAGE,0xF130008FB5000323,\"Valithria Dreamwalker\",0x30a18,0xF1300093EE000324,\"Risen Archmage\",0x10a48,71189,\"Dreamwalker's Rage\",0x8,1000000,999999,8,0,0,0,nil,nil,nil",
			check: func(t *testing.T, msgs []messages.Message) {
				t.Helper()
				for _, msg := range msgs {
					if damage, ok := msg.(*messages.Damage); ok {
						require.Equal(t, chrondbc.SpellID(71189), damage.SpellID)
						require.Nil(t, damage.SpellData)
						return
					}
				}
				require.Fail(t, "Damage not emitted")
			},
		},
		{
			name: "aura",
			line: "11/5 20:21:16.960  SPELL_AURA_REMOVED,0xF130008FF70000D9,\"Lady Deathwhisper\",0x10a48,0xF130008FF70000D9,\"Lady Deathwhisper\",0x10a48,70842,\"Mana Barrier\",0x20,BUFF",
			check: func(t *testing.T, msgs []messages.Message) {
				t.Helper()
				for _, msg := range msgs {
					if aura, ok := msg.(*messages.Aura); ok {
						require.Equal(t, chrondbc.SpellID(70842), aura.SpellID)
						require.Nil(t, aura.SpellData)
						return
					}
				}
				require.Fail(t, "Aura not emitted")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			db := missingSpellTestDB{}
			parser, err := New(context.Background(), slog.Default(), strings.NewReader(tt.line), db, db, nil)
			require.NoError(t, err)
			msgs, err := parser.Advance(context.Background())
			require.NoError(t, err)
			tt.check(t, msgs)
		})
	}
}
