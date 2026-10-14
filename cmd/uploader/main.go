// Command uploader is a tray app that uploads WoW Forever combat logs to
// Chronicle after each play session.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/engine"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

// version is set at release time with -ldflags "-X main.version=...".
var version = "dev"

// maxLogSize is when uploader.log is rotated at.
const maxLogSize = 4 << 20

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	var (
		server   = flag.String("server", envOr("CHRONICLE_URL", ""), "Chronicle server URL; remembered for later launches")
		wowPath  = flag.String("wow-path", "", "WoW folder, flavor folder or executable (overrides the saved choice)")
		devToken = flag.String("dev-token", os.Getenv("CHRONICLE_UPLOADER_TOKEN"), "development only: token to store in the keychain instead of pairing (prefer CHRONICLE_UPLOADER_TOKEN; argv is visible to other processes)")
	)
	flag.Usage = func() {
		_, _ = fmt.Fprintf(flag.CommandLine.Output(), "Usage of %s:\n", os.Args[0])
		flag.VisitAll(func(f *flag.Flag) {
			if f.Name != "dev-token" { // hidden dev escape hatch
				_, _ = fmt.Fprintf(flag.CommandLine.Output(), "  -%s\n    \t%s\n", f.Name, f.Usage)
			}
		})
	}
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
	if lf, err := openRotating(filepath.Join(dir, "uploader.log"), maxLogSize); err == nil {
		defer func() { _ = lf.Close() }()
		var w io.Writer = lf
		// Also log to the terminal when started from one.
		if fi, err := os.Stderr.Stat(); err == nil && fi.Mode()&os.ModeCharDevice != 0 {
			w = io.MultiWriter(lf, os.Stderr)
		}
		logger = slog.New(slog.NewTextHandler(w, nil))
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

	tn := tenant.Resolve(st.Get().Tenant, *server)
	if err := st.Update(func(s *store.State) { s.Tenant = tn }); err != nil {
		return err
	}
	logger.Info("tenant", "base_url", tn.BaseURL, "format", tn.Format, "flavor", tn.Flavor)

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	a := &app{server: tn.BaseURL, store: st, logger: logger, cancel: cancel}
	a.engine = engine.New(engine.Config{
		Store:    st,
		Installs: a.installs,
		Token:    store.Token,
		Upload: func(ctx context.Context, token, path string, size int64) (upload.Result, error) {
			c := upload.Client{BaseURL: tn.BaseURL, Format: tn.Format, Flavor: tn.Flavor, Token: token}
			return c.Upload(ctx, path, size)
		},
		Running:  watch.WoWRunning,
		Notify:   notify,
		OnStatus: a.onStatus,
		Logger:   logger,
	})
	go func() {
		if err := upload.Ping(ctx, nil, tn.BaseURL); err != nil {
			logger.Error("server check failed", "err", err)
		}
	}()
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
