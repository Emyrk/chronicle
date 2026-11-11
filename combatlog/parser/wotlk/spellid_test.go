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
