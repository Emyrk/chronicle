package watch

import (
	"context"

	"golang.org/x/sys/unix"
)

// szomb is the BSD process state of an exited process its parent has not yet
// waited for (sys/proc.h). Such a pid still passes kill(pid, 0).
const szomb = 5

// systemProcs is the real process table; sysctl needs no per-pid state.
type systemProcs struct{}

// Exists reports whether pid is still a live, non-zombie process named name.
func (*systemProcs) Exists(_ context.Context, pid int32, name string) (bool, error) {
	k, err := unix.SysctlKinfoProc("kern.proc.pid", int(pid))
	if err != nil {
		return false, err
	}
	return k.Proc.P_stat != szomb && commName(k.Proc.P_comm[:]) == name, nil
}

func commName(comm []byte) string {
	n := 0
	for n < len(comm) && comm[n] != 0 {
		n++
	}
	return string(comm[:n])
}

// List reads the kernel's process table with one kern.proc.all sysctl.
func (*systemProcs) List(_ context.Context) ([]Process, error) {
	procs, err := unix.SysctlKinfoProcSlice("kern.proc.all")
	if err != nil {
		return nil, err
	}
	out := make([]Process, 0, len(procs))
	for i := range procs {
		if procs[i].Proc.P_stat == szomb {
			continue
		}
		out = append(out, Process{PID: procs[i].Proc.P_pid, Name: commName(procs[i].Proc.P_comm[:])})
	}
	return out, nil
}
