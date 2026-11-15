package version

import (
	"crypto/sha256"
	"fmt"
	"os"
	"regexp"
	"strings"
)

const parserDevelopmentIdentityPrefix = "dev-sha256:"
const ParserDevelopmentIdentityEnv = "CHRONICLE_PARSER_DEV_IDENTITY"

var parserDevelopmentLabel = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)

// ParserCompatibilityIdentity defaults to the true executable identity. An
// explicit development label permits independently built local processes to
// cooperate, without changing BinaryIdentity or silently weakening production.
// Labels are nonsecret, but are neither returned nor included in errors.
func ParserCompatibilityIdentity() (string, error) {
	return parserCompatibilityIdentity(os.Getenv(ParserDevelopmentIdentityEnv), BinaryIdentity)
}

func parserCompatibilityIdentity(label string, exact func() (string, error)) (string, error) {
	if label == "" {
		return exact()
	}
	if !parserDevelopmentLabel.MatchString(label) {
		return "", fmt.Errorf("invalid %s: expected 1-64 ASCII letters, digits, dots, underscores or hyphens, starting with a letter or digit", ParserDevelopmentIdentityEnv)
	}
	return fmt.Sprintf("%s%x", parserDevelopmentIdentityPrefix, sha256.Sum256([]byte(label))), nil
}

// IsParserDevelopmentIdentity reports the visibly typed override namespace.
// Identity validation and exact equality remain the caller's responsibility.
func IsParserDevelopmentIdentity(identity string) bool {
	return strings.HasPrefix(identity, parserDevelopmentIdentityPrefix)
}
