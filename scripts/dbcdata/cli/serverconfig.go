package cli

import (
	"fmt"

	"github.com/coder/serpent"
)

// DefaultClientPath returns the default WoW client directory for a server.
// Returns empty string if unknown (caller should require --dbc).
func DefaultClientPath(server string) string {
	switch server {
	case "turtle":
		return "/home/steven/Games/turtlewow/drive_c/Program Files (x86)/TurtleWoW"
	case "epoch":
		return "/home/steven/Games/ascension-wow/drive_c/Program Files/Ascension Launcher/resources/epoch-live"
	case "kronos":
		return "/home/steven/Games/kronos-wow/drive_c/Program Files (x86)/Kronos"
	case "warmane":
		return "/home/steven/Games/Warmane"
	case "ascension":
		return "/home/steven/Games/ascension-wow/drive_c/Program Files/Ascension Launcher/resources/ascension-live"
	default:
		return ""
	}
}

// ServerOption returns a serpent.Option for the --server flag.
func ServerOption(dst *string) serpent.Option {
	return serpent.Option{
		Name:        "server",
		Description: "Server name (turtle, epoch). Determines default --dbc path.",
		Flag:        "server",
		Value:       serpent.StringOf(dst),
		Default:     "turtle",
	}
}

// DBCOption returns a serpent.Option for the --dbc flag.
// The default is left empty; resolved at runtime from --server via ResolveDBCPath.
func DBCOption(dst *string) serpent.Option {
	return serpent.Option{
		Name:        "dbc",
		Description: "Path to WoW client directory. Defaults based on --server.",
		Flag:        "dbc",
		Value:       serpent.StringOf(dst),
	}
}

// ResolveDBCPath returns dbcPath if explicitly set, otherwise DefaultClientPath(server).
// Returns an error if neither is available.
func ResolveDBCPath(dbcPath, server string) (string, error) {
	if dbcPath != "" {
		return dbcPath, nil
	}
	if p := DefaultClientPath(server); p != "" {
		return p, nil
	}
	return "", fmt.Errorf("no default client path for server %q; pass --dbc explicitly", server)
}
