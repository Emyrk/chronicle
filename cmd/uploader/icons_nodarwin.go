//go:build !darwin

package main

import "fyne.io/systray"

const useTemplateIcon = false

func setTrayIcon(b []byte) { systray.SetIcon(b) }
