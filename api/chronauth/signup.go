package chronauth

import (
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/Emyrk/chronicle/chroniclebot"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/Emyrk/chronicle/database/authz/policy"
	"github.com/authzed/gochugaru/rel"
	"github.com/google/uuid"
	"github.com/markbates/goth"
)

var errSignupsDisabled = errors.New("signups are currently disabled")

func (s *Service) Signup(w http.ResponseWriter, r *http.Request, user goth.User) (database.UserAuthSession, bool) {
	var session database.UserAuthSession
	now := time.Now()
	ctx := r.Context()
	provider, ok := s.provider(w, r)
	if !ok {
		return session, false
	}

	err := s.Zed.InTx(func(tx *authz.AuthzTX) error {
		linked, err := tx.GetUserAuthByLinkedID(ctx, database.GetUserAuthByLinkedIDParams{
			LinkedID: user.UserID,
			Provider: provider.Name(),
		})
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		if linked.ID == uuid.Nil {
			// Check if signups are enabled
			siteConfig, err := tx.GetSiteConfig(ctx)
			if err != nil {
				return fmt.Errorf("get site config: %w", err)
			}
			if !siteConfig.SignupsEnabled {
				return errSignupsDisabled
			}

			// Sign up the user
			name := user.Name

			// Try using global_name from discord
			gn, ok := try[string](user.RawData, "global_name")
			if ok && gn != "" {
				name = gn
			}

			userRow, err := tx.InsertUser(ctx, database.InsertUserParams{
				ID:        uuid.New(),
				Username:  name,
				Email:     user.Email,
				CreatedAt: database.Timestamptz(now),
				UpdatedAt: database.Timestamptz(now),
			})
			if err != nil {
				return err
			}

			linked, err = tx.InsertUserAuth(ctx, database.InsertUserAuthParams{
				ID:        uuid.New(),
				LinkedID:  user.UserID,
				UserID:    userRow.ID,
				Provider:  provider.Name(),
				CreatedAt: database.Timestamptz(now),
				UpdatedAt: database.Timestamptz(now),
			})
			if err != nil {
				return err
			}

			s.logger.Info("new user registered",
				slog.String("provider", provider.Name()),
				slog.String("email", user.Email),
				slog.String("name", user.Name),
				slog.String("linked_id", user.UserID),
				slog.String("id", userRow.ID.String()),
			)
		}
		// Save the user session
		session, err = tx.InsertUserAuthSession(ctx, database.InsertUserAuthSessionParams{
			ID:                uuid.New(),
			JwtID:             uuid.New(),
			UserID:            linked.UserID,
			UserAuthID:        linked.ID,
			AccessToken:       user.AccessToken,
			AccessTokenSecret: user.AccessTokenSecret,
			RefreshToken:      user.RefreshToken,
			ExpiresAt:         database.Timestamptz(user.ExpiresAt),
			CreatedAt:         database.Timestamptz(now),
			UpdatedAt:         database.Timestamptz(now),
		})
		if err != nil {
			return err
		}

		switch user.Provider {
		case "discord":
			err = s.Bot.SyncDiscordUser(ctx, tx, user.UserID, linked.UserID)
			if err != nil {
				return fmt.Errorf("handling discord user: %w", err)
			}
		case "dev-oidc":
			b := policy.New()
			gChron := b.GlobalChronicle()
			usr := b.User(session.UserID)

			// Create a filter to remove all their existing roles from the global namespace
			f := rel.NewFilter(gChron.Object().Typ, gChron.Object().ID, "")
			f.WithSubjectFilter(usr.Object().Typ, usr.Object().ID, "")
			err := s.Zed.Delete(ctx, rel.NewPreconditionedFilter(f))
			if err != nil {
				return fmt.Errorf("zed.Delete: %w", err)
			}

			b.GlobalChronicle().
				Chronicle_guild_member(usr)
			_, err = s.Zed.Write(ctx, *b.Txn())
			if err != nil {
				return fmt.Errorf("giving dev-oidc user all perms: %w", err)
			}
		}

		return nil
	}, nil)
	if err != nil {
		if errors.Is(err, errSignupsDisabled) {
			http.Redirect(w, r, "/login?error=signups_disabled", http.StatusTemporaryRedirect)
			return session, false
		}
		if errors.Is(err, chroniclebot.ErrMustJoinDiscordServer) {
			http.Redirect(w, r, "/login?error=not_in_discord", http.StatusTemporaryRedirect)
			return session, false
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return session, false
	}

	return session, true
}

func try[T any](m map[string]any, key string) (T, bool) {
	val, ok := m[key]
	if !ok {
		var zero T
		return zero, false
	}

	casted, ok := val.(T)
	return casted, ok
}
