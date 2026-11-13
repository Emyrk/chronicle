package serviceeventrepair

import (
	"github.com/Emyrk/chronicle/database"
	"golang.org/x/mod/semver"
	"strings"
)

// ExactParserVersion persists GitTag+GitCommit. Build metadata does not change
// release ordering; prereleases/git descriptions cannot prove the rule boundary.
func parserRelease(version string) string {
	v := version
	if !strings.HasPrefix(v, "v") {
		v = "v" + v
	}
	if !semver.IsValid(v) || semver.Prerelease(v) != "" {
		return ""
	}
	release := strings.TrimSuffix(v, semver.Build(v))
	if semver.Canonical(v) != release || strings.Count(release, ".") != 2 {
		return ""
	}
	return release
}

func parserVersionBefore(instance database.LogInstance, cutoff string) (string, bool) {
	exact := instance.ParserVersion
	tag, hasTag := instance.Versions["chronicle"]
	// The schema's historical placeholder is not contradictory release evidence.
	// Use the parser's persisted GitTag when no exact stamp was recorded.
	if (exact == "" || exact == "0.0") && hasTag {
		exact = tag
	}
	release := parserRelease(exact)
	if release == "" || (hasTag && parserRelease(tag) != release) {
		return exact, false
	}
	return exact, semver.Compare(release, cutoff) < 0
}
