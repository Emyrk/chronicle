package serviceinfrastructurecosts

import (
	"context"
	"fmt"
	"strings"

	"github.com/Emyrk/chronicle/internal/infrastructurecosts"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/servicedbstore"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"
	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

type Service struct {
	broker                        *services.Services
	enabled                       bool
	token, workspaceID, projectID string
	Reports                       *infrastructurecosts.Service
	Worker                        *infrastructurecosts.Worker
}

func New(b *services.Services) *Service { return &Service{broker: b} }
func (s *Service) Name() string         { return services.ServiceInfrastructureCosts }
func OnInfrastructureCosts() string     { return (&Service{}).Name() }
func Get(b *services.Services) *Service { return services.MustGet[*Service](b) }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), servicedbstore.OnDatabaseStore()}
}
func (s *Service) Configures() []string { return nil }
func (s *Service) Enabled() bool        { return s != nil && s.enabled && s.Reports != nil }
func (s *Service) Start(context.Context) error {
	if !s.enabled {
		return nil
	}
	missing := []string{}
	if strings.TrimSpace(s.token) == "" {
		missing = append(missing, "CHRONICLE_RAILWAY_API_TOKEN")
	}
	if strings.TrimSpace(s.workspaceID) == "" {
		missing = append(missing, "CHRONICLE_RAILWAY_WORKSPACE_ID")
	}
	if strings.TrimSpace(s.projectID) == "" {
		missing = append(missing, "CHRONICLE_RAILWAY_PROJECT_ID")
	}
	if len(missing) > 0 {
		return fmt.Errorf("infrastructure cost reports enabled with incomplete configuration; missing %s", strings.Join(missing, ", "))
	}
	client := &infrastructurecosts.RailwayClient{Token: s.token, WorkspaceID: s.workspaceID, ProjectID: s.projectID}
	s.Reports = &infrastructurecosts.Service{Store: servicedbstore.DatabaseStore(s.broker), Provider: client, ServerType: services.ServerName, Logger: services.NamedLogger(servicelogger.Logger(s.broker), s.Name())}
	s.Worker = &infrastructurecosts.Worker{Service: s.Reports}
	return nil
}
func (s *Service) Close(context.Context) error { return nil }
func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{Name: "Infrastructure Cost Reports", Description: "Enable monthly Railway infrastructure cost reports.", Flag: "cost-reports-enabled", Env: "CHRONICLE_COST_REPORTS_ENABLED", Default: "false", Value: serpent.BoolOf(&s.enabled)},
		{Name: "Railway API Token", Description: "Railway API token used only for infrastructure cost ingestion.", Flag: "railway-api-token", Env: "CHRONICLE_RAILWAY_API_TOKEN", Default: "", Value: serpent.StringOf(&s.token)},
		{Name: "Railway Workspace ID", Description: "Railway workspace whose usage is queried.", Flag: "railway-workspace-id", Env: "CHRONICLE_RAILWAY_WORKSPACE_ID", Default: "", Value: serpent.StringOf(&s.workspaceID)},
		{Name: "Railway Project ID", Description: "Railway project included in the report.", Flag: "railway-project-id", Env: "CHRONICLE_RAILWAY_PROJECT_ID", Default: "", Value: serpent.StringOf(&s.projectID)},
	}
}
