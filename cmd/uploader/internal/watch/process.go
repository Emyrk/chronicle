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
	// Exists reports whether pid is still the live process that List reported
	// under name: not exited, not a zombie, not a recycled pid.
	Exists(ctx context.Context, pid int32, name string) (bool, error)
}

// Game detects whether a WoW client is running, cheaply. Once a client's pid is
// known only that pid is polled; the process table is listed only while no pid
// is known. Not safe for concurrent use.
type Game struct {
	procs  Procs
	names  map[string]bool
	prefix []string

	pid     int32
	name    string // the known client's process name
	up      bool   // last reported state
	missed  bool   // a poll already found the game gone
	exeScan time.Time
	// rejected holds pids whose exe path was resolved and found outside the
	// install dirs, so the exe scan never resolves them again.
	rejected map[int32]bool
	now      func() time.Time
}

// NewGame returns a Game for the layout. procs is nil for the real process
// table.
func NewGame(l tenant.Layout, procs Procs) *Game {
	if procs == nil {
		procs = &systemProcs{}
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
// pid and name. Otherwise one process snapshot is matched by name, and at most
// every exeScanEvery by whether the executable of a not yet rejected process
// lives inside one of installDirs.
// "Not running" is reported only on the second consecutive miss, so one
// transient failure is not mistaken for the game exiting.
func (g *Game) Running(ctx context.Context, installDirs []string) bool {
	if g.pid != 0 {
		if ok, err := g.procs.Exists(ctx, g.pid, g.name); err == nil && ok {
			return true
		}
		g.pid = 0
	}
	if p, ok := g.find(ctx, installDirs); ok {
		g.pid, g.name, g.up, g.missed = p.PID, p.Name, true, false
		return true
	}
	if g.up && !g.missed {
		g.missed = true
		return true
	}
	g.up, g.missed = false, false
	return false
}

func (g *Game) find(ctx context.Context, installDirs []string) (Process, bool) {
	procs, err := g.procs.List(ctx)
	if err != nil {
		return Process{}, false
	}
	for _, p := range procs {
		if g.matchName(p.Name) {
			return p, true
		}
	}
	live := make(map[int32]bool, len(procs))
	for _, p := range procs {
		live[p.PID] = true
	}
	for pid := range g.rejected {
		if !live[pid] {
			delete(g.rejected, pid)
		}
	}
	if len(installDirs) == 0 || g.now().Sub(g.exeScan) < exeScanEvery {
		return Process{}, false
	}
	g.exeScan = g.now()
	if g.rejected == nil {
		g.rejected = map[int32]bool{}
	}
	for _, p := range procs {
		if g.rejected[p.PID] {
			continue
		}
		g.rejected[p.PID] = true
		if exe, err := g.procs.Exe(ctx, p.PID); err == nil && underAny(exe, installDirs) {
			delete(g.rejected, p.PID)
			return p, true
		}
	}
	return Process{}, false
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

// systemProcs is the real process table. The type, List and Exists are per-OS
// (process_*.go).

func (*systemProcs) Exe(ctx context.Context, pid int32) (string, error) {
	p, err := process.NewProcessWithContext(ctx, pid)
	if err != nil {
		return "", err
	}
	return p.ExeWithContext(ctx)
}
