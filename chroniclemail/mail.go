package chroniclemail

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"

	"github.com/resend/resend-go/v2"
)

type Config struct {
	APIKey    string
	From      string
	AccessURL *url.URL // for building verification links
}

type Mailer struct {
	client    *resend.Client
	from      string
	accessURL *url.URL
	logger    *slog.Logger
}

func New(logger *slog.Logger, cfg Config) *Mailer {
	var client *resend.Client
	if cfg.APIKey != "" {
		client = resend.NewClient(cfg.APIKey)
	}
	from := cfg.From
	return &Mailer{
		client:    client,
		from:      from,
		accessURL: cfg.AccessURL,
		logger:    logger.With(slog.String("component", "mailer")),
	}
}

func (m *Mailer) SendVerificationEmail(ctx context.Context, to, token string) error {
	verifyURL := fmt.Sprintf("%s/auth/password/verify-email?token=%s",
		m.accessURL.String(), token)

	if m.client == nil {
		// Dev/test fallback — log instead of sending
		m.logger.Info("verification email (not sent)",
			slog.String("to", to), slog.String("token", token),
			slog.String("url", verifyURL))
		return nil
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;padding:40px">
        <tr><td style="text-align:center;padding-bottom:24px">
          <span style="font-size:24px;font-weight:700;color:#e5e5e5;letter-spacing:-0.5px">Chronicle</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:8px">
          <span style="font-size:18px;font-weight:600;color:#e5e5e5">Verify your email</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px">
          <span style="font-size:14px;color:#999">Click the button below to verify your email address and activate your Chronicle account.</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px">
          <a href="%s" style="display:inline-block;background-color:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:6px">
            Verify Email
          </a>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:8px">
          <span style="font-size:12px;color:#666">Or copy and paste this link into your browser:</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px;word-break:break-all">
          <a href="%s" style="font-size:12px;color:#6366f1;text-decoration:none">%s</a>
        </td></tr>
        <tr><td style="text-align:center;border-top:1px solid #2a2a2a;padding-top:24px">
          <span style="font-size:12px;color:#555">If you didn't create a Chronicle account, you can safely ignore this email.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, verifyURL, verifyURL, verifyURL)

	_, err := m.client.Emails.SendWithContext(ctx, &resend.SendEmailRequest{
		From:    m.from,
		To:      []string{to},
		Subject: "Verify your Chronicle account",
		Html:    html,
	})
	return err
}

func (m *Mailer) SendPasswordResetEmail(ctx context.Context, to, token string) error {
	resetURL := fmt.Sprintf("%s/login?reset_token=%s",
		m.accessURL.String(), token)

	if m.client == nil {
		m.logger.Info("password reset email (not sent)",
			slog.String("to", to), slog.String("token", token),
			slog.String("url", resetURL))
		return nil
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;padding:40px">
        <tr><td style="text-align:center;padding-bottom:24px">
          <span style="font-size:24px;font-weight:700;color:#e5e5e5;letter-spacing:-0.5px">Chronicle</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:8px">
          <span style="font-size:18px;font-weight:600;color:#e5e5e5">Reset your password</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px">
          <span style="font-size:14px;color:#999">Click the button below to reset your password. This link expires in 1 hour.</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px">
          <a href="%s" style="display:inline-block;background-color:#6366f1;color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:6px">
            Reset Password
          </a>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:8px">
          <span style="font-size:12px;color:#666">Or copy and paste this link into your browser:</span>
        </td></tr>
        <tr><td style="text-align:center;padding-bottom:32px;word-break:break-all">
          <a href="%s" style="font-size:12px;color:#6366f1;text-decoration:none">%s</a>
        </td></tr>
        <tr><td style="text-align:center;border-top:1px solid #2a2a2a;padding-top:24px">
          <span style="font-size:12px;color:#555">If you didn't request a password reset, you can safely ignore this email.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`, resetURL, resetURL, resetURL)

	_, err := m.client.Emails.SendWithContext(ctx, &resend.SendEmailRequest{
		From:    m.from,
		To:      []string{to},
		Subject: "Reset your Chronicle password",
		Html:    html,
	})
	return err
}
