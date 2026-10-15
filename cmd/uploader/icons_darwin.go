//go:build darwin

package main

import "fyne.io/systray"

// useTemplateIcon: macOS draws the glyph as a template image so it inverts on
// light/dark menu bars.
const useTemplateIcon = true

func setTrayIcon(b []byte) { systray.SetTemplateIcon(b, b) }
