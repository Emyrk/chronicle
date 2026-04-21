package registry

import "log/slog"

func WarmaneRegistry(logger *slog.Logger) *Registry {
	r := NewRegistry(logger)

	return r
}
