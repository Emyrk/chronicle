package modern

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/database"
	"github.com/stretchr/testify/require"
)

func TestIdentityPreflightMatchesParser(t *testing.T) {
	t.Parallel()
	input := []byte(`10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18
10/7/2026 22:00:02.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-US",0x518,0x80000000,Player-4618-00C7EC79,"Other-Name-Normal-EU",0x518,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:01.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"First-Last-Normal-EU",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:03.000  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,"Missing",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,"Shadow Bolt",0x20
10/7/2026 22:00:04.000  SPELL_ABSORBED,Creature-0-4615-0-10340-267006-0000B3EC43,"Dark Neophyte",0xa28,0x80000000,Player-4620-00D5496D,"Target-Normal-US",0x518,0x80000000,Player-4620-00D5496D,"Caster-Normal-EU",0x518,0x80000000,1310927,"Light's Fury",0x2,4,16,nil
`)
	index, err := PreflightPlayerIdentities(t.Context(), bytes.NewReader(input))
	require.NoError(t, err)
	p, err := New(t.Context(), slog.New(slog.NewTextHandler(io.Discard, nil)), bytes.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
	require.NoError(t, err)
	for {
		_, err = p.Advance(t.Context())
		if err == io.EOF {
			break
		}
		require.NoError(t, err)
	}
	require.Equal(t, p.playerRealms, index.realms)
	require.Equal(t, p.playerNames, index.names)
	raw, ok := index.LookupPlayerRealm(guid.GUID(0x0000120A00C7EC79), "First Last")
	require.True(t, ok)
	require.Equal(t, "Normal-US", raw)
}

func BenchmarkForeverParserPreflightOverhead(b *testing.B) {
	header := []byte("10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18\n")
	line := []byte("10/7/2026 22:00:02.000  SPELL_CAST_SUCCESS,Player-1-00000001,\"Alice-Normal-US\",0x518,0x80000000,0000000000000000,nil,0x80000000,0x80000000,686,\"Shadow Bolt\",0x20\n")
	input := append(header, bytes.Repeat(line, 10000)...)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	for _, preflight := range []bool{false, true} {
		name := "parser_only"
		if preflight {
			name = "preflight_and_parser"
		}
		b.Run(name, func(b *testing.B) {
			b.SetBytes(int64(len(input)))
			b.ReportAllocs()
			for b.Loop() {
				if preflight {
					if _, err := PreflightPlayerIdentities(context.Background(), bytes.NewReader(input)); err != nil {
						b.Fatal(err)
					}
				}
				p, err := New(context.Background(), logger, bytes.NewReader(input), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
				if err != nil {
					b.Fatal(err)
				}
				for {
					_, err = p.Advance(context.Background())
					if err == io.EOF {
						break
					}
					if err != nil {
						b.Fatal(err)
					}
				}
			}
		})
	}
}
