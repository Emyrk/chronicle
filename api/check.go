package api

import (
	"fmt"
	"net/http"

	"github.com/Emyrk/chronicle/api/chronauth"
	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
)

func (api *API) checkAuthorization(rw http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := chronauth.MustAuthenticatedClaims(ctx)

	var params chroniclesdk.AuthorizationRequest
	if !httpapi.Read(ctx, rw, r, &params) {
		return
	}

	usr := policy.New().User(claims.Subject)

	// Prevent abuse from this endpoint.
	const maxChecks = 25
	if len(params.Checks) > maxChecks {
		httpapi.Write(ctx, rw, http.StatusBadRequest, chroniclesdk.Response{
			Message: fmt.Sprintf(
				"Endpoint only supports %d checks at a time, found %d.",
				maxChecks, len(params.Checks),
			),
		})
		return
	}

	// Build permission checks for SpiceDB
	// We need to maintain order for response mapping
	type checkEntry struct {
		key string
		rel rel.Relationship
	}
	var checks []checkEntry

	response := make(chroniclesdk.AuthorizationResponse)

	for k, v := range params.Checks {
		if v == "" {
			httpapi.Write(ctx, rw, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Object string must be defined for key %q.", k),
			})
			return
		}

		// Parse SpiceDB-style object string: "type:id#permission"
		objectType, objectID, permission, err := rel.ParseObjectSet(v)
		if err != nil {
			httpapi.Write(ctx, rw, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Invalid object format for key %q: %v. Expected format: type:id#permission", k, err),
			})
			return
		}

		if permission == "" {
			httpapi.Write(ctx, rw, http.StatusBadRequest, chroniclesdk.Response{
				Message: fmt.Sprintf("Permission (relation) must be specified for key %q. Expected format: type:id#permission", k),
			})
			return
		}

		// Build the relationship for the permission check
		// Resource is the object being checked, subject is the user
		checks = append(checks, checkEntry{
			key: k,
			rel: rel.Relationship{
				ResourceType:     objectType,
				ResourceID:       objectID,
				ResourceRelation: permission,
				SubjectType:      usr.Object().ObjectType,
				SubjectID:        usr.Object().ObjectId,
			},
		})
	}

	// If no checks to perform, return empty response
	if len(checks) == 0 {
		httpapi.Write(ctx, rw, http.StatusOK, response)
		return
	}

	// Perform batch check with SpiceDB
	rels := make([]rel.Interface, len(checks))
	for i, c := range checks {
		rels[i] = c.rel
	}

	results, err := api.Zed.Check(ctx, nil, rels...)
	if err != nil {
		httpapi.InternalServerError(rw, err)
		return
	}

	// Map results back to response
	for i, c := range checks {
		response[c.key] = results[i]
	}

	httpapi.Write(ctx, rw, http.StatusOK, response)
}
