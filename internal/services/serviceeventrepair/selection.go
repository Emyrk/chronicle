package serviceeventrepair

import (
	"fmt"
	"github.com/google/uuid"
	"net/url"
	"strings"
)

func validateSelection(r CreateRequest) (CreateRequest, error) {
	if r.Operation != OperationRazorgore {
		return r, fmt.Errorf("%w: unknown operation", ErrInvalid)
	}
	r.Instance = strings.TrimSpace(r.Instance)
	if r.Instance != "" {
		if strings.Contains(r.Instance, "://") {
			u, err := url.Parse(r.Instance)
			if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
				return r, fmt.Errorf("%w: invalid instance URL", ErrInvalid)
			}
			parts := strings.Split(strings.Trim(u.Path, "/"), "/")
			found := ""
			for i, p := range parts {
				if (p == "instances" || p == "instance") && i+1 < len(parts) {
					found = parts[i+1]
					break
				}
			}
			if found == "" {
				return r, fmt.Errorf("%w: URL must contain an instance path", ErrInvalid)
			}
			r.Instance = found
		}
		if strings.ContainsAny(r.Instance, "/?#") {
			return r, fmt.Errorf("%w: invalid instance identifier", ErrInvalid)
		}
		if r.Limit != 0 || r.RealmID != uuid.Nil || r.After != nil || r.Before != nil {
			return r, fmt.Errorf("%w: instance selection cannot include sweep filters", ErrInvalid)
		}
	} else {
		if r.TenantID == uuid.Nil {
			return r, fmt.Errorf("%w: sweep requires an explicit tenant", ErrInvalid)
		}
		if r.Limit < 1 || r.Limit > 1000 {
			return r, fmt.Errorf("%w: sweep limit must be 1..1000", ErrInvalid)
		}
	}
	if r.After != nil && r.Before != nil && !r.After.Before(*r.Before) {
		return r, fmt.Errorf("%w: after must precede before", ErrInvalid)
	}
	return r, nil
}
