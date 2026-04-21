package servicemail

import (
	"context"
	"net/url"

	"github.com/Emyrk/chronicle/chroniclemail"
	"github.com/Emyrk/chronicle/internal/services"
	"github.com/Emyrk/chronicle/internal/services/serviceaccessurl"
	"github.com/Emyrk/chronicle/internal/services/servicelogger"

	"github.com/coder/serpent"
)

var _ services.Servicer = (*Service)(nil)

func Mailer(broker *services.Services) *chroniclemail.Mailer {
	srv := services.MustGet[*Service](broker)
	return srv.mailer
}

func OnMailer() string { return (&Service{}).Name() }

type Service struct {
	broker *services.Services
	mailer *chroniclemail.Mailer

	apiKey string
	from   string
}

func New(broker *services.Services) *Service {
	return &Service{broker: broker}
}

func (s *Service) Name() string         { return services.ServiceMail }
func (s *Service) Configures() []string { return []string{} }
func (s *Service) DependsOn() []string {
	return []string{servicelogger.OnLogger(), serviceaccessurl.OnAccessURL()}
}

func (s *Service) Start(_ context.Context) error {
	accessURL := serviceaccessurl.AccessURL(s.broker)
	logger := servicelogger.Logger(s.broker)
	u, err := url.Parse(accessURL)
	if err != nil {
		return err
	}

	s.mailer = chroniclemail.New(logger, chroniclemail.Config{
		APIKey:    s.apiKey,
		From:      s.from,
		AccessURL: u,
	})
	return nil
}

func (s *Service) Close(_ context.Context) error { return nil }

func (s *Service) Options() serpent.OptionSet {
	return serpent.OptionSet{
		{
			Name:        "Resend API Key",
			Description: "API key for Resend email service.",
			Flag:        "resend-api-key",
			Env:         "CHRONICLE_RESEND_API_KEY",
			Default:     "",
			Value:       serpent.StringOf(&s.apiKey),
		},
		{
			Name:        "Email From Address",
			Description: "From address for outgoing emails.",
			Flag:        "email-from",
			Env:         "CHRONICLE_EMAIL_FROM",
			Default:     "Chronicle <noreply@chronicleclassic.com>",
			Value:       serpent.StringOf(&s.from),
		},
	}
}
