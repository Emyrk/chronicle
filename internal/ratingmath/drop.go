// Package ratingmath contains versionable building blocks for Chronicle ratings.
package ratingmath

// DropCount is the number of lowest eligible boss kills excluded from Form and
// Floor. All kills still count as evidence. At five kills, exclude the
// lowest one; thereafter exclude floor(20% * n) kills.
func DropCount(n int) int {
	if n < 5 {
		return 0
	}
	return n / 5
}
