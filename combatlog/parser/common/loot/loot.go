package loot

import (
	"context"
	"fmt"
	"time"

	"github.com/Emyrk/chronicle/combatlog/parser/guid"
	"github.com/Emyrk/chronicle/combatlog/parser/common/messages"
	"github.com/Emyrk/chronicle/combatlog/parser/common/instances/instancehook"
	"github.com/Emyrk/chronicle/combatlog/parser/common/unitdb"
	"github.com/Emyrk/chronicle/database"
	"github.com/Emyrk/chronicle/database/authz"
	"github.com/google/uuid"
)

type FinalLoot struct {
	// Source is the first player to receive some loot
	Source     guid.GUID
	SourceName string
	SourceTS   time.Time

	Received     guid.GUID
	ReceivedName string
	ReceivedTS   time.Time

	ItemName   string
	ItemID     int32
	LootSuffix int32
	Quantity   int32
}

var _ instancehook.Hook = (*LootTracker)(nil)

type LootTracker struct {
	units *unitdb.Units

	loot []*FinalLoot
}

func (lt *LootTracker) Insert(ctx context.Context, instanceID uuid.UUID, realmID uuid.UUID, tx *authz.AuthzTX) error {
	if len(lt.loot) == 0 {
		return nil
	}

	inserts := make([]database.InsertInstanceLootParams, 0, len(lt.loot))
	for _, drop := range lt.loot {
		inserts = append(inserts, database.InsertInstanceLootParams{
			InstanceID:   instanceID,
			RealmID:      realmID,
			SourceGuid:   int64(drop.Source),
			SourceTs:     database.Timestamptz(drop.SourceTS),
			ReceivedGuid: int64(drop.Received),
			ReceivedTs:   database.Timestamptz(drop.ReceivedTS),
			ItemID:       drop.ItemID,
			ItemName:     drop.ItemName,
			LootSuffix:   drop.LootSuffix,
			Quantity:     drop.Quantity,
		})
	}

	res := tx.InsertInstanceLoot(ctx, inserts)
	if err := res.Close(); err != nil {
		return fmt.Errorf("closing insert instance loot batch: %w", err)
	}
	return nil
}

func (lt *LootTracker) Finalize(ctx context.Context) error {
	for _, drop := range lt.loot {
		if drop.Received == 0 {
			rc, ok := lt.units.GetPlayerByName(drop.ReceivedName)
			if ok {
				drop.Received = rc.Guid
			}
		}

		if drop.Source == 0 {
			sc, ok := lt.units.GetPlayerByName(drop.SourceName)
			if ok {
				drop.Source = sc.Guid
			}
		}
	}

	return nil
}
func (lt *LootTracker) FightStarted(encounterID uuid.UUID, m messages.Message) {}
func (lt *LootTracker) FightEnded(encounterID uuid.UUID, m messages.Message)   {}

func New(units *unitdb.Units) *LootTracker {
	return &LootTracker{
		units: units,
	}
}

func (lt *LootTracker) ProcessMessage(_ bool, _ uuid.UUID, m messages.Message) error {
	switch ty := m.(type) {
	case *messages.Loot:
		f := FinalLoot{
			Source:       0,
			SourceName:   ty.PlayerName,
			SourceTS:     m.Date(),
			Received:     0,
			ReceivedName: ty.PlayerName,
			ReceivedTS:   m.Date(),
			ItemName:     ty.ItemName,
			ItemID:       ty.ItemID,
			LootSuffix:   ty.ItemSuffixID,
			Quantity:     ty.Quantity,
		}

		c, ok := lt.units.GetPlayerByName(ty.PlayerName)
		if ok {
			f.Source = c.Guid
			f.SourceName = c.Name
			f.Received = c.Guid
			f.ReceivedName = c.Name
		}
		lt.loot = append(lt.loot, &f)
	case *messages.LootTrade:
		for i := len(lt.loot) - 1; i >= 0; i-- {
			drop := lt.loot[i]
			if drop.ItemName == ty.ItemName &&
				drop.SourceName == ty.FromPlayerName {
				drop.ReceivedTS = m.Date()
				drop.ReceivedName = ty.ToPlayerName
				drop.Received = 0

				newOwner, ok := lt.units.GetPlayerByName(ty.ToPlayerName)
				if ok {
					drop.Received = newOwner.Guid
					drop.ReceivedName = newOwner.Name
				}
				break
			}
		}
	}

	return nil
}
