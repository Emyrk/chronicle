package watch

import (
	"context"

	"golang.org/x/sys/unix"
)

// List reads the kernel's process table with one kern.proc.all sysctl.
func (systemProcs) List(_ context.Context) ([]Process, error) {
	procs, err := unix.SysctlKinfoProcSlice("kern.proc.all")
	if err != nil {
		return nil, err
	}
	out := make([]Process, 0, len(procs))
	for i := range procs {
		comm := procs[i].Proc.P_comm
		name := make([]byte, 0, len(comm))
		for _, c := range comm {
			if c == 0 {
				break
			}
			name = append(name, byte(c))
		}
		out = append(out, Process{PID: procs[i].Proc.P_pid, Name: string(name)})
	}
	return out, nil
}
