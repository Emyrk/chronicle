//go:build !windows && !darwin

package watch

import (
	"context"
	"os"
	"strconv"
	"strings"
)

// List reads /proc once: a directory listing plus each process's short name.
func (systemProcs) List(_ context.Context) ([]Process, error) {
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
