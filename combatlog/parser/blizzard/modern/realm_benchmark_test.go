package modern

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/database"
)

func BenchmarkForeverRealmParser(b *testing.B) {
	for _, advanced := range []bool{false, true} {
		b.Run(fmt.Sprintf("advanced=%t", advanced), func(b *testing.B) {
			var input strings.Builder
			input.WriteString("10/7/2026 22:00:00.000  COMBAT_LOG_VERSION,22,ADVANCED_LOG_ENABLED,1,BUILD_VERSION,1.60.1,PROJECT_ID,18\n")
			const events = 1000
			for i := 0; i < events; i++ {
				fmt.Fprintf(&input, "10/7/2026 22:00:%02d.%03d  SPELL_CAST_SUCCESS,Player-4618-00C7EC79,\"First-Last-Normal-US\",0x518,0x80000000,Player-4618-00C7EC79,\"Other-Name-Normal-EU\",0x518,0x80000000,686,\"Shadow Bolt\",0x20", i/1000, i%1000)
				if advanced {
					input.WriteString(",Player-4618-00C7EC79,0000000000000000,18,42,3,4,20,5,0,0,0,20,40,0,1751.67,1697.84,1420,4.4674,1")
				}
				input.WriteByte('\n')
			}
			raw := input.String()
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			b.ReportAllocs()
			b.SetBytes(int64(len(raw)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				p, err := New(context.Background(), logger, strings.NewReader(raw), hermesProxyTestDB{}, hermesProxyTestDB{}, nil, database.LogFormatV22Cleu)
				if err != nil {
					b.Fatal(err)
				}
				casts := 0
				for {
					batch, err := p.Advance(context.Background())
					if err == io.EOF {
						break
					}
					if err != nil {
						b.Fatal(err)
					}
					for _, m := range batch {
						switch m.(type) {
						case *messages.SpellGo:
							casts++
						}
					}
				}
				if casts != events {
					b.Fatalf("casts=%d", casts)
				}
			}
		})
	}
}
