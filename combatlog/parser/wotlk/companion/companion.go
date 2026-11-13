// Package companion preserves the legacy import path for the parsernext-owned
// ChronicleCompanion CLEU decoder.
package companion

import (
	"log/slog"

	"github.com/Emyrk/chronicle/combatlog/parser/types/realmclock"
	next "github.com/Emyrk/chronicle/combatlog/parsernext/formats/cleu/companion"
)

// Parser is the parsernext-owned ChronicleCompanion decoder.
type Parser = next.Parser

// PlayerData is retained for compatibility with the legacy import path.
type PlayerData = next.PlayerData

func New(logger *slog.Logger) *Parser { return next.New(logger) }

func IsCompanionMessage(payload string) bool { return next.IsCompanionMessage(payload) }

func ParseHeaderClock(data string) (*realmclock.Info, error) { return next.ParseHeaderClock(data) }
