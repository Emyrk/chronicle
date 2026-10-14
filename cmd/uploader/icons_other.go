//go:build !windows

package main

func platformIcon(pngData []byte, _ int) []byte { return pngData }
