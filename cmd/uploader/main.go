// Command uploader is a tray app that uploads WoW Forever combat logs to
// Chronicle after each play session.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

const defaultServer = "https://chronicleclassic.com"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var (
		server   = flag.String("server", envOr("CHRONICLE_URL", defaultServer), "Chronicle server URL")
		wowPath  = flag.String("wow-path", "", "WoW folder, flavor folder or executable (overrides the saved choice)")
		devToken = flag.String("dev-token", os.Getenv("CHRONICLE_UPLOADER_TOKEN"), "development only: session JWT to store in the keychain until browser pairing lands")
	)
	flag.Parse()

	dir, err := store.Dir()
	if err != nil {
		return fmt.Errorf("find config dir: %w", err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	st, err := store.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		return fmt.Errorf("open state: %w", err)
	}

	// There is no terminal for a tray app; log to a file.
	var logger *slog.Logger
	if lf, err := os.OpenFile(filepath.Join(dir, "uploader.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600); err == nil {
		defer func() { _ = lf.Close() }()
		logger = slog.New(slog.NewTextHandler(lf, nil))
	} else {
		logger = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}

	if *devToken != "" {
		if err := store.SaveToken(*devToken); err != nil {
			return fmt.Errorf("save token to keychain: %w", err)
		}
	}
	if *wowPath != "" {
		if err := st.Update(func(s *store.State) { s.WoWPath = *wowPath }); err != nil {
			return err
		}
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	a := &app{server: *server, store: st, logger: logger, cancel: cancel}
	a.engine = engine.New(engine.Config{
		Store:    st,
		Installs: a.installs,
		Token:    store.Token,
		Upload: func(ctx context.Context, token, path string, size int64) (upload.Result, error) {
			c := upload.Client{BaseURL: *server, Token: token}
			return c.Upload(ctx, path, size)
		},
		Running:  watch.WoWRunning,
		Notify:   notify,
		OnStatus: a.onStatus,
		Logger:   logger,
	})
	return a.runTray(ctx)
}

// installs returns the flavor folders to watch: the user's choice if it still
// resolves, otherwise whatever is found in the standard locations.
func (a *app) installs() []wowdir.Install {
	if p := a.store.Get().WoWPath; p != "" {
		if found, err := wowdir.Resolve(p); err == nil {
			return found
		}
	}
	return wowdir.Detect(wowdir.StandardRoots())
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
