package watch

import (
	"context"
	"path/filepath"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/process"

	"github.com/Emyrk/chronicle/cmd/uploader/internal/tenant"
)

// exeScanEvery bounds how often every process's executable path is resolved
// (the slow fallback for a client whose name is not in the layout).
const exeScanEvery = 30 * time.Second

// Process is one entry of a process snapshot.
type Process struct {
	PID  int32
	Name string
}

// Procs is the process table. List must be a single snapshot call that also
// yields names; Exe and Exists are per-pid and only used on few pids.
type Procs interface {
	List(ctx context.Context) ([]Process, error)
	Exe(ctx context.Context, pid int32) (string, error)
	Exists(ctx context.Context, pid int32) (bool, error)
}

// Game detects whether a WoW client is running, cheaply. Once a client's pid is
// known only that pid is polled; the process table is listed only while no pid
// is known. Not safe for concurrent use.
type Game struct {
	procs  Procs
	names  map[string]bool
	prefix []string

	pid     int32
	up      bool      // last reported state
	missed  bool      // a poll already found the game gone
	exeScan time.Time // last exe-path scan
	now     func() time.Time
}

// NewGame returns a Game for the layout. procs is nil for the real process
// table.
func NewGame(l tenant.Layout, procs Procs) *Game {
	if procs == nil {
		procs = systemProcs{}
	}
	g := &Game{procs: procs, names: map[string]bool{}, now: time.Now}
	for _, n := range l.ProcessNames {
		g.names[strings.ToLower(n)] = true
	}
	for _, p := range l.ProcessPrefixes {
		g.prefix = append(g.prefix, strings.ToLower(p))
	}
	return g
}

// Running reports whether a WoW client is running. A known client is checked by
// pid. Otherwise one process snapshot is matched by name, and at most every
// exeScanEvery by whether the executable lives inside one of installDirs.
// "Not running" is reported only on the second consecutive miss, so one
// transient failure is not mistaken for the game exiting.
func (g *Game) Running(ctx context.Context, installDirs []string) bool {
	if g.pid != 0 {
		if ok, err := g.procs.Exists(ctx, g.pid); err == nil && ok {
			return true
		}
		g.pid = 0
	}
	if pid := g.find(ctx, installDirs); pid != 0 {
		g.pid, g.up, g.missed = pid, true, false
		return true
	}
	if g.up && !g.missed {
		g.missed = true
		return true
	}
	g.up, g.missed = false, false
	return false
}

func (g *Game) find(ctx context.Context, installDirs []string) int32 {
	procs, err := g.procs.List(ctx)
	if err != nil {
		return 0
	}
	for _, p := range procs {
		if g.matchName(p.Name) {
			return p.PID
		}
	}
	if len(installDirs) == 0 || g.now().Sub(g.exeScan) < exeScanEvery {
		return 0
	}
	g.exeScan = g.now()
	for _, p := range procs {
		if exe, err := g.procs.Exe(ctx, p.PID); err == nil && underAny(exe, installDirs) {
			return p.PID
		}
	}
	return 0
}

// matchName matches a client name. The kernel truncates process names to 15
// characters on some systems, so a name that is a truncated prefix of a layout
// prefix counts too.
func (g *Game) matchName(name string) bool {
	name = strings.ToLower(name)
	if g.names[name] {
		return true
	}
	for _, p := range g.prefix {
		if strings.HasPrefix(name, p) || (len(name) >= 15 && strings.HasPrefix(p, name)) {
			return true
		}
	}
	return false
}

func underAny(path string, dirs []string) bool {
	for _, d := range dirs {
		rel, err := filepath.Rel(d, path)
		if err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
			return true
		}
	}
	return false
}

// systemProcs is the real process table. List is per-OS (process_*.go).
type systemProcs struct{}

func (systemProcs) Exe(ctx context.Context, pid int32) (string, error) {
	p, err := process.NewProcessWithContext(ctx, pid)
	if err != nil {
		return "", err
	}
	return p.ExeWithContext(ctx)
}

func (systemProcs) Exists(ctx context.Context, pid int32) (bool, error) {
	return process.PidExistsWithContext(ctx, pid)
}
