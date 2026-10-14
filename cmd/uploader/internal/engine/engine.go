// Package engine ties detection, watching and uploading together and reports
// what the tray should show.
package engine

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"runtime/debug"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/store"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/upload"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/watch"
	"github.com/Emyrk/chronicle/cmd/uploader/internal/wowdir"
)

// State is what the tray icon shows.
type State int

const (
	// StateIdle: waiting for WoW.
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
	// Token reads the bearer token from the keychain. It is cached; call
	// Engine.TokenChanged after storing or removing one.
	Token func() string
	// Upload sends size bytes of path. fast asks for the cheapest compression;
	// it is set while WoW is running so the game never competes for CPU.
	Upload func(ctx context.Context, token, path string, size int64, fast bool) (upload.Result, error)
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
	// ServerRetryFor bounds how long a log is retried against a server that
	// keeps answering 5xx (waiting RetryMax between tries) before it is marked
	// failed. Offline retries have no bound.
	ServerRetryFor time.Duration // default 1h
}

// Engine is the uploader's brain. Create with New and call Run.
type Engine struct {
	cfg     Config
	tracker *watch.Tracker
	manual  chan struct{}
	wake    chan struct{}
	dirty   atomic.Bool // token changed behind our back; re-read it

	status        Status
	rejectedToken string
	token         string // cached keychain value
	tokenRead     time.Time
	tokenLoaded   bool
	uploadedUntil time.Time
	now           time.Time // start of the current step
	lastUploaded  Status
	watching      map[string]bool // log files already announced
	wowUp         bool
	sessionStart  time.Time
	lastSession   time.Duration                              // length of the most recent WoW session
	wait          func(ctx context.Context, d time.Duration) // overridden in tests

	// mu guards everything the poll loop and the upload worker share: tracker,
	// status and the fields the worker reads (token, wowUp, now, ...).
	mu       sync.Mutex
	pending  []job
	archiveQ []watch.File // fully uploaded logs for the worker to rename
	// archiveFailed holds the size at which renaming a live log failed. Such a
	// log is not queued again until its size changes. Guarded by mu.
	archiveFailed map[string]int64
	current       *job
	kick          chan struct{} // wakes the worker when pending grows
	workerOnce    sync.Once
}

// job is one log waiting to be (or being) uploaded.
type job struct {
	path string
	size int64
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
	if cfg.ServerRetryFor == 0 {
		cfg.ServerRetryFor = time.Hour
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.Default()
	}
	st := pruneUploaded(cfg.Store, cfg.Logger)
	return &Engine{
		cfg:     cfg,
		tracker: watch.NewTracker(st.Uploaded),
		manual:  make(chan struct{}, 1),
		wake:    make(chan struct{}, 1),
		kick:    make(chan struct{}, 1),
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

// pruneUploaded forgets uploaded logs that are gone or are archives, so the
// state file and the tracker do not grow with every session. Archives are not
// watched, and a log that no longer exists will never be seen again.
func pruneUploaded(s *store.Store, log *slog.Logger) store.State {
	st := s.Get()
	var stale []string
	for p := range st.Uploaded {
		if _, err := os.Stat(p); err != nil || watch.IsArchive(p) {
			stale = append(stale, p)
		}
	}
	if len(stale) == 0 {
		return st
	}
	err := s.Update(func(s *store.State) {
		for _, p := range stale {
			delete(s.Uploaded, p)
		}
	})
	if err != nil {
		log.Warn("saving state", "err", err)
	}
	log.Info("forgot uploaded logs that are gone", "count", len(stale))
	return s.Get()
}

// UploadNow asks for an upload of every log that has new data.
func (e *Engine) UploadNow() {
	select {
	case e.manual <- struct{}{}:
	default:
	}
}

// TokenChanged tells the engine the stored token was replaced or removed. It
// re-reads the token and re-evaluates now, without the "nothing new" notice of
// UploadNow.
func (e *Engine) TokenChanged() {
	e.dirty.Store(true)
	select {
	case e.wake <- struct{}{}:
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
		case <-e.wake:
		case <-e.manual:
			manual = true
		}
	}
}

func (e *Engine) step(ctx context.Context, now time.Time, manual bool) {
	e.workerOnce.Do(func() { go e.worker(ctx) })
	installs := e.cfg.Installs()
	var logDirs, installDirs []string
	for _, in := range installs {
		logDirs = append(logDirs, in.LogDir)
		installDirs = append(installDirs, in.Dir)
	}

	files := watch.LogFiles(logDirs)
	running := e.cfg.Running(ctx, installDirs)
	st := e.cfg.Store.Get()
	trig := watch.Trigger{
		OnExit:    true,
		OnIdle:    st.UploadOnIdle,
		IdleAfter: e.cfg.IdleAfter,
	}
	for _, f := range files {
		if !e.watching[f.Path] {
			if e.watching == nil {
				e.watching = map[string]bool{}
			}
			e.watching[f.Path] = true
			e.cfg.Logger.Info("watching", "file", f.Path)
		}
	}
	e.mu.Lock()
	e.now = now
	e.trackSession(now, running)
	queue, recording := e.tracker.Observe(now, files, running, manual, trig)
	if !st.KeepLog {
		e.queueArchive(files, running)
	}
	e.mu.Unlock()

	if manual && len(queue) == 0 {
		msg := "Nothing new to upload."
		if len(files) == 0 {
			msg = "No combat log yet. Type /combatlog in WoW to start one."
		}
		e.cfg.Notify("Chronicle", msg)
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	token := e.currentToken(now)
	needAuth := token == "" || token == e.rejectedToken
	if !needAuth {
		e.enqueue(queue)
	}
	if e.busy() {
		return // the worker owns the status until it is done
	}
	rejected := token != "" && token == e.rejectedToken
	e.setStatus(e.baseline(now, len(installs) > 0, running, recording, needAuth, rejected))
}

// trackSession logs WoW starting and exiting and remembers how long it ran.
func (e *Engine) trackSession(now time.Time, running bool) {
	switch {
	case running && !e.wowUp:
		e.sessionStart = now
		e.cfg.Logger.Info("wow started")
	case !running && e.wowUp:
		e.lastSession = now.Sub(e.sessionStart)
		e.cfg.Logger.Info("wow exited", "session", e.lastSession.Round(time.Minute))
	}
	e.wowUp = running
}

// sessionLength is the current session if WoW is running, else the last one.
func (e *Engine) sessionLength() time.Duration {
	if e.wowUp {
		return e.now.Sub(e.sessionStart)
	}
	return e.lastSession
}

func formatDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	h, m := int(d.Hours()), int(d.Minutes())%60
	switch {
	case h > 0 && m > 0:
		return fmt.Sprintf("%dh %dm", h, m)
	case h > 0:
		return fmt.Sprintf("%dh", h)
	}
	return fmt.Sprintf("%dm", m)
}

func formatSize(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for v := n / unit; v >= unit; v /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(n)/float64(div), "KMGT"[exp])
}

// reconnectRecheck bounds how often a missing or rejected token is re-read
// (it may have been written by another process).
const reconnectRecheck = time.Minute

// currentToken returns the cached token. The keychain is only read at the
// start, after TokenChanged, and at most once per reconnectRecheck while no
// usable token is held; reading it can mean spawning a process.
func (e *Engine) currentToken(now time.Time) string {
	reconnect := e.token == "" || e.token == e.rejectedToken
	if e.dirty.Swap(false) || !e.tokenLoaded || (reconnect && now.Sub(e.tokenRead) >= reconnectRecheck) {
		e.token = e.cfg.Token()
		e.tokenRead = now
		e.tokenLoaded = true
	}
	return e.token
}

func (e *Engine) baseline(now time.Time, haveInstall, running, recording, needAuth, rejected bool) Status {
	last := e.status.ReportURL
	switch {
	case rejected:
		return Status{State: StateReconnect, Detail: "Needs reconnect. Connect to Chronicle again.", ReportURL: last}
	case needAuth:
		return Status{State: StateReconnect, Detail: "Not connected. Connect to Chronicle to upload your logs.", ReportURL: last}
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

// enqueue hands queue to the worker. Observe keeps returning a file until the
// worker marks it, so a file that is already queued (or in flight at the same
// size) is skipped. Callers hold e.mu.
func (e *Engine) enqueue(queue []watch.File) {
	for _, f := range queue {
		switch {
		case e.current != nil && e.current.path == f.Path && e.current.size == f.Size:
		case e.replacePending(f):
		default:
			e.pending = append(e.pending, job{path: f.Path, size: f.Size})
		}
	}
	if len(e.pending) > 0 {
		select {
		case e.kick <- struct{}{}:
		default:
		}
	}
}

// queueArchive asks the worker to rename logs that are fully uploaded, once
// this poll found WoW not running. step never renames anything itself. Callers
// hold e.mu.
func (e *Engine) queueArchive(files []watch.File, running bool) {
	for _, f := range e.tracker.Archivable(files, running) {
		if size, ok := e.archiveFailed[f.Path]; ok && size == f.Size {
			e.cfg.Logger.Debug("not archiving log, rename failed at this size", "file", f.Path)
			continue
		}
		if !slices.Contains(e.archiveQ, f) {
			e.archiveQ = append(e.archiveQ, f)
		}
	}
	if len(e.archiveQ) > 0 {
		select {
		case e.kick <- struct{}{}:
		default:
		}
	}
}

// archive renames the queued logs. The worker calls it only when no upload is
// pending, holding e.mu so a poll cannot interleave. A log is skipped unless
// the latest poll still says WoW is not running and the tracker still has all
// of its bytes uploaded; the poll loop queues it again later if so.
func (e *Engine) archive() {
	q := e.archiveQ
	e.archiveQ = nil
	for _, f := range q {
		if len(e.tracker.Archivable([]watch.File{f}, e.wowUp)) == 0 {
			continue
		}
		to, err := watch.Archive(f, e.now)
		if err != nil {
			// Retrying every poll would not help (read-only directory, file held
			// open); wait for the log to change.
			if e.archiveFailed == nil {
				e.archiveFailed = map[string]int64{}
			}
			e.archiveFailed[f.Path] = f.Size
			e.cfg.Logger.Warn("archiving log", "file", f.Path, "err", err)
			continue
		}
		delete(e.archiveFailed, f.Path)
		e.tracker.MarkArchived(f.Path, to)
		err = e.cfg.Store.Update(func(s *store.State) {
			delete(s.Uploaded, f.Path) // the archive is not watched, so not tracked
		})
		if err != nil {
			e.cfg.Logger.Warn("saving state", "err", err)
		}
		e.cfg.Logger.Info("archived log", "from", f.Path, "to", to)
	}
}

// replacePending refreshes the size of an already queued path. Callers hold e.mu.
func (e *Engine) replacePending(f watch.File) bool {
	for i := range e.pending {
		if e.pending[i].path == f.Path {
			e.pending[i].size = f.Size
			return true
		}
	}
	return false
}

// busy reports whether the worker has anything queued or in flight. Callers
// hold e.mu.
func (e *Engine) busy() bool { return e.current != nil || len(e.pending) > 0 }

// worker uploads queued logs one at a time so the poll loop never blocks.
func (e *Engine) worker(ctx context.Context) {
	for {
		e.mu.Lock()
		if len(e.pending) == 0 && len(e.archiveQ) > 0 {
			e.archive()
		}
		if len(e.pending) == 0 {
			e.mu.Unlock()
			select {
			case <-ctx.Done():
				return
			case <-e.kick:
			}
			continue
		}
		j := e.pending[0]
		e.pending = e.pending[1:]
		e.current = &j
		e.mu.Unlock()

		rejected := e.uploadOne(ctx, j)

		e.mu.Lock()
		e.current = nil
		if rejected {
			// Still queued in the tracker; the poll loop re-enqueues them once
			// there is a new token.
			e.pending = nil
		}
		e.mu.Unlock()
		if ctx.Err() != nil {
			return
		}
		// Give the memory used by the gzip and transfer buffers back.
		debug.FreeOSMemory()
		select {
		case e.wake <- struct{}{}:
		default:
		}
	}
}

// uploadOne sends one log, retrying as the failure allows. It returns true when
// the server rejected the token.
//
// Connectivity errors are retried forever with a growing delay; a dial that
// fails never starts compressing because the multipart pipe blocks until the
// request is being written. A 5xx is retried every RetryMax for ServerRetryFor
// and then marked failed. Any other 4xx fails at once.
func (e *Engine) uploadOne(ctx context.Context, j job) (rejected bool) {
	log := e.cfg.Logger.With("file", j.path, "size", j.size)
	delay := e.cfg.RetryBase
	var serverWaited time.Duration
	log.Info("uploading", "file", j.path, "size", formatSize(j.size))
	for {
		e.mu.Lock()
		token, fast := e.token, e.wowUp
		if token == "" || token == e.rejectedToken {
			// Signed out while retrying; the tracker still has it queued.
			e.mu.Unlock()
			return false
		}
		e.setStatus(Status{State: StateUploading, Detail: "Uploading your log…", ReportURL: e.status.ReportURL})
		e.mu.Unlock()

		res, err := e.cfg.Upload(ctx, token, j.path, j.size, fast)
		var serverErr *upload.Error
		switch {
		case err == nil:
			e.finish(j, res)
			return false
		case ctx.Err() != nil:
			return false
		case errors.Is(err, upload.ErrUnauthorized):
			log.Warn("token rejected")
			e.mu.Lock()
			e.rejectedToken = token
			e.mu.Unlock()
			e.cfg.Notify("Chronicle", "Chronicle needs you to sign in again.")
			return true
		case errors.As(err, &serverErr) && upload.Retryable(err):
			if serverWaited >= e.cfg.ServerRetryFor {
				log.Error("giving up on server errors", "err", err, "waited", serverWaited)
				e.fail(j, err)
				return false
			}
			log.Warn("server error, will retry", "err", err, "in", e.cfg.RetryMax)
			e.retryStatus(fmt.Sprintf("Chronicle is having trouble. Retrying in %s…", e.cfg.RetryMax.Round(time.Second)))
			e.wait(ctx, e.cfg.RetryMax)
			serverWaited += e.cfg.RetryMax
		case upload.Retryable(err):
			log.Warn("upload failed, will retry", "err", err, "in", delay)
			e.retryStatus(fmt.Sprintf("Can't reach Chronicle. Retrying in %s…", delay.Round(time.Second)))
			e.wait(ctx, delay)
			delay = min(delay*2, e.cfg.RetryMax)
		default:
			log.Error("upload failed", "err", err)
			e.fail(j, err)
			return false
		}
	}
}

func (e *Engine) retryStatus(detail string) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.setStatus(Status{State: StateUploading, Detail: detail, ReportURL: e.status.ReportURL})
}

// fail records a permanent failure and tells the user once.
func (e *Engine) fail(j job, err error) {
	e.mu.Lock()
	e.tracker.MarkFailed(j.path, j.size)
	e.mu.Unlock()
	e.cfg.Notify("Chronicle upload failed", err.Error())
}

func (e *Engine) finish(f job, res upload.Result) {
	e.mu.Lock()
	e.tracker.MarkUploaded(f.path, f.size)
	err := e.cfg.Store.Update(func(s *store.State) {
		if s.Uploaded == nil {
			s.Uploaded = map[string]int64{}
		}
		s.Uploaded[f.path] = f.size
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
		e.cfg.Logger.Info("already uploaded →", "url", url)
	} else {
		e.cfg.Logger.Info("uploaded →", "url", url)
		if d := e.sessionLength(); d >= time.Minute {
			detail = fmt.Sprintf("Your %s session is on Chronicle.", formatDuration(d))
		}
	}
	e.lastUploaded = Status{State: StateUploaded, Detail: detail, ReportURL: url}
	e.uploadedUntil = e.now.Add(uploadedStickiness)
	e.setStatus(e.lastUploaded)
	e.mu.Unlock()
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
