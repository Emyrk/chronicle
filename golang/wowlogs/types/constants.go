//go:generate go tool go-enum -f constants.go
package types

// ENUM(casts, begins to cast, channels, fails casting)
type CastActions string
