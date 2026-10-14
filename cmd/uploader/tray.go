package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sync"

	"fyne.io/systray"
	"github.com/ncruces/zenity"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/autostart"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/update"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

type app struct {
	server string
	store  *store.Store
	logger *slog.Logger
	engine *engine.Engine
	cancel context.CancelFunc

	mu     sync.Mutex
	status engine.Status
	items  menuItems
	ready  bool

	updateLink string
}

type menuItems struct {
	status, folder, report, connect, update *systray.MenuItem
}

func (a *app) runTray(ctx context.Context) error {
	go func() {
		<-ctx.Done()
		systray.Quit()
	}()
	systray.Run(func() { a.onReady(ctx) }, a.cancel)
	return nil
}

func (a *app) onReady(ctx context.Context) {
	systray.SetTitle("")
	systray.SetTooltip("Chronicle Uploader")

	a.items.status = systray.AddMenuItem("Starting…", "")
	a.items.status.Disable()
	a.items.folder = systray.AddMenuItem("", "")
	a.items.folder.Disable()
	host := systray.AddMenuItem("Connected to "+a.serverHost(), a.server)
	host.Disable()
	systray.AddSeparator()
	upload := systray.AddMenuItem("Upload now", "Upload your latest combat log")
	a.items.report = systray.AddMenuItem("Open last report", "")
	a.items.report.Disable()
	a.items.connect = systray.AddMenuItem("Connect to Chronicle…", "")
	a.items.connect.Hide()
	a.items.update = systray.AddMenuItem("Update available", "")
	a.items.update.Hide()
	systray.AddSeparator()
	choose := systray.AddMenuItem("Choose WoW folder…", "")
	idle := systray.AddMenuItemCheckbox("Also upload when the log goes quiet", "", a.store.Get().UploadOnIdle)
	login := systray.AddMenuItemCheckbox("Start at login", "", autostart.Enabled())
	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit", "")

	a.mu.Lock()
	a.ready = true
	a.mu.Unlock()
	a.render()
	a.renderFolder()

	go a.engine.Run(ctx)
	go a.checkUpdate(ctx)

	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case <-upload.ClickedCh:
				a.engine.UploadNow()
			case <-a.items.report.ClickedCh:
				if u := a.current().ReportURL; u != "" {
					openURL(u)
				}
			case <-a.items.connect.ClickedCh:
				// TODO(#999): start the browser pairing flow. Until it lands,
				// send the user to the site; the token is read from the
				// keychain on every poll so a stored token takes effect.
				openURL(a.server)
			case <-a.items.update.ClickedCh:
				openURL(a.updateURL())
			case <-choose.ClickedCh:
				a.chooseFolder()
			case <-idle.ClickedCh:
				on := !idle.Checked()
				a.toggle(idle, on)
				_ = a.store.Update(func(s *store.State) { s.UploadOnIdle = on })
			case <-login.ClickedCh:
				on := !login.Checked()
				exe, err := os.Executable()
				if err == nil {
					err = autostart.Set(on, exe)
				}
				if err != nil {
					a.logger.Error("start at login", "err", err)
					notify("Chronicle", "Couldn't change the start-at-login setting.")
					continue
				}
				a.toggle(login, on)
			case <-quit.ClickedCh:
				a.cancel()
				return
			}
		}
	}()
}

// checkUpdate looks for a newer release once at launch and, if there is one,
// shows it in the tray. Failures are logged and otherwise ignored.
func (a *app) checkUpdate(ctx context.Context) {
	rel, ok, err := update.Latest(ctx, http.DefaultClient, update.DefaultURL)
	if err != nil {
		a.logger.Warn("update check", "err", err)
		return
	}
	if !ok || !update.Newer(version, rel.Version) {
		return
	}
	a.mu.Lock()
	a.updateLink = rel.URL
	a.mu.Unlock()
	a.items.update.SetTitle("Update available: v" + rel.Version)
	a.items.update.Show()
}

func (a *app) updateURL() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.updateLink
}

func (a *app) toggle(item *systray.MenuItem, on bool) {
	if on {
		item.Check()
	} else {
		item.Uncheck()
	}
}

func (a *app) chooseFolder() {
	path, err := zenity.SelectFile(
		zenity.Directory(),
		zenity.Title("Choose your World of Warcraft folder"),
	)
	if err != nil {
		if err != zenity.ErrCanceled {
			a.logger.Error("folder picker", "err", err)
		}
		return
	}
	if _, err := wowdir.Resolve(path); err != nil {
		notify("Chronicle", "That doesn't look like a World of Warcraft folder.")
		return
	}
	if err := a.store.Update(func(s *store.State) { s.WoWPath = path }); err != nil {
		a.logger.Error("save wow path", "err", err)
	}
	a.renderFolder()
}

func (a *app) current() engine.Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.status
}

func (a *app) onStatus(s engine.Status) {
	a.mu.Lock()
	a.status = s
	a.mu.Unlock()
	a.render()
	a.renderFolder()
}

func (a *app) render() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.ready {
		return
	}
	s := a.status
	systray.SetIcon(trayIcon(s.State))
	systray.SetTooltip("Chronicle Uploader: " + s.Detail)
	a.items.status.SetTitle(s.Detail)
	if s.ReportURL != "" {
		a.items.report.Enable()
	}
	if s.State == engine.StateReconnect {
		a.items.connect.Show()
	} else {
		a.items.connect.Hide()
	}
}

// serverHost is the tenant host shown in the menu so a wrong server is visible.
func (a *app) serverHost() string {
	if u, err := url.Parse(a.server); err == nil && u.Host != "" {
		return u.Host
	}
	return a.server
}

func (a *app) renderFolder() {
	a.mu.Lock()
	ready := a.ready
	a.mu.Unlock()
	if !ready {
		return
	}
	label := "WoW folder: not found"
	if found := a.installs(); len(found) > 0 {
		label = fmt.Sprintf("WoW folder: %s", filepath.Base(filepath.Dir(found[0].Dir)))
	}
	a.items.folder.SetTitle(label)
}
