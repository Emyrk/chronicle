package period

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/stretchr/testify/require"
)

func TestPeriodMarshal(t *testing.T) {
	t.Parallel()

	msg := messages.Message(&messages.Damage{
		Amount: 10,
	})

	data, err := json.Marshal(msg)
	require.NoError(t, err)
	fmt.Println(string(data))
}

var benchmarkPeriodActive bool

func BenchmarkPeriodCollectorIsActive(b *testing.B) {
	collector := PeriodCollector[*InactivityPeriod]{}
	collector.Start(NewInactivityPeriod(1, time.Minute), "benchmark", &messages.Damage{})

	b.ResetTimer()
	for range b.N {
		benchmarkPeriodActive = collector.IsActive()
	}
}
