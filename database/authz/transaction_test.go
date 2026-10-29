package authz

import (
	"testing"

	v1 "github.com/authzed/authzed-go/proto/authzed/api/v1"
	"github.com/authzed/gochugaru/rel"
	"github.com/stretchr/testify/require"
)

func TestRelationshipDeletesAreRestoredByRollback(t *testing.T) {
	t.Parallel()

	relationship := rel.Relationship{
		ResourceType:     "lua_project",
		ResourceID:       "project-id",
		ResourceRelation: "owner",
		SubjectType:      "user",
		SubjectID:        "owner-id",
	}
	concurrent := relationship
	concurrent.ResourceRelation = "editor"
	concurrent.SubjectID = "concurrent-user"

	// Only the snapshotted relationship becomes part of this transaction. A
	// concurrently added relationship is intentionally absent from its deletes
	// and therefore from rollback compensation.
	deletes := relationshipDeletes([]rel.Relationship{relationship})
	require.Len(t, deletes.V1Updates, 1)
	require.NotEqual(t, concurrent, *rel.FromV1Proto(deletes.V1Updates[0].Relationship))
	require.Equal(t, v1.RelationshipUpdate_OPERATION_DELETE, deletes.V1Updates[0].GetOperation())

	reverts := inverseRelationshipUpdates(deletes)
	require.Len(t, reverts.V1Updates, 1)
	require.Equal(t, v1.RelationshipUpdate_OPERATION_CREATE, reverts.V1Updates[0].GetOperation())
	require.Equal(t, relationship, *rel.FromV1Proto(reverts.V1Updates[0].Relationship))
}
