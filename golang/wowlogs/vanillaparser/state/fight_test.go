package state

import (
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"
	"github.com/Emyrk/chronicle/golang/wowlogs/types"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/unitinfo"
	"github.com/Emyrk/chronicle/golang/wowlogs/types/zone"
	"github.com/Emyrk/chronicle/golang/wowlogs/vanillaparser/messages"
)

func TestFightString(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	
	// Create a test state
	playerGUID, _ := guid.FromString("0x0000000000000001")
	me := types.Unit{
		Name: "TestPlayer",
		Gid:  playerGUID,
	}
	state := NewState(logger, me)
	
	// Process some test data
	ts := time.Now()
	
	// Set zone first
	zoneMsg := messages.Zone{
		MessageBase: messages.Base(ts),
		Zone: zone.Zone{
			Name:       "Blackrock Depths",
			InstanceID: 123,
		},
	}
	state.Process(zoneMsg)
	
	// Add a unit
	enemyGUID, _ := guid.FromString("0x0000000000000002")
	unitMsg := messages.Unit{
		MessageBase: messages.Base(ts),
		Info: unitinfo.Info{
			Name:         "EnemyMob",
			Guid:         enemyGUID,
			CanCooperate: false,
		},
	}
	state.Process(unitMsg)
	
	// Add damage
	damageMsg := messages.Damage{
		MessageBase: messages.Base(ts.Add(time.Second)),
		Caster:      me.Gid,
		Target:      unitMsg.Info.Guid,
		Amount:      100,
	}
	state.Process(damageMsg)
	
	// Add more damage
	damageMsg2 := messages.Damage{
		MessageBase: messages.Base(ts.Add(2 * time.Second)),
		Caster:      me.Gid,
		Target:      unitMsg.Info.Guid,
		Amount:      150,
	}
	state.Process(damageMsg2)
	
	// Add healing
	healMsg := messages.Heal{
		MessageBase: messages.Base(ts.Add(3 * time.Second)),
		Caster:      me.Gid,
		Target:      me.Gid,
		Amount:      50,
	}
	state.Process(healMsg)
	
	// End fight with slain
	slainMsg := messages.Slain{
		MessageBase: messages.Base(ts.Add(5 * time.Second)),
		Victim:      unitMsg.Info.Guid,
	}
	state.Process(slainMsg)
	
	// Change zone to end the fight
	zoneMsg2 := messages.Zone{
		MessageBase: messages.Base(ts.Add(10 * time.Second)),
		Zone: zone.Zone{
			Name:       "Ironforge",
			InstanceID: 0,
		},
	}
	state.Process(zoneMsg2)
	
	// Get the string output
	output := state.String()
	
	// Verify output contains expected information
	if output == "" {
		t.Error("String() returned empty output")
	}
	
	t.Logf("Fight Summary:\n%s", output)
}

func TestEmptyFightString(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	
	playerGUID, _ := guid.FromString("0x0000000000000001")
	me := types.Unit{
		Name: "TestPlayer",
		Gid:  playerGUID,
	}
	state := NewState(logger, me)
	
	// Get the string output without any fights
	output := state.String()
	
	t.Logf("Empty Fight Summary:\n%s", output)
}
