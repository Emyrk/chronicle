// Package ratingmath contains versionable building blocks for Chronicle ratings.
package ratingmath

// DropCount is the number of lowest eligible boss kills excluded from Form and
// Floor. All kills still count as evidence. The first five kills are retained;
// from six onward the lowest floor(20% * n) kills can be excluded.
func DropCount(n int) int {
	if n < 6 {
		return 0
	}
	return n / 5
}
