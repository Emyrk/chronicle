// Package engine ties detection, watching and uploading together and reports
// what the tray should show.
package engine

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

// State is what the tray icon shows.
type State int

const (
	// StateIdle: nothing is happening.
	StateIdle State = iota
	// StateNoLog: WoW is running but its combat log is not growing.
	StateNoLog
	// StateRecording: the combat log is growing.
	StateRecording
	// StateUploading: a log is being sent (or waiting to retry offline).
	StateUploading
	// StateUploaded: a log was just uploaded.
	StateUploaded
	// StateReconnect: the Chronicle sign-in is missing or was rejected.
	StateReconnect
)

// Status is a snapshot for the tray.
type Status struct {
	State State
	// Detail is a short human sentence for the menu.
	Detail string
	// ReportURL is the most recent report, if any.
	ReportURL string
}

// Config wires the engine to the outside world.
type Config struct {
	Store *store.Store
	// Installs returns the flavor folders to watch right now.
	Installs func() []wowdir.Install
	// Token returns the current bearer token.
	Token func() string
	// Upload sends size bytes of path.
	Upload func(ctx context.Context, token, path string, size int64) (upload.Result, error)
	// Running reports whether WoW is running.
	Running func(ctx context.Context, installDirs []string) bool
	// Notify shows a native notification.
	Notify func(title, message string)
	// OnStatus is called when the status changes.
	OnStatus func(Status)
	Logger   *slog.Logger

	Poll      time.Duration // default 5s
	IdleAfter time.Duration // default 5m
	// RetryBase is the first offline retry delay; it doubles up to RetryMax.
	RetryBase time.Duration // default 5s
	RetryMax  time.Duration // default 5m
}

// Engine is the uploader's brain. Create with New and call Run.
type Engine struct {
	cfg     Config
	tracker *watch.Tracker
	manual  chan struct{}

	status        Status
	rejectedToken string
	uploadedUntil time.Time
	now           time.Time // start of the current step
	lastUploaded  Status
	wait          func(ctx context.Context, d time.Duration) // overridden in tests
}

const uploadedStickiness = time.Minute

// New returns an Engine.
func New(cfg Config) *Engine {
	if cfg.Poll == 0 {
		cfg.Poll = 5 * time.Second
	}
	if cfg.IdleAfter == 0 {
		cfg.IdleAfter = 5 * time.Minute
	}
	if cfg.RetryBase == 0 {
		cfg.RetryBase = 5 * time.Second
	}
	if cfg.RetryMax == 0 {
		cfg.RetryMax = 5 * time.Minute
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	st := cfg.Store.Get()
	return &Engine{
		cfg:     cfg,
		tracker: watch.NewTracker(st.Uploaded),
		manual:  make(chan struct{}, 1),
		status:  Status{ReportURL: st.LastReportURL},
		wait: func(ctx context.Context, d time.Duration) {
			t := time.NewTimer(d)
			defer t.Stop()
			select {
			case <-ctx.Done():
			case <-t.C:
			}
		},
	}
}

// UploadNow asks for an upload of every log that has new data.
func (e *Engine) UploadNow() {
	select {
	case e.manual <- struct{}{}:
	default:
	}
}

// Run polls until ctx is done.
func (e *Engine) Run(ctx context.Context) {
	tick := time.NewTicker(e.cfg.Poll)
	defer tick.Stop()
	manual := false
	for {
		e.step(ctx, time.Now(), manual)
		manual = false
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		case <-e.manual:
			manual = true
		}
	}
}

func (e *Engine) step(ctx context.Context, now time.Time, manual bool) {
	e.now = now
	installs := e.cfg.Installs()
	var logDirs, installDirs []string
	for _, in := range installs {
		logDirs = append(logDirs, in.LogDir)
		installDirs = append(installDirs, in.Dir)
	}

	files := watch.LogFiles(logDirs)
	running := e.cfg.Running(ctx, installDirs)
	trig := watch.Trigger{
		OnExit:    true,
		OnIdle:    e.cfg.Store.Get().UploadOnIdle,
		IdleAfter: e.cfg.IdleAfter,
	}
	queue, recording := e.tracker.Observe(now, files, running, manual, trig)

	if manual && len(queue) == 0 {
		msg := "Nothing new to upload."
		if len(files) == 0 {
			msg = "No combat log yet. Type /combatlog in WoW to start one."
		}
		e.cfg.Notify("Chronicle", msg)
	}

	token := e.cfg.Token()
	needAuth := token == "" || token == e.rejectedToken
	for _, f := range queue {
		if needAuth {
			break
		}
		if ctx.Err() != nil {
			return
		}
		if !e.uploadOne(ctx, token, f) {
			needAuth = true // rejected; keep the rest queued
		}
	}

	e.setStatus(e.baseline(now, len(installs) > 0, running, recording, needAuth))
}

func (e *Engine) baseline(now time.Time, haveInstall, running, recording, needAuth bool) Status {
	last := e.status.ReportURL
	switch {
	case needAuth:
		return Status{State: StateReconnect, Detail: "Connect to Chronicle to upload your logs.", ReportURL: last}
	case now.Before(e.uploadedUntil):
		return e.lastUploaded
	case recording:
		return Status{State: StateRecording, Detail: "Recording your combat log.", ReportURL: last}
	case running:
		return Status{State: StateNoLog, Detail: "WoW is running but not logging. Type /combatlog in game.", ReportURL: last}
	case !haveInstall:
		return Status{State: StateIdle, Detail: "Can't find WoW. Choose its folder from the menu.", ReportURL: last}
	}
	return Status{State: StateIdle, Detail: "Waiting for WoW.", ReportURL: last}
}

// uploadOne returns false when the server rejected the token.
func (e *Engine) uploadOne(ctx context.Context, token string, f watch.File) bool {
	log := e.cfg.Logger.With("file", f.Path, "size", f.Size)
	delay := e.cfg.RetryBase
	for {
		e.setStatus(Status{State: StateUploading, Detail: "Uploading your log…", ReportURL: e.status.ReportURL})
		res, err := e.cfg.Upload(ctx, token, f.Path, f.Size)
		switch {
		case err == nil:
			e.finish(f, res)
			return true
		case ctx.Err() != nil:
			return true
		case errors.Is(err, upload.ErrUnauthorized):
			log.Warn("token rejected")
			e.rejectedToken = token
			e.cfg.Notify("Chronicle", "Chronicle needs you to sign in again.")
			return false
		case upload.Retryable(err):
			log.Warn("upload failed, will retry", "err", err, "in", delay)
			e.setStatus(Status{State: StateUploading, Detail: fmt.Sprintf("Can't reach Chronicle. Retrying in %s…", delay.Round(time.Second)), ReportURL: e.status.ReportURL})
			e.wait(ctx, delay)
			delay = min(delay*2, e.cfg.RetryMax)
		default:
			log.Error("upload failed", "err", err)
			e.tracker.MarkFailed(f.Path, f.Size)
			e.cfg.Notify("Chronicle upload failed", err.Error())
			return true
		}
	}
}

func (e *Engine) finish(f watch.File, res upload.Result) {
	e.tracker.MarkUploaded(f.Path, f.Size)
	err := e.cfg.Store.Update(func(s *store.State) {
		if s.Uploaded == nil {
			s.Uploaded = map[string]int64{}
		}
		s.Uploaded[f.Path] = f.Size
		if res.ReportURL != "" {
			s.LastReportURL = res.ReportURL
		}
	})
	if err != nil {
		e.cfg.Logger.Warn("saving state", "err", err)
	}

	url := res.ReportURL
	if url == "" {
		url = e.status.ReportURL
	}
	title, detail := "Log uploaded", "Your log is on Chronicle."
	if res.Duplicate {
		title, detail = "Already uploaded", "This log was already on Chronicle."
	}
	e.lastUploaded = Status{State: StateUploaded, Detail: detail, ReportURL: url}
	e.uploadedUntil = e.now.Add(uploadedStickiness)
	e.setStatus(e.lastUploaded)
	e.cfg.Notify(title, detail)
}

func (e *Engine) setStatus(s Status) {
	if s == e.status {
		return
	}
	e.status = s
	if e.cfg.OnStatus != nil {
		e.cfg.OnStatus(s)
	}
}
