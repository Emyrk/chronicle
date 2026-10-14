package watch

import (
	"context"
	"path/filepath"
	"strings"

	"github.com/shirou/gopsutil/v4/process"
)

// gameProcessNames are client executable names, lowercased. WoWUp and other
// helpers are deliberately absent.
var gameProcessNames = map[string]bool{
	"wow.exe":           true,
	"wow-64.exe":        true,
	"wowb.exe":          true,
	"wowt.exe":          true,
	"wowclassic.exe":    true,
	"wowclassicb.exe":   true,
	"wowclassict.exe":   true,
	"world of warcraft": true,
}

// WoWRunning reports whether a WoW client is running. A process counts when
// its executable lives inside one of installDirs, or its name is a known
// client name (Wine/Proton report the Windows exe name).
func WoWRunning(ctx context.Context, installDirs []string) bool {
	procs, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return false
	}
	for _, p := range procs {
		if name, err := p.NameWithContext(ctx); err == nil && matchName(name) {
			return true
		}
		if exe, err := p.ExeWithContext(ctx); err == nil && underAny(exe, installDirs) {
			return true
		}
	}
	return false
}

func matchName(name string) bool {
	name = strings.ToLower(name)
	return gameProcessNames[name] || strings.HasPrefix(name, "world of warcraft")
}

func underAny(path string, dirs []string) bool {
	for _, d := range dirs {
		rel, err := filepath.Rel(d, path)
		if err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
			return true
		}
	}
	return false
}
