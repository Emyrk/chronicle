// Package formats names wire encodings independently of expansion rules.
// IDs match the existing log metadata, without importing database models.
package formats

type ID string

const (
	VanillaCompanion ID = "1.12a-cc-addon"
	TBCCompanion     ID = "2.4.3-cc-addon"
	WrathCompanion   ID = "3.3.5a-cc-addon"
	AzerothCore      ID = "azerothcore-mod"
	CLEUv22          ID = "v22-cleu"
)
