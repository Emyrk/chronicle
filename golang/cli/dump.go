package cli

import (
	"fmt"
	"os"

	"github.com/Emyrk/chronicle/golang/wowlogs/guid"

	"github.com/coder/serpent"
)

func GuidCmd() *serpent.Command {
	cmd := &serpent.Command{
		Use:        "guid <guid>",
		Middleware: serpent.RequireNArgs(1),
		Options:    []serpent.Option{},
		Handler: func(i *serpent.Invocation) error {
			id, err := guid.FromString(i.Args[0])
			if err != nil {
				return fmt.Errorf("parsing guid %s: %w", i.Args[0], err)
			}

			_, _ = fmt.Fprintf(os.Stdout, "GUID: %s\n", id.String())
			_, _ = fmt.Fprintf(os.Stdout, "IsPlayer: %t\n", id.IsPlayer())
			_, _ = fmt.Fprintf(os.Stdout, "IsVehicle: %t\n", id.IsVehicle())
			_, _ = fmt.Fprintf(os.Stdout, "IsPet: %t\n", id.IsPet())
			_, _ = fmt.Fprintf(os.Stdout, "IsCreature: %t\n", id.IsCreature())
			_, _ = fmt.Fprintf(os.Stdout, "IsAnyCreature: %t\n", id.IsAnyCreature())
			_, _ = fmt.Fprintf(os.Stdout, "IsUnit: %t\n", id.IsUnit())
			entry, ok := id.GetEntry()
			if ok {
				_, _ = fmt.Fprintf(os.Stdout, "Entry: %d\n", entry)
			}
			high := id.GetHigh()
			//fmt.Sprintf("0x%016X", uint64(g))
			fmt.Printf("High: %016X\n", high)

			return nil
		},
	}
	return cmd
}
