package main

import (
	"context"
	"os/exec"
	"runtime"
	"time"

	"github.com/ncruces/zenity"
)

// notifyTimeout bounds how long a notification may take to show. A stuck
// notification service must not block the upload worker or the poll loop.
const notifyTimeout = 15 * time.Second

// notify shows a native notification. Clicking it does nothing; the report is
// reachable from the tray menu.
func notify(title, message string) {
	ctx, cancel := context.WithTimeout(context.Background(), notifyTimeout)
	defer cancel()
	_ = zenity.Notify(message, zenity.Title(title), zenity.Context(ctx))
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
	if cmd.Start() == nil {
		go func() { _ = cmd.Wait() }()
	}
}
