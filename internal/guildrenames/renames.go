package guildrenames

import "time"

// Rename describes a realm-scoped guild rename that applies to logs before a
// fixed cutoff. Keep this list small and remove entries once guild identity is
// modeled directly in the database.
type Rename struct {
	Realm  string
	From   string
	To     string
	Before time.Time
}

var renames = []Rename{
	{
		Realm:  "N'Zoth",
		From:   "Levia",
		To:     "Remnant",
		Before: time.Date(2026, time.August, 26, 0, 0, 0, 0, time.UTC),
	},
}

// Resolve returns the canonical guild name for a log from the given realm and
// time. Rules are exact and case-sensitive to avoid rewriting unrelated guilds.
func Resolve(realm string, logTime time.Time, name string) string {
	for _, rename := range renames {
		if realm == rename.Realm && name == rename.From && logTime.Before(rename.Before) {
			return rename.To
		}
	}
	return name
}
