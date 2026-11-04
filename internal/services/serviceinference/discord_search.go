package serviceinference

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strings"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/Emyrk/chronicle/internal/instancesearch"
	"github.com/Emyrk/chronicle/internal/ratelimit"
	"github.com/Emyrk/chronicle/internal/services/servicetenant"
	"github.com/google/uuid"
)

type discordSearchTenant struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

func (s *Service) describeInstanceSearch(tc toolContext, args string) (string, error) {
	var in struct{}
	if err := decodeStrict(args, &in); err != nil {
		return "", err
	}
	tenant, err := s.resolveSearchTenant(tc.tenantSlug)
	if err != nil {
		return "", err
	}
	return boundedJSON(struct {
		Tenant discordSearchTenant                       `json:"tenant"`
		Search chroniclesdk.InstanceSearchFieldsResponse `json:"search"`
	}{Tenant: discordSearchTenant{Slug: tenant.Slug.String, Name: tenant.Name}, Search: instancesearch.Describe()})
}

func (s *Service) resolveSearchTenant(slug string) (database.Tenant, error) {
	if slug == "" || len(slug) > 100 || s.tenant == nil {
		return database.Tenant{}, errors.New("set a valid default tenant with /chronicle set tenant first")
	}
	tenant, ok := s.tenant.GetTenantBySlug(slug)
	if !ok || !tenant.Slug.Valid || !strings.EqualFold(tenant.Slug.String, slug) {
		return database.Tenant{}, errors.New("the saved tenant is no longer available")
	}
	return tenant, nil
}

func (s *Service) tenantInstanceURL(tenant database.Tenant, result chroniclesdk.InstanceSearchResult) string {
	base := &url.URL{}
	if s.accessURL != nil {
		*base = *s.accessURL
	}
	if base.Scheme == "" {
		base.Scheme = "https"
	}
	if s.tenant != nil && s.tenant.PrimaryDomain() != "" && tenant.Slug.Valid {
		base.Host = tenant.Slug.String + "." + s.tenant.PrimaryDomain()
	}
	base.Path = "/instances/" + result.Slug
	if result.Slug == "" {
		base.Path = "/instances/" + result.ID.String()
	}
	base.RawQuery = ""
	base.Fragment = ""
	return base.String()
}

func (s *Service) instanceSearchUserLimit(ctx context.Context, userID uuid.UUID) (ratelimit.Limit, error) {
	actor := policy.New().User(userID)
	chronicle := policy.New().GlobalChronicle()
	permissions, err := s.zed.Check(ctx, nil,
		chronicle.CanHas_exalted_User(actor),
		chronicle.CanHas_revered_User(actor),
		chronicle.CanHas_honored_User(actor),
	)
	if err != nil {
		return ratelimit.Limit{}, err
	}
	if len(permissions) != 3 {
		return ratelimit.Limit{}, errors.New("check instance search supporter tier: expected 3 permission results")
	}
	burst := float64(100)
	if permissions[0] {
		burst = 2000
	} else if permissions[1] {
		burst = 800
	} else if permissions[2] {
		burst = 300
	}
	return ratelimit.PerMinute(60, burst), nil
}

func (s *Service) searchInstances(ctx context.Context, tc toolContext, args string) (string, error) {
	var in struct {
		Where *chroniclesdk.InstanceSearchNode `json:"where"`
		Limit int                              `json:"limit"`
	}
	if err := decodeStrict(args, &in); err != nil {
		return "", err
	}
	if tc.userID == uuid.Nil {
		return "", errors.New("authenticated user context required")
	}
	if in.Limit == 0 {
		in.Limit = 5
	}
	if in.Limit < 1 || in.Limit > 10 {
		return "", errors.New("limit must be 1-10")
	}
	tenant, err := s.resolveSearchTenant(tc.tenantSlug)
	if err != nil {
		return "", err
	}
	searchCtx := servicetenant.WithTenant(ctx, tenant)
	query := chroniclesdk.InstanceSearchQuery{Where: in.Where, Limit: in.Limit}
	compiled, err := instancesearch.CompileForContext(searchCtx, query, instancesearch.Options{})
	if err != nil {
		return "", fmt.Errorf("invalid instance search: %w", err)
	}
	limiter := ratelimit.New(s.db, "instance_search", ratelimit.PerMinute(60, 100))
	userLimit, err := s.instanceSearchUserLimit(searchCtx, tc.userID)
	if err != nil {
		return "", fmt.Errorf("resolve instance search rate limit: %w", err)
	}
	limitResult, err := limiter.TakeWithLimit(searchCtx, ratelimit.UserSubject(tc.userID.String()), float64(compiled.Cost), userLimit)
	if err != nil {
		return "", fmt.Errorf("instance search rate limit: %w", err)
	}
	if !limitResult.Allowed {
		if float64(compiled.Cost) > userLimit.Burst {
			return "", errors.New("instance search is too complex; remove some filters")
		}
		seconds := int64(math.Ceil(limitResult.RetryAfter.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
		return "", fmt.Errorf("instance search rate limited; retry in %d seconds", seconds)
	}
	page, err := instancesearch.Search(searchCtx, s.db, compiled, instancesearch.SearchOptions{})
	if errors.Is(err, instancesearch.ErrTimeout) {
		return "", errors.New("instance search timed out; narrow it with a zone, realm, guild, or date")
	}
	if err != nil {
		return "", err
	}
	type result struct {
		chroniclesdk.InstanceSearchResult
		URL string `json:"url"`
	}
	results := make([]result, 0, len(page.Results))
	for _, row := range page.Results {
		results = append(results, result{InstanceSearchResult: row, URL: s.tenantInstanceURL(tenant, row)})
	}
	return boundedJSON(struct {
		Tenant  discordSearchTenant `json:"tenant"`
		Cost    int                 `json:"cost"`
		Results []result            `json:"results"`
	}{Tenant: discordSearchTenant{Slug: tenant.Slug.String, Name: tenant.Name}, Cost: compiled.Cost, Results: results})
}
