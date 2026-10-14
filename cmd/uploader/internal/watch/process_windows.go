package watch

import (
	"context"
	"path/filepath"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// systemProcs is the real process table. It keeps one open handle to the known
// game process: a handle names the process object, not the pid, so it stays
// this process after the pid is recycled and is signalled once it exits.
type systemProcs struct {
	h   windows.Handle
	pid int32
}

// Exists reports whether pid is still the live process named name. The handle
// is opened on first sight of a pid and its image name checked once.
func (s *systemProcs) Exists(_ context.Context, pid int32, name string) (bool, error) {
	if s.h == 0 || s.pid != pid {
		s.close()
		h, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
		if err != nil {
			return false, err
		}
		var buf [windows.MAX_LONG_PATH]uint16
		n := uint32(len(buf))
		if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &n); err != nil {
			_ = windows.CloseHandle(h)
			return false, err
		}
		if !strings.EqualFold(filepath.Base(windows.UTF16ToString(buf[:n])), name) {
			_ = windows.CloseHandle(h)
			return false, nil
		}
		s.h, s.pid = h, pid
	}
	ev, err := windows.WaitForSingleObject(s.h, 0)
	if err != nil {
		s.close()
		return false, err
	}
	if ev != uint32(windows.WAIT_TIMEOUT) {
		s.close()
		return false, nil
	}
	return true, nil
}

func (s *systemProcs) close() {
	if s.h != 0 {
		_ = windows.CloseHandle(s.h)
		s.h, s.pid = 0, 0
	}
}

// List takes one Toolhelp32 snapshot, which carries every process's name.
func (*systemProcs) List(_ context.Context) ([]Process, error) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	var out []Process
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		out = append(out, Process{PID: int32(e.ProcessID), Name: windows.UTF16ToString(e.ExeFile[:])})
	}
	return out, nil
}
