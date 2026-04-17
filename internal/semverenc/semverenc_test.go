package semverenc_test

import (
	"testing"

	"github.com/Emyrk/chronicle/internal/semverenc"
)

func TestEncode(t *testing.T) {
	t.Parallel()
	tests := []struct {
		input string
		want  int64
	}{
		// Empty / invalid
		{"", 0},
		{"garbage", 0},

		// Standard semver
		{"v1.2.3", semverenc.MajorScale + 2*semverenc.MinorScale + 3*semverenc.PatchScale},
		{"v0.0.425", 425 * semverenc.PatchScale},
		{"v0.0.1", semverenc.PatchScale},
		{"v1.0.0", semverenc.MajorScale},

		// Without v prefix
		{"1.2.3", semverenc.MajorScale + 2*semverenc.MinorScale + 3*semverenc.PatchScale},
		{"0.0.425", 425 * semverenc.PatchScale},

		// Two-component (minor only, e.g. addon "0.25")
		{"0.25", 25 * semverenc.MinorScale},
		{"v0.25", 25 * semverenc.MinorScale},

		// Build metadata stripped
		{"v0.0.425+v0.0.424-3-g01bbe66c", 425 * semverenc.PatchScale},
		{"v0.0.425+anything", 425 * semverenc.PatchScale},

		// Prerelease stripped by Canonical
		{"v1.2.3-beta", semverenc.MajorScale + 2*semverenc.MinorScale + 3*semverenc.PatchScale},

		// Ordering: higher versions produce higher numbers
		{"v0.0.1", semverenc.PatchScale},
		{"v0.0.2", 2 * semverenc.PatchScale},
		{"v0.1.0", semverenc.MinorScale},
		{"v1.0.0", semverenc.MajorScale},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			t.Parallel()
			got := semverenc.Encode(tt.input)
			if got != tt.want {
				t.Errorf("Encode(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestEncodeOrdering(t *testing.T) {
	t.Parallel()
	// Verify that encoding preserves ordering
	pairs := [][2]string{
		{"v0.0.1", "v0.0.2"},
		{"v0.0.99", "v0.1.0"},
		{"v0.99.0", "v1.0.0"},
		{"v0.0.425", "v0.0.426"},
		{"0.24", "0.25"},
	}
	for _, p := range pairs {
		a := semverenc.Encode(p[0])
		b := semverenc.Encode(p[1])
		if a >= b {
			t.Errorf("Encode(%q)=%d should be < Encode(%q)=%d", p[0], a, p[1], b)
		}
	}
}
