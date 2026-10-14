package watch

import (
	"context"
	"unsafe"

	"golang.org/x/sys/windows"
)

// List takes one Toolhelp32 snapshot, which carries every process's name.
func (systemProcs) List(_ context.Context) ([]Process, error) {
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
