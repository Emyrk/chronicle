package azerothcore

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parsectx"
	"github.com/Emyrk/chronicle/combatlog/parser/common/parseerrors"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func nextContext() context.Context {
	return parsectx.With(context.Background(), parsectx.Context{Format: database.LogFormatAzerothcoreMod, Flavor: database.WoWFlavor{database.FlavorWrath}})
}

func TestNextSourceLegacyParity(t *testing.T) {
	t.Parallel()
	const heal = `3000  SPELL_HEAL,0x0000000000000001,"Paladin",0x400,0x0000000000000002,"Attacker",0x400,20267,"Judgement of Light",0x2,61,0,0,nil`
	for _, tc := range []struct{ name, raw string }{
		{"records and synthetics", strings.Join([]string{`3000  CHRONICLE_HEADER,"Realm","3.3.5a",12340`, `3000  CHRONICLE_ZONE_INFO,"Dungeon",209,1,"party"`, heal, `3000  CHRONICLE_UNIT_DESPAWN,0xF130002C36000022`, "", `3000  CHRONICLE_LOOT_MONEY,"Player",12500`}, "\r\n")},
		{"malformed", strings.Join([]string{"bad", "invalid  EVENT", "3000  ", "3000  CHRONICLE_UNIT_INFO,bad", "3000  CHRONICLE_ZONE_INFO", "3000  UNKNOWN_EVENT,a,b", heal}, "\n")},
		{"ordering", strings.Join([]string{"3000  CHRONICLE_LOOT_MONEY", "2000  CHRONICLE_LOOT_MONEY", "1999  CHRONICLE_LOOT_MONEY"}, "\n")},
		{"watermark after malformed", strings.Join([]string{"3000  CHRONICLE_UNIT_INFO,bad", "1999  CHRONICLE_LOOT_MONEY"}, "\n")},
		{"companion zone", `3000  SPELL_CAST_FAILED,0x0000000000000001,"Player",0x400,0x0000000000000001,"Player",0x400,1,"Spell",0x1,"[3Z:Dalaran,none,0,,0,0,0,571,0,]"`},
		{"companion split", "3000  SPELL_CAST_FAILED,0x0000000000000001,Player,0x400,0x0000000000000001,Player,0x400,1,Spell,0x1,\"[3Z:Dalaran,none,0,,0,0,0,\"\n3000  SPELL_CAST_FAILED,0x0000000000000001,Player,0x400,0x0000000000000001,Player,0x400,1,Spell,0x1,\"~571,0,]\""},
		{"oversize scanner token", strings.Repeat("x", 65536)},

		{"companion", `3000  SPELL_CAST_FAILED,0x0000000000000001,"Player",0x400,0x0000000000000001,"Player",0x400,1,"Spell",0x1,"not a companion payload"`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			ctx := nextContext()
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			old, err := New(ctx, logger, strings.NewReader(tc.raw), auraSpellDB{}, nil)
			require.NoError(t, err)
			next, err := NewNext(ctx, logger, strings.NewReader(tc.raw), auraSpellDB{}, nil)
			require.NoError(t, err)
			for i := 0; i < strings.Count(tc.raw, "\n")+2; i++ {
				want, wantErr := old.Advance(ctx)
				got, gotErr := next.Advance(ctx)
				require.Equal(t, want, got, "record %d", i)
				if wantErr == nil {
					require.NoError(t, gotErr)
				} else {
					require.EqualError(t, gotErr, wantErr.Error())
				}
				require.Equal(t, old.Metrics().TotalLinesParsed, next.Metrics().TotalLinesParsed)
				require.Equal(t, old.DetailedTimes(), next.DetailedTimes())
				if wantErr == io.EOF || parseerrors.IsFatalError(wantErr) {
					break
				}
			}
		})
	}
}

type sourceErrorReader struct{ data string }

func (r *sourceErrorReader) Read(p []byte) (int, error) {
	n := copy(p, r.data)
	r.data = r.data[n:]
	return n, errors.New("fixture read failure")
}

func TestNextSourceScannerFailure(t *testing.T) {
	t.Parallel()
	for _, raw := range []string{"", "3000  CHRONICLE_LOOT_MONEY", "3000  CHRONICLE_LOOT_MONEY\n"} {
		ctx := nextContext()
		old, err := New(ctx, slog.Default(), &sourceErrorReader{data: raw}, stubSpellDB{}, nil)
		require.NoError(t, err)
		next, err := NewNext(ctx, slog.Default(), &sourceErrorReader{data: raw}, stubSpellDB{}, nil)
		require.NoError(t, err)
		for i := 0; i < 3; i++ {
			want, wantErr := old.Advance(ctx)
			got, gotErr := next.Advance(ctx)
			require.Equal(t, want, got)
			if wantErr == nil {
				require.NoError(t, gotErr)
			} else {
				require.EqualError(t, gotErr, wantErr.Error())
				require.True(t, parseerrors.IsFatalError(gotErr))
			}
		}
	}
}

func TestNextSourceRequiresContextAndRunsSynthetics(t *testing.T) {
	t.Parallel()
	_, err := NewNext(context.Background(), nil, strings.NewReader(""), stubSpellDB{}, nil)
	require.Error(t, err)
	line := `3000  SPELL_HEAL,0x0000000000000001,"Paladin",0x400,0x0000000000000002,"Attacker",0x400,20267,"Judgement of Light",0x2,61,0,0,nil`
	next, err := NewNext(nextContext(), nil, strings.NewReader(line), auraSpellDB{}, nil)
	require.NoError(t, err)
	msgs, err := next.Advance(nextContext())
	require.NoError(t, err)
	require.Len(t, msgs, 1)
	heal := msgs[0].(*messages.Heal)
	require.Equal(t, heal.Target, heal.Caster)
}
