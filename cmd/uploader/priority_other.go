//go:build !windows

package main

import "syscall"

// lowerPriority makes the uploader yield to the game. Best effort: on Linux
// the nice value is per thread, so only the threads started from here inherit it.
func lowerPriority() error {
	return syscall.Setpriority(syscall.PRIO_PROCESS, 0, 10)
}
