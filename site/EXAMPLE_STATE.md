# Example State Structure

Here's an example of what the parsed state JSON looks like:

```json
{
  "Me": {
    "Guid": "0x0000000000001234",
    "Name": "PlayerName"
  },
  "CurrentZone": {
    "Name": "Molten Core",
    "InstanceID": 1
  },
  "Units": {
    "Info": {
      "0x0000000000001234": {
        "Seen": "2025-01-01T00:00:00Z",
        "Guid": "0x0000000000001234",
        "IsPlayer": true,
        "Name": "PlayerName",
        "CanCooperate": true
      }
    },
    "Players": {
      "0x0000000000001234": {
        "Guid": "0x0000000000001234",
        "Name": "PlayerName",
        "HeroClass": "Warrior"
      }
    }
  },
  "Fights": {
    "Fights": [
      {
        "Units": {
          "0x0000000000001234": {
            "Name": "PlayerName",
            "CanCooperate": true
          },
          "0x0000000000005678": {
            "Name": "Ragnaros",
            "CanCooperate": false
          }
        },
        "FriendlyActive": {
          "0x0000000000001234": "2025-01-01T00:05:00Z"
        },
        "EnemiesActive": {
          "0x0000000000005678": "2025-01-01T00:05:00Z"
        },
        "UnknownActive": {},
        "Deaths": {
          "0x0000000000005678": "2025-01-01T00:10:00Z"
        },
        "CurrentZone": {
          "Name": "Molten Core",
          "InstanceID": 1
        },
        "Start": {
          "Date": "2025-01-01T00:05:00Z"
        },
        "End": {
          "Date": "2025-01-01T00:10:00Z"
        }
      }
    ]
  }
}
```

## Key Points

1. **Fight.Start and Fight.End** contain Message objects with a `Date` field
2. **Units** maps GUID strings to unitinfo.Info objects with Name and CanCooperate
3. **FriendlyActive/EnemiesActive/UnknownActive** are maps of GUIDs to timestamps
4. **Deaths** is a map of GUIDs to death timestamps
5. **CurrentZone** has Name and InstanceID fields

The frontend processes this structure to display:
- Fight duration (End.Date - Start.Date)
- Zone name and instance
- Lists of friendly/hostile/unknown units
- Deaths that occurred
