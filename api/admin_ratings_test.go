package api

import (
	"bytes"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/stretchr/testify/require"
)

func TestAdminRatingPolicyValidation(t *testing.T) {
	t.Parallel()
	valid := chroniclesdk.AdminPutRatingGroupPolicyRequest{Version: 1, PeriodDays: 30, HalfLifeDays: 7, BestWeight: 0.5, FormWeight: 0.3, FloorWeight: 0.2, RankOneWeight: 0.5, FullRankKills: 10}
	require.True(t, validRatingPolicy(valid))
	cases := map[string]func(*chroniclesdk.AdminPutRatingGroupPolicyRequest){
		"missing version":       func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.Version = 0 },
		"negative duration":     func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.HalfLifeDays = -1 },
		"nonfinite duration":    func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.HalfLifeDays = math.Inf(1) },
		"negative weight":       func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.BestWeight = -1 },
		"incorrect sum":         func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.BestWeight = 0.6 },
		"nonfinite weight":      func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.FormWeight = math.NaN() },
		"zero kills":            func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.FullRankKills = 0 },
		"rank one out of range": func(p *chroniclesdk.AdminPutRatingGroupPolicyRequest) { p.RankOneWeight = 2 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) { t.Parallel(); p := valid; mutate(&p); require.False(t, validRatingPolicy(p)) })
	}
}

func TestAdminRatingRaidPolicyValidation(t *testing.T) {
	t.Parallel()
	valid := chroniclesdk.AdminPutRatingRaidPolicyRequest{ExpectedVersion: 1, InstanceName: "Molten Core", PeakWeight: 1, MasteryWeight: 2}
	require.True(t, validRatingRaidPolicy(valid))
	cases := map[string]func(*chroniclesdk.AdminPutRatingRaidPolicyRequest){
		"missing version":         func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.ExpectedVersion = 0 },
		"blank instance":          func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.InstanceName = " " },
		"zero peak weight":        func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.PeakWeight = 0 },
		"negative mastery weight": func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.MasteryWeight = -1 },
		"infinite peak weight":    func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.PeakWeight = math.Inf(1) },
		"nan mastery weight":      func(p *chroniclesdk.AdminPutRatingRaidPolicyRequest) { p.MasteryWeight = math.NaN() },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			p := valid
			mutate(&p)
			require.False(t, validRatingRaidPolicy(p))
		})
	}
}

func TestAdminRatingRequestLimit(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodPut, "/", bytes.NewReader([]byte(`{"name":"`+strings.Repeat("x", ratingAdminBodyLimit)+`"}`)))
	rec := httptest.NewRecorder()
	var name chroniclesdk.AdminRenameRatingGroupRequest
	require.False(t, ratingAdminRead(rec, req, &name))
	require.NotEqual(t, http.StatusOK, rec.Code)
}

func TestAdminRatingGroupName(t *testing.T) {
	t.Parallel()
	require.True(t, ratingAdminName("Raid A"))
	for _, s := range []string{"", "  ", " leading", "trailing ", strings.Repeat("a", 201)} {
		require.False(t, ratingAdminName(s))
	}
}
