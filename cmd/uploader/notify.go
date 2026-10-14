package main

import (
	"os/exec"
	"runtime"

	"github.com/ncruces/zenity"
)

// notify shows a native notification. Clicking it does nothing; the report is
// reachable from the tray menu.
func notify(title, message string) {
	_ = zenity.Notify(message, zenity.Title(title))
}

// openURL opens a link in the user's browser.
func openURL(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
