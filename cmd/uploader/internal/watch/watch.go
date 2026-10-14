// Package watch decides when a combat log should be uploaded.
package watch

import (
	"os"
	"path/filepath"
	"sort"
	"time"
)

// File is a combat log file and its size at the time of the poll.
type File struct {
	Path string
	Size int64
}

// LogFiles lists WoWCombatLog.txt and WoWCombatLog-*.txt (the latter is what
// the combatLogUniqueFilename CVar produces) in each log directory. Sizes are
// polled rather than watched: the client flushes in large batches and
// filesystem notifications are unreliable across OSes.
func LogFiles(logDirs []string) []File {
	var out []File
	for _, dir := range logDirs {
		var paths []string
		for _, pattern := range []string{"WoWCombatLog.txt", "WoWCombatLog-*.txt"} {
			matches, _ := filepath.Glob(filepath.Join(dir, pattern))
			paths = append(paths, matches...)
		}
		sort.Strings(paths)
		for _, p := range paths {
			fi, err := os.Stat(p)
			if err != nil || fi.IsDir() {
				continue
			}
			out = append(out, File{Path: p, Size: fi.Size()})
		}
	}
	return out
}

// Trigger configures which events queue a log for upload. A manual request is
// passed to Observe directly.
type Trigger struct {
	// OnExit uploads when the WoW process exits.
	OnExit bool
	// OnIdle uploads once the log has not grown for IdleAfter.
	OnIdle    bool
	IdleAfter time.Duration
}

type track struct {
	size     int64
	grew     time.Time // zero: unchanged since before we started watching
	uploaded int64     // size last uploaded, -1 for never
	failed   int64     // size that failed permanently, -1 for none
	queued   bool
}

// Tracker follows log growth and WoW's lifecycle.
type Tracker struct {
	files      map[string]*track
	seeded     bool
	wasRunning bool
	recording  bool
}

// NewTracker returns a Tracker. uploaded maps a log path to the size that was
// already uploaded in a previous run.
func NewTracker(uploaded map[string]int64) *Tracker {
	t := &Tracker{files: map[string]*track{}}
	for p, size := range uploaded {
		t.files[p] = &track{size: size, uploaded: size, failed: -1}
	}
	return t
}

// Observe records one poll and returns the files that should be uploaded now.
// A file stays queued until MarkUploaded or MarkFailed is called for it, so a
// trigger is never lost to a temporary problem such as being signed out.
// Recording reports whether any log grew within the idle window.
func (t *Tracker) Observe(now time.Time, files []File, wowRunning, manual bool, trig Trigger) (upload []File, recording bool) {
	// The first poll with WoW not running behaves like an exit: it picks up a
	// log left over from a session that ended while the helper was not running.
	exited := !wowRunning && (!t.seeded || t.wasRunning)
	t.wasRunning = wowRunning

	for _, f := range files {
		tr := t.files[f.Path]
		switch {
		case tr == nil:
			tr = &track{size: f.Size, uploaded: -1, failed: -1}
			if t.seeded {
				tr.grew = now
			}
			t.files[f.Path] = tr
		case f.Size != tr.size:
			tr.size = f.Size
			tr.grew = now
		}

		dirty := f.Size > 0 && f.Size != tr.uploaded
		if !dirty {
			tr.queued = false
			continue
		}
		idle := now.Sub(tr.grew) >= trig.IdleAfter
		if !tr.grew.IsZero() && now.Sub(tr.grew) < trig.IdleAfter {
			recording = true
		}
		failed := f.Size == tr.failed
		switch {
		case manual:
			tr.queued = true
		case failed:
			// Don't retry a permanent failure until the log changes.
		case trig.OnExit && exited, trig.OnIdle && idle:
			tr.queued = true
		}
		if tr.queued {
			upload = append(upload, f)
		}
	}
	t.seeded = true
	t.recording = recording
	return upload, recording
}

// MarkUploaded records that size bytes of path reached the server.
func (t *Tracker) MarkUploaded(path string, size int64) {
	if tr := t.files[path]; tr != nil {
		tr.uploaded, tr.failed, tr.queued = size, -1, false
	}
}

// MarkFailed records a permanent failure; the file is not retried until it
// changes or the user asks for an upload.
func (t *Tracker) MarkFailed(path string, size int64) {
	if tr := t.files[path]; tr != nil {
		tr.failed, tr.queued = size, false
	}
}
