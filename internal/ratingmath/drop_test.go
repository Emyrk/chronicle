package ratingmath

import "testing"

func TestDropCount(t *testing.T) {
	t.Parallel()

	cases := []struct {
		kills int
		want  int
	}{
		{-1, 0}, {0, 0}, {1, 0}, {4, 0}, {5, 1},
		{6, 1}, {9, 1}, {10, 2}, {14, 2},
		{15, 3}, {19, 3}, {20, 4}, {24, 4}, {25, 5},
	}
	for _, tc := range cases {
		if got := DropCount(tc.kills); got != tc.want {
			t.Errorf("DropCount(%d) = %d; want %d", tc.kills, got, tc.want)
		}
	}
}
