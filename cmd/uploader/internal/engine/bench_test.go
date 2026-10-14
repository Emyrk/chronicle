package engine_test

import (
	"context"
	"testing"
	"time"
)

// BenchmarkStep is one idle poll with WoW running and a log that does not grow.
func BenchmarkStep(b *testing.B) {
	h := newHarness(b)
	ctx := context.Background()
	t0 := time.Now()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		h.e.Step(ctx, t0.Add(time.Duration(i)*5*time.Second), false)
	}
}
