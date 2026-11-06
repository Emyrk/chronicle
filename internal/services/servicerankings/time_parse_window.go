package servicerankings

import (
	"fmt"
	"net/url"
	"time"

	"github.com/Emyrk/chronicle/internal/parsepolicy"
	"github.com/jackc/pgx/v5/pgtype"
)

type liveTimeParseWindow struct {
	Cutoff       time.Time
	WindowStart  pgtype.Timestamptz
	LookbackDays int32
}

func parseLiveTimeParseWindow(values url.Values, allowDate bool, now time.Time) (liveTimeParseWindow, error) {
	cutoff := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	if date := values.Get("date"); date != "" {
		if !allowDate {
			return liveTimeParseWindow{}, fmt.Errorf("date is not supported")
		}
		parsed, err := time.Parse("2006-01-02", date)
		if err != nil {
			return liveTimeParseWindow{}, fmt.Errorf("date must use YYYY-MM-DD: %w", err)
		}
		cutoff = parsed.UTC()
	}

	days := int32(parsepolicy.DefaultLookbackDays)
	switch values.Get("period") {
	case "", "60d":
	case "30d":
		days = int32(parsepolicy.Lookback30Days)
	case "90d":
		days = int32(parsepolicy.Lookback90Days)
	case "180d":
		days = int32(parsepolicy.Lookback180Days)
	case "all":
		days = int32(parsepolicy.LookbackAllTime)
	default:
		return liveTimeParseWindow{}, fmt.Errorf("period must be one of: 30d, 60d, 90d, 180d, all")
	}

	window := liveTimeParseWindow{Cutoff: cutoff, LookbackDays: days}
	if days > 0 {
		window.WindowStart = pgtype.Timestamptz{Time: cutoff.AddDate(0, 0, -int(days)), Valid: true}
	}
	return window, nil
}

func (w liveTimeParseWindow) windowStartPtr() *time.Time {
	if !w.WindowStart.Valid {
		return nil
	}
	value := w.WindowStart.Time
	return &value
}
