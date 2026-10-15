//go:build !darwin

package main

import "fyne.io/systray"

const monoGlyph = false

func menuBarDark() bool { return false }

func setTrayIcon(b []byte) { systray.SetIcon(b) }
