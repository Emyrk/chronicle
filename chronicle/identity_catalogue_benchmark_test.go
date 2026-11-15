package chronicle

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"testing"

	"github.com/Emyrk/chronicle/combatlog/parser/common/identitycatalog"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/registry"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/vanilla"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/gamedb/chrondbc"
	"github.com/stretchr/testify/require"
)

type catalogueBenchmarkSpells struct{}

func (catalogueBenchmarkSpells) Spell(_ context.Context, id chrondbc.SpellID) (*chrondbc.Spell, error) {
	s := chrondbc.UnknownSpell(id)
	return &s, nil
}

// Measures collector cost only: decode the checked-in Capybara melee fixture
// outside the timed loop, then collect a fresh complete catalogue per iteration.
func BenchmarkIdentityCatalogueRealFixture(b *testing.B) {
	data, err := os.ReadFile("../combatlog/parsernext/vanilla/testdata/capybara-melee.log")
	require.NoError(b, err)
	decoder := next.NewDecoder(catalogueBenchmarkSpells{}, "benchmark", next.DecoderOptions{})
	source, err := next.NewSource(bytes.NewReader(data), 1024*1024, decoder)
	require.NoError(b, err)
	var events []messages.Message
	for {
		batch, err := source.Advance(b.Context())
		events = append(events, batch...)
		if errors.Is(err, io.EOF) {
			break
		}
		require.NoError(b, err)
	}
	require.NotEmpty(b, events)
	reg := registry.RegistryForFlavor(slog.New(slog.NewTextHandler(io.Discard, nil)), database.ServerFlavor("turtle", database.FlavorVanilla))
	expected := identitycatalog.New(reg)
	for _, m := range events {
		require.NoError(b, expected.Process(m))
	}
	count := len(expected.Records())
	for _, fresh := range []bool{true, false} {
		name := "steady"
		if fresh {
			name = "new-catalogue"
		}
		b.Run(name, func(b *testing.B) {
			collector := identitycatalog.New(reg)
			b.ReportAllocs()
			b.SetBytes(int64(len(data)))
			b.ResetTimer()
			for range b.N {
				if fresh {
					collector = identitycatalog.New(reg)
				}
				for _, m := range events {
					if err := collector.Process(m); err != nil {
						b.Fatal(err)
					}
				}
			}
			b.ReportMetric(float64(len(events)), "events/op")
			b.ReportMetric(float64(count), "GUIDs/op")
		})
	}
}
