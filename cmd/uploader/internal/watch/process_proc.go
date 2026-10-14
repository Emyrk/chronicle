//go:build !windows && !darwin

package watch

import (
	"context"
	"os"
	"strconv"
	"strings"
)

// systemProcs is the real process table; /proc needs no per-pid state.
type systemProcs struct{}

// Exists reports whether /proc/<pid>/comm still carries name.
func (*systemProcs) Exists(_ context.Context, pid int32, name string) (bool, error) {
	comm, err := os.ReadFile("/proc/" + strconv.Itoa(int(pid)) + "/comm")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(string(comm)) == name, nil
}

// List reads /proc once: a directory listing plus each process's short name.
func (*systemProcs) List(_ context.Context) ([]Process, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	out := make([]Process, 0, len(entries))
	for _, e := range entries {
		pid, err := strconv.ParseInt(e.Name(), 10, 32)
		if err != nil {
			continue
		}
		comm, err := os.ReadFile("/proc/" + e.Name() + "/comm")
		if err != nil {
			continue
		}
		out = append(out, Process{PID: int32(pid), Name: strings.TrimSpace(string(comm))})
	}
	return out, nil
}
