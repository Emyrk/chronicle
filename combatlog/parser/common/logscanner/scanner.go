package logscanner

import (
	"bufio"
	"io"
)

// New returns a line scanner that discards NUL padding between log records.
// Combat log files can contain large sparse regions after an interrupted write;
// consuming the padding incrementally keeps Scanner from treating it as one
// oversized token.
func New(r io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(r)
	scanner.Split(scanLines)
	return scanner
}

func scanLines(data []byte, atEOF bool) (advance int, token []byte, err error) {
	for advance < len(data) && data[advance] == 0 {
		advance++
	}
	if advance > 0 {
		return advance, nil, nil
	}
	return bufio.ScanLines(data, atEOF)
}
