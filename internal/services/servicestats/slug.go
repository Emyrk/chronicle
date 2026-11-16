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
