//go:build !windows

package main

func platformIcon(imgs []sizedPNG) []byte { return imgs[len(imgs)-1].data }
