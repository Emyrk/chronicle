package metatypes

import "github.com/Emyrk/chronicle/golang/wowlogs/guid"

type Unit struct {
	Name string
	Gid  guid.GUID
}
