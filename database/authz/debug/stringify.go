package debug

import (
	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/spicedb/pkg/tuple"
)

func RelationshipsToStrings(rels []v1.Relationship) []string {
	allStrings := make([]string, 0)
	for _, r := range rels {
		rStr, err := tuple.V1StringRelationship(&r)
		if err != nil {
			panic(err)
		}
		allStrings = append(allStrings, rStr)
	}
	return allStrings
}
