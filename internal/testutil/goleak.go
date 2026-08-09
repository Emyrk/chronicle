package testutil

import "go.uber.org/goleak"

// GoleakOptions is a common list of options to pass to goleak. This is useful if there is a known
// leaky function we want to exclude from goleak.
var GoleakOptions []goleak.Option = []goleak.Option{
	// The pq library appears to leave around a goroutine after Close().
	goleak.IgnoreTopFunction("github.com/lib/pq.NewDialListener"),
	// Gophercraft's global logger starts a console output goroutine during package initialization.
	goleak.IgnoreTopFunction("github.com/Gophercraft/log.(*ConsoleOutput).begin"),
}
