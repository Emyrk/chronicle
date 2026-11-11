package vanilla

import (
	"fmt"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/types/gameversions"
	"github.com/Emyrk/chronicle/combatlog/parser/types/realm"
	"github.com/Masterminds/semver"
	"time"
)

const dateLayout = "02.01.06 15:04:05"

// HeaderFields is the header's narrow cursor contract, with optional trailing fields.
type HeaderFields interface {
	String() string
	Int32() int32
	Remain() int
	Skip()
	Error() error
	SetError(error)
}

// HeaderResult separates emitted metadata from the optional state update.
// A nil Version means retain the last valid companion version, not clear it.
// HEADER does not establish observed roster/resource/position capabilities.
type HeaderResult struct {
	Messages []messages.Message
	Version  *gameversions.GameVersion
}

func DecodeHeader(ts time.Time, m HeaderFields, chronicleVersion string) (HeaderResult, error) {
	player := ReadOptionalGUID(m)
	realmName := m.String()
	zoneName := m.String()
	addonVersion := m.String()
	superWoWVersion := m.String()
	namPowerVersion := m.String()
	xp3Version := m.String()
	wowVersion := m.String()
	wowBuild := m.Int32()
	wowBuildDate := m.String()
	localTimeStr := m.String()
	utcTimeStr := m.String()

	var classicAPIVersion string
	if m.Remain() > 0 {
		m.Skip() // combat log range
	}
	if m.Remain() > 0 {
		classicAPIVersion = m.String()
	}
	if m.Remain() > 0 {
		m.Skip() // threat mode
	}

	// TODO: If ts is 0, set to utc time

	var _ = zoneName

	if err := m.Error(); err != nil {
		return HeaderResult{}, err
	}

	localTime, err := time.Parse(dateLayout, localTimeStr)
	if err != nil {
		return HeaderResult{}, fmt.Errorf("parsing local time: %w", err)
	}
	var _ = localTime

	utcTime, err := time.Parse(dateLayout, utcTimeStr)
	if err != nil {
		return HeaderResult{}, fmt.Errorf("parsing local time: %w", err)
	}

	if ts.IsZero() {
		ts = utcTime
	}

	result := HeaderResult{}
	chronicleCompanion, ccv := semver.NewVersion(addonVersion)

	if ccv == nil {
		result.Version = &gameversions.GameVersion{
			ChronicleCompanionAddon: chronicleCompanion,
		}
	}

	versions := make(map[string]string)
	if addonVersion != "" {
		versions["chronicle_companion"] = addonVersion
		versions["addon"] = addonVersion
	}
	if superWoWVersion != "" {
		versions["superwow"] = superWoWVersion
	}
	if namPowerVersion != "" {
		versions["nampower"] = namPowerVersion
	}
	if xp3Version != "" {
		versions["xp3"] = xp3Version
	}
	if classicAPIVersion != "" {
		versions["classicapi"] = classicAPIVersion
	}
	if wowVersion != "" {
		versions["wow_client"] = wowVersion
	}
	if wowBuild != 0 {
		versions["wow_build"] = fmt.Sprintf("%d", wowBuild)
	}
	versions["chronicle"] = chronicleVersion

	result.Messages = []messages.Message{
		&messages.Realm{
			MessageBase: messages.Base(ts),
			Info: realm.Info{
				Seen:      ts,
				Version:   wowVersion,
				Build:     int(wowBuild),
				BuildDate: wowBuildDate,
				RealmName: realmName,
			},
		},
		&messages.Versions{
			MessageBase: messages.Base(ts),
			Player:      player,
			Versions:    versions,
		},
	}
	return result, nil
}
