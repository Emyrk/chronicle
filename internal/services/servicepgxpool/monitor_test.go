package servicepgxpool

import "testing"

func TestShouldResetPool(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		failures int
		want     bool
	}{
		{name: "none", failures: 0, want: false},
		{name: "first", failures: 1, want: false},
		{name: "before threshold", failures: postgresResetAfterFailures - 1, want: false},
		{name: "at threshold", failures: postgresResetAfterFailures, want: true},
		{name: "after threshold", failures: postgresResetAfterFailures + 1, want: false},
		{name: "next threshold", failures: postgresResetAfterFailures * 2, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := shouldResetPool(tt.failures); got != tt.want {
				t.Fatalf("shouldResetPool(%d) = %t, want %t", tt.failures, got, tt.want)
			}
		})
	}
}
