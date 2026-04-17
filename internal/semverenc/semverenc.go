package semverenc

import (
	"strconv"
	"strings"

	"golang.org/x/mod/semver"
)

const (
	// MajorScale is the multiplier for the major version component.
	MajorScale int64 = 100 * MinorScale
	// MinorScale is the multiplier for the minor version component.
	MinorScale int64 = 1_000 * PatchScale
	// PatchScale is the multiplier for the patch version component.
	PatchScale int64 = 10_000
)

// Encode normalizes a semver string to a comparable int64.
// Format: major * MajorScale + minor * MinorScale + patch * PatchScale.
// Uses golang.org/x/mod/semver for canonical parsing.
// Handles: "v0.0.425", "0.25", "v0.0.425+commit", "v1.2.3-pre".
// Returns 0 for empty or invalid input.
func Encode(v string) int64 {
	if v == "" {
		return 0
	}
	// Normalize: ensure "v" prefix, strip build metadata after "+"
	if !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	if i := strings.IndexByte(v, '+'); i >= 0 {
		v = v[:i]
	}
	// Pad missing components: "v0.25" → "v0.25.0"
	if strings.Count(v, ".") == 1 {
		v = v + ".0"
	}
	if !semver.IsValid(v) {
		return 0
	}
	// Strip prerelease: semver.Prerelease returns "-beta" etc.
	if pre := semver.Prerelease(v); pre != "" {
		v = strings.TrimSuffix(v, pre)
	}
	canon := semver.Canonical(v)
	// Parse the three components from canonical form "vX.Y.Z"
	parts := strings.SplitN(strings.TrimPrefix(canon, "v"), ".", 3)
	major, _ := strconv.ParseInt(parts[0], 10, 64)
	minor, _ := strconv.ParseInt(parts[1], 10, 64)
	patch, _ := strconv.ParseInt(parts[2], 10, 64)
	return major*MajorScale + minor*MinorScale + patch*PatchScale
}
