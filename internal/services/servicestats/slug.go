package servicestats

import "strings"

// InstanceSlug is the URL segment for an instance name, shared by every page
// family that puts an instance in its path (`/stats/{instance}/speedruns`,
// `/stats/{instance}/{boss}`): lowercase, with each run of characters other than
// [a-z0-9] replaced by one "-", and no leading or trailing "-". "Molten Core" is
// "molten-core", "Onyxia's Lair" is "onyxia-s-lair", "Zul'Gurub" is "zul-gurub".
// It is a pure function of the name, so producers and links agree without a
// lookup. Unlike a hyphen-for-space rule it never leaves characters that the
// slug pattern (see PageKey) rejects. A name with nothing to keep returns "".
func InstanceSlug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			dash = false
			b.WriteRune(r)
			continue
		}
		dash = true
	}
	return b.String()
}

// InstanceCategory is the namespace an instance's /stats pages live under:
// raids and dungeons are separate trees, so an instance name never competes
// with the fixed pages (/stats/methodology, /stats/census, ...) for a URL.
type InstanceCategory string

const (
	CategoryRaids    InstanceCategory = "raids"
	CategoryDungeons InstanceCategory = "dungeons"
)

// Valid reports whether c is one of the two categories.
func (c InstanceCategory) Valid() bool { return c == CategoryRaids || c == CategoryDungeons }

// CategoryFromDB maps a log_instances.category value ("raid", "dungeon", the
// column the tenant threshold also reads) to its namespace. Any other value,
// including none, has no /stats pages.
func CategoryFromDB(category string) (InstanceCategory, bool) {
	switch category {
	case "raid":
		return CategoryRaids, true
	case "dungeon":
		return CategoryDungeons, true
	}
	return "", false
}

// The URL scheme for every instance page, built only with these helpers:
//
//	/stats/{raids|dungeons}/{instance}             the instance page
//	/stats/{raids|dungeons}/{instance}/speedruns   fastest clears
//	/stats/{raids|dungeons}/{instance}/{boss}      one boss
//
// The instance and boss arguments are slugs (see InstanceSlug), not names.
// Each returns "" for an invalid category or an empty or malformed slug, so a
// bad input never becomes a link to a URL no family serves. A literal segment
// beats a {parameter} when families overlap, so the speedruns pages win over
// the boss pages and a boss can never be named "speedruns".

// InstancePath is the instance's page, e.g. "/stats/raids/molten-core".
func InstancePath(category InstanceCategory, instanceSlug string) string {
	if !category.Valid() || !slugPattern.MatchString(instanceSlug) {
		return ""
	}
	return "/stats/" + string(category) + "/" + instanceSlug
}

// SpeedrunsPath is the instance's fastest-clears page, e.g.
// "/stats/raids/molten-core/speedruns".
func SpeedrunsPath(category InstanceCategory, instanceSlug string) string {
	instance := InstancePath(category, instanceSlug)
	if instance == "" {
		return ""
	}
	return instance + "/speedruns"
}

// BossPath is one boss's page, e.g. "/stats/raids/molten-core/ragnaros".
// "speedruns" is not a valid boss slug: that URL is the fastest-clears page.
func BossPath(category InstanceCategory, instanceSlug, bossSlug string) string {
	instance := InstancePath(category, instanceSlug)
	if instance == "" || !slugPattern.MatchString(bossSlug) || bossSlug == "speedruns" {
		return ""
	}
	return instance + "/" + bossSlug
}
