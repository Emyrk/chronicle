package cli

import (
	"github.com/Emyrk/chronicle/internal/version"
	"log/slog"
)

// Called once per command startup, never from the compatibility polling path.
func parserStartupIdentity(logger *slog.Logger) (string, error) {
	identity, err := version.ParserCompatibilityIdentity()
	if err != nil {
		return "", err
	}
	if version.IsParserDevelopmentIdentity(identity) {
		logger.Warn("DEVELOPMENT parser compatibility override enabled; executable equality is not enforced; do not use in production", "compatibility_identity", identity)
	}
	return identity, nil
}
