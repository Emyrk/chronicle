package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"fyne.io/systray"
	"github.com/ncruces/zenity"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/autostart"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/pair"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/update"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

type app struct {
	server string
	layout tenant.Layout
	store  *store.Store
	logger *slog.Logger
	engine *engine.Engine
	cancel context.CancelFunc

	mu     sync.Mutex
	status engine.Status
	items  menuItems
	ready  bool

	updateLink string
	pairing    bool   // a pairing is in flight
	account    string // device name when connected, "" otherwise
	pairMsg    string // last pairing outcome, shown until the next attempt
}

type menuItems struct {
	status, folder, report, connect, disconnect, update *systray.MenuItem
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
	a.items.disconnect = systray.AddMenuItem("Disconnect", "Forget this computer's Chronicle sign-in")
	a.items.disconnect.Hide()
	a.items.update = systray.AddMenuItem("Update available", "")
	a.items.update.Hide()
	systray.AddSeparator()
	choose := systray.AddMenuItem("Choose WoW folder…", "")
	idle := systray.AddMenuItemCheckbox("Also upload when the log goes quiet", "", a.store.Get().UploadOnIdle)
	archive := systray.AddMenuItemCheckbox("Archive the log after upload", "Rename the combat log once it is uploaded so the next session starts a fresh one", !a.store.Get().KeepLog)
	login := systray.AddMenuItemCheckbox("Start at login", "", autostart.Enabled())
	systray.AddSeparator()
	quit := systray.AddMenuItem("Quit", "")

	a.mu.Lock()
	a.ready = true
	a.mu.Unlock()
	a.render()
	a.renderFolder()

	go a.engine.Run(ctx)
	go a.startup(ctx)
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
				go a.connect(ctx)
			case <-a.items.disconnect.ClickedCh:
				a.disconnect()
			case <-a.items.update.ClickedCh:
				openURL(a.updateURL())
			case <-choose.ClickedCh:
				a.chooseFolder()
			case <-idle.ClickedCh:
				on := !idle.Checked()
				a.toggle(idle, on)
				_ = a.store.Update(func(s *store.State) { s.UploadOnIdle = on })
			case <-archive.ClickedCh:
				on := !archive.Checked()
				a.toggle(archive, on)
				_ = a.store.Update(func(s *store.State) { s.KeepLog = !on })
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
// checkUpdate checks at launch and then once a day. Later checks are
// conditional GETs, so an unchanged release list costs one tiny request.
func (a *app) checkUpdate(ctx context.Context) {
	checker := &update.Checker{Client: http.DefaultClient, URL: update.DefaultURL}
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		a.checkUpdateOnce(ctx, checker)
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

func (a *app) checkUpdateOnce(ctx context.Context, checker *update.Checker) {
	rel, ok, err := checker.Check(ctx)
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
	if _, err := wowdir.Resolve(path, a.layout); err != nil {
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
	setTrayIcon(trayIcon(s.State))
	systray.SetTooltip("Chronicle Uploader: " + s.Detail)
	a.items.status.SetTitle(s.Detail)
	if s.ReportURL != "" {
		a.items.report.Enable()
	}
	switch {
	case a.pairing:
		a.items.connect.Hide()
		a.items.disconnect.Hide()
	case s.State == engine.StateReconnect:
		a.items.connect.Show()
		a.items.disconnect.Hide()
	default:
		a.items.connect.Hide()
		a.items.disconnect.Show()
	}
	switch {
	case a.pairing:
		a.items.status.SetTitle("Waiting for you to approve in your browser…")
	case a.pairMsg != "":
		a.items.status.SetTitle(a.pairMsg)
	case a.account != "" && s.State != engine.StateReconnect:
		a.items.status.SetTitle(s.Detail + " (Connected as " + a.account + ")")
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

// startup shows the not-connected state once on a first launch, and looks up
// the device name when a token is already stored. It never opens the browser.
func (a *app) startup(ctx context.Context) {
	token := store.Token()
	if token == "" {
		notify("Chronicle", "Not connected. Choose \"Connect to Chronicle…\" from the tray menu to start uploading.")
		return
	}
	a.setAccount(ctx, token)
}

func (a *app) pairClient() *pair.Client { return &pair.Client{BaseURL: a.server} }

func (a *app) setAccount(ctx context.Context, token string) {
	name, err := a.pairClient().WhoAmI(ctx, token)
	if err != nil {
		// A rejected token is handled by the next upload; offline is fine.
		a.logger.Warn("whoami", "err", err)
		return
	}
	a.mu.Lock()
	a.account = name
	a.mu.Unlock()
	a.render()
}

// connect runs the browser pairing flow.
func (a *app) connect(ctx context.Context) {
	a.mu.Lock()
	if a.pairing {
		a.mu.Unlock()
		return
	}
	a.pairing = true
	a.pairMsg = ""
	a.mu.Unlock()
	a.render()

	msg := a.pair(ctx)

	a.mu.Lock()
	a.pairing = false
	a.pairMsg = msg
	a.mu.Unlock()
	a.render()
	a.engine.TokenChanged()
}

// pair returns a failure message, or "" when connected.
func (a *app) pair(ctx context.Context) string {
	c := a.pairClient()
	host, _ := os.Hostname()
	start, err := c.Start(ctx, strings.TrimSpace("Chronicle Uploader "+host))
	if err != nil {
		a.logger.Error("pair start", "err", err)
		notify("Chronicle", "Couldn't reach Chronicle. Check your connection and try again.")
		return "Couldn't reach Chronicle, try again"
	}
	openURL(start.VerifyURL)

	outcome, token, err := c.Wait(ctx, start)
	if err != nil {
		a.logger.Warn("pair wait", "err", err)
	}
	switch {
	case outcome == pair.Approved && err == nil:
		if err := store.SaveToken(token); err != nil {
			a.logger.Error("save token", "err", err)
			notify("Chronicle", "Couldn't save the sign-in to your keychain.")
			return "Couldn't save the sign-in"
		}
		a.setAccount(ctx, token)
		notify("Chronicle", "Connected. Your logs will upload automatically.")
		return ""
	case outcome == pair.Denied:
		notify("Chronicle", "Pairing denied.")
		return "Pairing denied"
	default:
		notify("Chronicle", "Pairing expired, try again.")
		return "Pairing expired, try again"
	}
}

func (a *app) disconnect() {
	if err := store.DeleteToken(); err != nil {
		a.logger.Error("delete token", "err", err)
		notify("Chronicle", "Couldn't remove the sign-in from your keychain.")
		return
	}
	a.mu.Lock()
	a.account = ""
	a.pairMsg = ""
	a.mu.Unlock()
	a.engine.TokenChanged()
}
