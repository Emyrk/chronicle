//go:build !windows

package autostart

import (
	"os"
	"path/filepath"
	"runtime"
)

func entryPath() (string, error) {
	if runtime.GOOS == "darwin" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "LaunchAgents", Name+".plist"), nil
	}
	cfg, err := os.UserConfigDir() // honours XDG_CONFIG_HOME
	if err != nil {
		return "", err
	}
	return filepath.Join(cfg, "autostart", "chronicle-uploader.desktop"), nil
}

// Enabled reports whether the uploader starts at login.
func Enabled() bool {
	p, err := entryPath()
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// Set turns start-at-login on or off for the executable exe.
func Set(enabled bool, exe string) error {
	p, err := entryPath()
	if err != nil {
		return err
	}
	if !enabled {
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			return err
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	content := desktopEntry(exe)
	if runtime.GOOS == "darwin" {
		content = plist(exe)
	}
	return os.WriteFile(p, []byte(content), 0o644)
}
