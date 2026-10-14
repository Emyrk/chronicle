package watch

import (
	"context"
	"encoding/binary"
	"unsafe"

	"golang.org/x/sys/unix"
)

// szomb is the BSD process state of an exited process its parent has not yet
// waited for (sys/proc.h). Such a pid still passes kill(pid, 0), and modern
// XNU reports it as SRUN in kinfo_proc, so kern.proc.* cannot tell.
const szomb = 5

// proc_info(2) call and flavor, and the layout of struct proc_bsdinfo
// (sys/proc_info.h): pbi_flags, pbi_status, ... are uint32s, and pbi_comm
// follows twelve of them.
const (
	procInfoCallPidInfo = 2
	procPidTBSDInfo     = 3
	bsdInfoSize         = 136
	bsdInfoStatus       = 4
	bsdInfoComm         = 48
	bsdInfoCommLen      = 16
)

// systemProcs is the real process table; the kernel needs no per-pid state.
type systemProcs struct{}

// Exists reports whether pid is still a live, non-zombie process named name.
// The state comes from proc_pidinfo(PROC_PIDTBSDINFO), which is what ps uses
// for its Z column.
func (*systemProcs) Exists(_ context.Context, pid int32, name string) (bool, error) {
	var buf [bsdInfoSize]byte
	n, _, errno := unix.Syscall6(unix.SYS_PROC_INFO, procInfoCallPidInfo, uintptr(pid),
		procPidTBSDInfo, 0, uintptr(unsafe.Pointer(&buf[0])), bsdInfoSize)
	if errno != 0 {
		return false, errno
	}
	if n < bsdInfoComm+bsdInfoCommLen {
		return false, nil
	}
	status := binary.LittleEndian.Uint32(buf[bsdInfoStatus:])
	return status != szomb && sameComm(commName(buf[bsdInfoComm:bsdInfoComm+bsdInfoCommLen]), name), nil
}

// sameComm compares two renderings of one process name, either of which the
// kernel may have truncated (pbi_comm holds one byte less than p_comm).
func sameComm(a, b string) bool {
	n := min(len(a), len(b))
	return n > 0 && a[:n] == b[:n]
}

func commName(comm []byte) string {
	n := 0
	for n < len(comm) && comm[n] != 0 {
		n++
	}
	return string(comm[:n])
}

// List reads the kernel's process table with one kern.proc.all sysctl. It
// cannot see zombies; Game confirms a name match through Exists.
func (*systemProcs) List(_ context.Context) ([]Process, error) {
	procs, err := unix.SysctlKinfoProcSlice("kern.proc.all")
	if err != nil {
		return nil, err
	}
	out := make([]Process, 0, len(procs))
	for i := range procs {
		out = append(out, Process{PID: procs[i].Proc.P_pid, Name: commName(procs[i].Proc.P_comm[:])})
	}
	return out, nil
}
