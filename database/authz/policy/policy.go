package policy

import (
	_ "embed"

	"github.com/Emyrk/zedgen/relbuilder"
)

//go:embed schema.zed
var Schema string

//go:generate rm -f policy_gen.go
//go:generate go tool zedgen -schema schema.zed -package policy -out policy_gen.go

func GlobalChronicle() *ObjChronicle {
	return New().Chronicle(relbuilder.String("chronicle"))
}

func (b *SchemaBuilder) GlobalChronicle() *ObjChronicle {
	return GlobalChronicle()
}
