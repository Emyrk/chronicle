// Package autostart registers the uploader to start at login.
package autostart

import (
	"fmt"
	"strings"
)

// Name identifies the uploader in every OS's login-item list.
const Name = "com.chronicle.uploader"

func plist(exe string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>%s</string>
  <key>ProgramArguments</key>
  <array>
    <string>%s</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`, Name, xmlEscape(exe))
}

func desktopEntry(exe string) string {
	// Exec values are space-separated; quote the path.
	quoted := `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`, "`", "\\`", `$`, `\$`).Replace(exe) + `"`
	return fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=Chronicle Uploader
Comment=Uploads your WoW combat logs to Chronicle
Exec=%s
X-GNOME-Autostart-enabled=true
`, quoted)
}

func xmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}
