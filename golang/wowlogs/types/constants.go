//go:generate go tool go-enum -f constants.go
package types

// ENUM(casts, begins to cast, channel, fails casting)
type CastActions string
