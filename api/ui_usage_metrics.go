package api

import (
	"net/http"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const (
	maxUIUsagePanels     = 8
	maxUIUsageSelections = 32
	maxUIUsageBodyBytes  = 4 * 1024
)

var knownUIPanels = map[string]struct{}{
	"absorbed_damage":           {},
	"activity_log":              {},
	"all_activity":              {},
	"aura_uptime":               {},
	"companion_stats":           {},
	"comparison":                {},
	"consumables":               {},
	"consumables_ledger":        {},
	"cooldown_usage":            {},
	"damage_done":               {},
	"damage_done_friendly_fire": {},
	"damage_taken":              {},
	"death_log":                 {},
	"deaths":                    {},
	"dispel_log":                {},
	"dispels_done":              {},
	"dispels_received":          {},
	"enemy_damage_done":         {},
	"enemy_damage_taken":        {},
	"equipment":                 {},
	"extra_attacks":             {},
	"faerie_fire":               {},
	"friendly_class_buffs":      {},
	"guilds":                    {},
	"healer_casts":              {},
	"healing_done":              {},
	"healing_taken":             {},
	"innervate":                 {},
	"interrupt_log":             {},
	"interrupts":                {},
	"judgement":                 {},
	"leaderboard":               {},
	"logging_metadata":          {},
	"loot":                      {},
	"map":                       {},
	"metrics":                   {},
	"mini_map":                  {},
	"mitigation":                {},
	"periods":                   {},
	"pet_damage_done":           {},
	"player_timeline":           {},
	"possession":                {},
	"pulls_and_cleanup":         {},
	"raid_composition":          {},
	"raid_frames":               {},
	"ranking_records":           {},
	"resource_regen":            {},
	"resists":                   {},
	"roles":                     {},
	"rotations":                 {},
	"spell_count":               {},
	"status":                    {},
	"sunder":                    {},
	"timeline":                  {},
	"unit_auras":                {},
	"unit_lookup":               {},
	"vehicle":                   {},
	"vulnerability_effect":      {},
}

var knownUIPresets = map[string]struct{}{
	"damage":          {},
	"deaths":          {},
	"dispels":         {},
	"healing":         {},
	"interrupts":      {},
	"loot":            {},
	"map":             {},
	"meta":            {},
	"player_timeline": {},
	"summary":         {},
}

type uiUsageMetrics struct {
	panelViews   *prometheus.CounterVec
	panelChoices *prometheus.CounterVec
	presetViews  *prometheus.CounterVec
}

func newUIUsageMetrics(registerer prometheus.Registerer) *uiUsageMetrics {
	factory := promauto.With(registerer)
	return &uiUsageMetrics{
		panelViews: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "ui",
			Name:      "panel_views_total",
			Help:      "Panels present in stable layouts reported by the browser.",
		}, []string{"panel"}),
		panelChoices: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "ui",
			Name:      "panel_choices_total",
			Help:      "Panels explicitly selected by users.",
		}, []string{"panel"}),
		presetViews: factory.NewCounterVec(prometheus.CounterOpts{
			Namespace: "chronicle",
			Subsystem: "ui",
			Name:      "preset_views_total",
			Help:      "Preset activations reported by the browser.",
		}, []string{"preset"}),
	}
}

func normalizeUIPanel(panel string) string {
	if panel == "custom" || panel == "lua" {
		return panel
	}
	if _, ok := knownUIPanels[panel]; ok {
		return panel
	}
	return "unknown"
}

func normalizeUIPreset(preset string) string {
	if _, ok := knownUIPresets[preset]; ok {
		return preset
	}
	return "unknown"
}

// RecordUIUsage records anonymous, process-local UI usage counters.
func (api *API) RecordUIUsage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	r.Body = http.MaxBytesReader(w, r.Body, maxUIUsageBodyBytes)
	var req chroniclesdk.UIUsageRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if len(req.Panels) > maxUIUsagePanels {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "too many panels"})
		return
	}
	if len(req.Selected) > maxUIUsageSelections {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "too many panel selections"})
		return
	}

	if req.Preset != nil && *req.Preset != "" {
		api.uiUsageMetrics.presetViews.WithLabelValues(normalizeUIPreset(*req.Preset)).Inc()
	}
	for _, selected := range req.Selected {
		if selected != "" {
			api.uiUsageMetrics.panelChoices.WithLabelValues(normalizeUIPanel(selected)).Inc()
		}
	}
	for _, panel := range req.Panels {
		if panel != "" {
			api.uiUsageMetrics.panelViews.WithLabelValues(normalizeUIPanel(panel)).Inc()
		}
	}

	httpapi.Write(ctx, w, http.StatusNoContent, nil)
}
