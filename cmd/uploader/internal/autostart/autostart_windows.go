//go:build windows

package autostart

import (
	"strings"

	"golang.org/x/sys/windows/registry"
)

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`

// Enabled reports whether the uploader starts at login.
func Enabled() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue(Name)
	return err == nil
}

// Set turns start-at-login on or off for the executable exe.
func Set(enabled bool, exe string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if !enabled {
		if err := k.DeleteValue(Name); err != nil && err != registry.ErrNotExist {
			return err
		}
		return nil
	}
	return k.SetStringValue(Name, `"`+strings.ReplaceAll(exe, `"`, "")+`"`)
}
