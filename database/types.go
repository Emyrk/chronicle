package database

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/xerrors"
)

type GetWoWLogGroupsByOwnerRow2 struct {
	WoWLogGroup WoWLogGroup   `db:"wo_wlog_group" json:"wo_wlog_group"`
	Files       []SlimLogFile `db:"files" json:"files"`
}

type SlimLogFile struct {
	ID        uuid.UUID          `json:"id"`
	Hash      string             `json:"hash"`
	SizeBytes int64              `json:"size_bytes"`
	MimeType  string             `json:"mime_type"`
	CreatedAt pgtype.Timestamptz `json:"created_at"`
	UpdatedAt pgtype.Timestamptz `json:"updated_at"`
}

func (t *SlimLogFile) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		return json.Unmarshal([]byte(v), &t)
	case []byte:
		return json.Unmarshal(v, &t)
	case json.RawMessage:
		return json.Unmarshal(v, &t)
	}

	return xerrors.Errorf("unexpected type %T", src)
}

func (t SlimLogFile) Value() (driver.Value, error) {
	return json.Marshal(t)
}

type OverviewIncomingDamageAbility struct {
	SpellID         *int32 `json:"spell_id,omitempty"`
	Name            string `json:"name"`
	Damage          int64  `json:"damage"`
	Hits            int64  `json:"hits"`
	EnvironmentType string `json:"environment_type,omitempty"`
}

type Ability struct {
	Total   int64 `json:"total"`
	Hit     int64 `json:"hit_count"`
	Crit    int64 `json:"crit_count"`
	Miss    int64 `json:"miss_count"`
	Dodge   int64 `json:"dodge_count"`
	Immune  int64 `json:"immune_count"`
	Parried int64 `json:"parry_count"`

	// Partial resists and other stuff?
	Other int64 `json:"other_count"`
}

func (a *Ability) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		return json.Unmarshal([]byte(v), &a)
	case []byte:
		return json.Unmarshal(v, &a)
	case json.RawMessage:
		return json.Unmarshal(v, &a)
	}

	return xerrors.Errorf("unexpected type %T", src)
}

func (a Ability) Value() (driver.Value, error) {
	return json.Marshal(a)
}

type Periods []Period

// EndState describes how an activity period ended
type EndState string

const (
	EndStateSlain   EndState = "slain"   // Unit was killed
	EndStateReset   EndState = "reset"   // Unit left combat without dying
	EndStateTimeout EndState = "timeout" // Inactivity timeout
)

type Period struct {
	Start      *PeriodMoment `json:"start,omitempty"`
	End        *PeriodMoment `json:"end,omitempty"`
	LastActive *PeriodMoment `json:"last_active,omitempty"`
	EndState   EndState      `json:"end_state,omitempty"`
}

type PeriodMoment struct {
	Timestamp   time.Time       `json:"timestamp"`
	Reason      string          `json:"reason"`
	MessageType string          `json:"message_type,omitempty"`
	Message     json.RawMessage `json:"message,omitempty"`
}

func (a *Periods) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		return json.Unmarshal([]byte(v), &a)
	case []byte:
		return json.Unmarshal(v, &a)
	case json.RawMessage:
		return json.Unmarshal(v, &a)
	}

	return xerrors.Errorf("unexpected type %T", src)
}

func (a Periods) Value() (driver.Value, error) {
	if a == nil {
		return "[]", nil
	}
	b, err := json.Marshal(a)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

type Video struct {
	URL        string           `json:"url"`
	ExportedAt time.Time        `json:"exported_at"`
	Results    []VideoTimestamp `json:"results"`
}

type VideoTimestamp struct {
	VideoTimeSeconds int    `json:"video_time_seconds"`
	RawOCR           string `json:"raw_ocr"`
	// Need to convert to timezone, is like "17:56:08"
	ServerTime string `json:"server_time"`
	UTCTime    string `json:"utc_time"`
	Confidence int    `json:"confidence"`
}

func (t *Video) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		return json.Unmarshal([]byte(v), &t)
	case []byte:
		return json.Unmarshal(v, &t)
	case json.RawMessage:
		return json.Unmarshal(v, &t)
	}

	return xerrors.Errorf("unexpected type %T", src)
}

func (t Video) Value() (driver.Value, error) {
	return json.Marshal(t)
}

type PlayerOutfit [19]PlayerGear

type PlayerGear struct {
	ItemID      int32  `json:"item_id"`
	EnchantID   *int32 `json:"enchant_id,omitempty"`
	ItemName    string `json:"item_name,omitempty"`
	ItemQuality int32  `json:"item_quality,omitempty"`
	ItemIcon    string `json:"item_icon,omitzero"`
	TransmogID  *int32 `json:"transmog_id,omitempty"`
	// TODO: transmog
}

func (g *PlayerOutfit) Scan(src interface{}) error {
	switch v := src.(type) {
	case string:
		return json.Unmarshal([]byte(v), &g)
	case []byte:
		return json.Unmarshal(v, &g)
	case json.RawMessage:
		return json.Unmarshal(v, &g)
	}

	return xerrors.Errorf("unexpected type %T", src)
}

func (g PlayerOutfit) Value() (driver.Value, error) {
	return json.Marshal(g)
}

// PlayerTalents represents the talent allocation for a player, stored as JSONB.
// Nil means no talent data is available.
type PlayerTalents struct {
	// Trees contains three talent tab allocations, one per spec tree.
	Trees [3]PlayerTalentTab `json:"trees"`
}

type PlayerTalentTab struct {
	// TabName is the talent tree name (e.g., "Arms", "Fury", "Protection").
	TabName string `json:"tab_name,omitempty"`
	// PointsSpent is the total number of talent points allocated in this tab.
	PointsSpent int `json:"points_spent"`
	// Ranks is one digit per talent (in tab-index order): the current rank.
	Ranks string `json:"ranks"`
}

func (t *PlayerTalents) Scan(src interface{}) error {
	switch v := src.(type) {
	case nil:
		return nil
	case string:
		if v == "null" {
			return nil
		}
		return json.Unmarshal([]byte(v), t)
	case []byte:
		if string(v) == "null" {
			return nil
		}
		return json.Unmarshal(v, t)
	case json.RawMessage:
		if string(v) == "null" {
			return nil
		}
		return json.Unmarshal(v, t)
	}
	return xerrors.Errorf("unexpected type %T", src)
}

func (t *PlayerTalents) Value() (driver.Value, error) {
	if t == nil {
		return []byte("null"), nil
	}
	return json.Marshal(t)
}

// VersionsMap is a map[string]string stored as JSONB for instance version metadata.
type VersionsMap map[string]string

func (v *VersionsMap) Scan(src interface{}) error {
	switch val := src.(type) {
	case string:
		return json.Unmarshal([]byte(val), v)
	case []byte:
		return json.Unmarshal(val, v)
	case json.RawMessage:
		return json.Unmarshal(val, v)
	}
	return xerrors.Errorf("unexpected type %T", src)
}

func (v VersionsMap) Value() (driver.Value, error) {
	if v == nil {
		return json.Marshal(map[string]string{})
	}
	return json.Marshal(v)
}
