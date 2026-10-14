package main

import "golang.org/x/sys/windows"

// lowerPriority makes the uploader yield to the game.
func lowerPriority() error {
	return windows.SetPriorityClass(windows.CurrentProcess(), windows.BELOW_NORMAL_PRIORITY_CLASS)
}
