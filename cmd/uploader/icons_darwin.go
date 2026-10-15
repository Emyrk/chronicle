//go:build darwin

package main

import (
	"os/exec"
	"strings"

	"fyne.io/systray"
)

// monoGlyph: on macOS the glyph is black or white to match the menu bar. It is
// not a template image, because a template would flatten the coloured spiral.
const monoGlyph = true

// menuBarDark reports whether the system appearance is dark. The key is absent
// in light mode, so a failing `defaults` means light. Re-read on every state
// change so an appearance switch is picked up.
func menuBarDark() bool {
	out, err := exec.Command("defaults", "read", "-g", "AppleInterfaceStyle").Output()
	return err == nil && strings.EqualFold(strings.TrimSpace(string(out)), "dark")
}

func setTrayIcon(b []byte) { systray.SetIcon(b) }
