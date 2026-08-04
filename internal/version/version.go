package version

var (
	GitTag    = "unknown"
	GitCommit = "unknown"
	BuildTime = "unknown"
)

// ExactParserVersion returns the full version string used to stamp parsed
// instances: GitTag + "+" + GitCommit.
func ExactParserVersion() string {
	return GitTag + "+" + GitCommit
}
