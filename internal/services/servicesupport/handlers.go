package servicesupport

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Emyrk/chronicle/api/chroniclesdk"
	"github.com/Emyrk/chronicle/api/httpapi"
	"github.com/Emyrk/chronicle/database"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func currentMonth() (time.Time, pgtype.Date) {
	now := time.Now().UTC()
	month := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	return month, pgtype.Date{Time: month, Valid: true}
}

func validProvider(provider chroniclesdk.SupportProvider) bool {
	switch provider {
	case chroniclesdk.SupportProviderManual,
		chroniclesdk.SupportProviderPatreon,
		chroniclesdk.SupportProviderGitHubSponsors,
		chroniclesdk.SupportProviderBuyMeACoffee:
		return true
	default:
		return false
	}
}

func validateServiceRequest(req chroniclesdk.CreateSupportServiceRequest) error {
	if !validProvider(req.Provider) {
		return fmt.Errorf("unsupported provider %q", req.Provider)
	}
	if strings.TrimSpace(req.DisplayName) == "" {
		return errors.New("display_name is required")
	}
	if req.ReceivedCents < 0 || req.RecurringCents < 0 {
		return errors.New("support totals cannot be negative")
	}
	if req.PublicURL != "" {
		u, err := url.ParseRequestURI(req.PublicURL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			return errors.New("public_url must be an absolute HTTP or HTTPS URL")
		}
	}
	return nil
}

func supportSettings(setting database.SupportSetting) chroniclesdk.SupportSettings {
	return chroniclesdk.SupportSettings{
		PublicEnabled:    setting.PublicEnabled,
		Currency:         setting.Currency,
		MonthlyGoalCents: setting.MonthlyGoalCents,
		UpdatedAt:        setting.UpdatedAt.Time,
	}
}

func supportService(row database.GetSupportAdminServicesRow) chroniclesdk.SupportService {
	var totalsUpdatedAt *time.Time
	if row.TotalsUpdatedAt.Valid {
		t := row.TotalsUpdatedAt.Time
		totalsUpdatedAt = &t
	}
	return chroniclesdk.SupportService{
		ID:              row.SupportService.ID,
		Provider:        chroniclesdk.SupportProvider(row.SupportService.Provider),
		DisplayName:     row.SupportService.DisplayName,
		PublicURL:       row.SupportService.PublicUrl,
		Enabled:         row.SupportService.Enabled,
		ReceivedCents:   row.ReceivedCents,
		RecurringCents:  row.RecurringCents,
		UpdatedAt:       row.SupportService.UpdatedAt.Time,
		TotalsUpdatedAt: totalsUpdatedAt,
	}
}

func (s *Service) getSummary(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings, err := s.db.GetSupportSettings(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if !settings.PublicEnabled {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "Support totals are not public."})
		return
	}
	month, monthDate := currentMonth()
	rows, err := s.db.GetSupportSummary(ctx, monthDate)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}

	resp := chroniclesdk.SupportSummary{
		Month:            month.Format("2006-01"),
		Currency:         settings.Currency,
		MonthlyGoalCents: settings.MonthlyGoalCents,
		Providers:        make([]chroniclesdk.SupportSummaryProvider, 0, len(rows)),
		UpdatedAt:        settings.UpdatedAt.Time,
	}
	for _, row := range rows {
		resp.MonthlyRecurringCents += row.RecurringCents
		resp.ReceivedThisMonthCents += row.ReceivedCents
		if row.UpdatedAt.Valid && row.UpdatedAt.Time.After(resp.UpdatedAt) {
			resp.UpdatedAt = row.UpdatedAt.Time
		}
		resp.Providers = append(resp.Providers, chroniclesdk.SupportSummaryProvider{
			Provider:       chroniclesdk.SupportProvider(row.Provider),
			DisplayName:    row.DisplayName,
			PublicURL:      row.PublicUrl,
			ReceivedCents:  row.ReceivedCents,
			RecurringCents: row.RecurringCents,
		})
	}
	resp.RemainingMonthlyCents = max(0, resp.MonthlyGoalCents-resp.MonthlyRecurringCents)
	w.Header().Set("Cache-Control", "public, max-age=300")
	httpapi.Write(ctx, w, http.StatusOK, resp)
}

func (s *Service) getAdmin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	settings, err := s.db.GetSupportSettings(ctx)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	month, monthDate := currentMonth()
	rows, err := s.db.GetSupportAdminServices(ctx, monthDate)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	services := make([]chroniclesdk.SupportService, 0, len(rows))
	for _, row := range rows {
		services = append(services, supportService(row))
	}
	httpapi.Write(ctx, w, http.StatusOK, chroniclesdk.SupportAdminResponse{
		Month:    month.Format("2006-01"),
		Settings: supportSettings(settings),
		Services: services,
	})
}

func (s *Service) updateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.UpdateSupportSettingsRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	if len(req.Currency) != 3 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "currency must be a three-letter ISO code"})
		return
	}
	for _, char := range req.Currency {
		if char < 'A' || char > 'Z' {
			httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "currency must be a three-letter ISO code"})
			return
		}
	}
	if req.MonthlyGoalCents < 0 {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "monthly_goal_cents cannot be negative"})
		return
	}
	settings, err := s.db.UpdateSupportSettings(ctx, database.UpdateSupportSettingsParams{
		PublicEnabled:    req.PublicEnabled,
		Currency:         req.Currency,
		MonthlyGoalCents: req.MonthlyGoalCents,
	})
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	httpapi.Write(ctx, w, http.StatusOK, supportSettings(settings))
}

func (s *Service) createService(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var req chroniclesdk.CreateSupportServiceRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if err := validateServiceRequest(req); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}

	id := uuid.New()
	_, monthDate := currentMonth()
	err := s.db.InTx(ctx, func(tx database.Store) error {
		_, err := tx.InsertSupportService(ctx, database.InsertSupportServiceParams{
			ID:          id,
			Provider:    string(req.Provider),
			DisplayName: strings.TrimSpace(req.DisplayName),
			PublicUrl:   req.PublicURL,
			Enabled:     req.Enabled,
		})
		if err != nil {
			return err
		}
		_, err = tx.UpsertSupportServiceMonthlyTotal(ctx, database.UpsertSupportServiceMonthlyTotalParams{
			ServiceID:      id,
			Month:          monthDate,
			ReceivedCents:  req.ReceivedCents,
			RecurringCents: req.RecurringCents,
		})
		return err
	}, nil)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	s.writeAdminService(ctx, w, id, http.StatusCreated)
}

func (s *Service) updateService(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "serviceID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid support service ID"})
		return
	}
	var req chroniclesdk.UpdateSupportServiceRequest
	if !httpapi.Read(ctx, w, r, &req) {
		return
	}
	if err := validateServiceRequest(req); err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: err.Error()})
		return
	}
	_, monthDate := currentMonth()
	err = s.db.InTx(ctx, func(tx database.Store) error {
		_, err := tx.UpdateSupportService(ctx, database.UpdateSupportServiceParams{
			ID:          id,
			Provider:    string(req.Provider),
			DisplayName: strings.TrimSpace(req.DisplayName),
			PublicUrl:   req.PublicURL,
			Enabled:     req.Enabled,
		})
		if err != nil {
			return err
		}
		_, err = tx.UpsertSupportServiceMonthlyTotal(ctx, database.UpsertSupportServiceMonthlyTotalParams{
			ServiceID:      id,
			Month:          monthDate,
			ReceivedCents:  req.ReceivedCents,
			RecurringCents: req.RecurringCents,
		})
		return err
	}, nil)
	if errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "support service not found"})
		return
	}
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	s.writeAdminService(ctx, w, id, http.StatusOK)
}

func (s *Service) deleteService(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, err := uuid.Parse(chi.URLParam(r, "serviceID"))
	if err != nil {
		httpapi.Write(ctx, w, http.StatusBadRequest, chroniclesdk.Response{Message: "invalid support service ID"})
		return
	}
	if _, err := s.db.GetSupportService(ctx, id); errors.Is(err, pgx.ErrNoRows) {
		httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "support service not found"})
		return
	} else if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	if err := s.db.DeleteSupportService(ctx, id); err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Service) writeAdminService(ctx context.Context, w http.ResponseWriter, id uuid.UUID, status int) {
	_, monthDate := currentMonth()
	rows, err := s.db.GetSupportAdminServices(ctx, monthDate)
	if err != nil {
		httpapi.InternalServerError(w, err)
		return
	}
	for _, row := range rows {
		if row.SupportService.ID == id {
			httpapi.Write(ctx, w, status, supportService(row))
			return
		}
	}
	httpapi.Write(ctx, w, http.StatusNotFound, chroniclesdk.Response{Message: "support service not found"})
}
