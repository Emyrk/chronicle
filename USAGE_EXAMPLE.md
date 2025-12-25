# Usage Example - WASM Damage Tracking

## Quick Start

1. **Open the Site**
   ```bash
   cd site
   ./serve.sh
   # Opens browser at http://localhost:8080
   ```

2. **Upload Combat Logs**
   - Select your `WoWCombatLog.txt` (formatted)
   - Select your `raw_WoWCombatLog.txt` (raw)
   - Click "Parse Logs"

3. **View Results**
   - Switch between "Characters" and "Encounters" tabs
   - Explore damage tracking data

## Example Output Structure

### Characters Tab
Shows all characters involved in the instance with their activity periods:

```
Molten Core
├── 👤 PlayerName (Warrior) - 3 periods
├── 👤 HealerName (Priest) - 3 periods  
└── 🔥 Ragnaros - 1 period
```

### Encounters Tab (NEW!)
Shows detailed fight breakdowns with damage tracking:

```
Molten Core - 5 Encounters

┌─ Ragnaros - ✅ Kill ──────────────────────────────────────┐
│ Type: BOSS  |  1 Hostile  |  Duration: 4m 32s             │
│                                                             │
│ 💥 Damage Tracking                                         │
│ ┌────┬──────────────┬─────────┬──────────┬──────────────┐│
│ │ #  │ Name         │ Class   │ Total    │ DPS          ││
│ ├────┼──────────────┼─────────┼──────────┼──────────────┤│
│ │ 1  │ 👤 WarriorX  │ Warrior │ 123,456  │ 456/s 📊     ││
│ │ 2  │ 👤 RogueY    │ Rogue   │ 98,765   │ 364/s 📊     ││
│ │ 3  │ 👤 MageZ     │ Mage    │ 87,654   │ 323/s 📊     ││
│ └────┴──────────────┴─────────┴──────────┴──────────────┘│
│                                                             │
│ ⚔️ Hostile Characters                                      │
│ └─ Ragnaros (periods: 1)                                   │
└─────────────────────────────────────────────────────────────┘
```

## Interactive Features

### 1. Damage Details Modal

Click the **📊 Details** button to see:

```
WarriorX - Damage Sources
─────────────────────────────
Total Damage: 123,456
DPS: 456/s

Damage by Source
────────────────────────────────────────
Mortal Strike          45,678  (37.0%)
███████████████████████████████████▌░░░░

Bloodthirst           32,109  (26.0%)
█████████████████████████░░░░░░░░░░░░░░

Whirlwind             23,456  (19.0%)
██████████████████░░░░░░░░░░░░░░░░░░░░░

Heroic Strike         12,345  (10.0%)
█████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

Execute               9,868   (8.0%)
███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

### 2. Class Color Coding

Classes are displayed with their iconic WoW colors:
- 🟤 **Warrior**: Brown/Tan
- 🩷 **Paladin**: Pink
- 🟢 **Hunter**: Green
- 🟡 **Rogue**: Yellow
- ⚪ **Priest**: White
- 🔵 **Shaman**: Blue
- 🔵 **Mage**: Light Blue
- 🟣 **Warlock**: Purple
- 🟠 **Druid**: Orange
- 🔴 **Death Knight**: Red

### 3. Encounter Status

Each encounter shows:
- ✅ **Kill**: Boss was defeated
- ❌ **Wipe**: Group died or reset
- 🎯 **BOSS**: Named boss encounter
- 🗡️ **TRASH**: Trash mob groups

## Sample Data Flow

```
Upload Logs
    ↓
[WASM Processing - 2-5 seconds]
    ↓
JSON Output
    ↓
Frontend Rendering
    ↓
Interactive Display
```

## Example JSON Structure (Simplified)

```json
{
  "instances": [
    {
      "name": "Molten Core",
      "zoneId": "409",
      "encounters": [
        {
          "name": "Ragnaros",
          "type": "BOSS",
          "isKill": true,
          "duration": 272.5,
          "damage": {
            "totalDealt": {
              "Player-1234-ABCD": {
                "unitName": "WarriorX",
                "class": "Warrior",
                "isPlayer": true,
                "total": 123456,
                "dps": 453.2,
                "sources": {
                  "Mortal Strike": 45678,
                  "Bloodthirst": 32109,
                  "Whirlwind": 23456
                }
              }
            }
          }
        }
      ]
    }
  ]
}
```

## Tips & Tricks

1. **Sort by DPS**: Table automatically sorts by total damage
2. **Identify Players**: Look for 👤 icon (vs 🤖 for NPCs)
3. **Compare Sources**: Use percentage bars in modal
4. **Quick Scan**: Color-coded classes help identify roles
5. **Kill Analysis**: Focus on ✅ kills to see successful strategies

## Performance Tips

- Larger logs (>100MB) may take 10-15 seconds to parse
- First load requires WASM download (~5MB)
- Subsequent parses are faster (WASM cached)
- Modal opens instantly (no additional processing)

## Troubleshooting

**Problem**: "No damage data available"
- **Cause**: No damage events in that encounter
- **Solution**: Check if it's a valid combat encounter

**Problem**: Class shows as "Unknown"
- **Cause**: No COMBATANT_INFO for that unit
- **Solution**: Normal for NPCs, ensure addon is active for players

**Problem**: WASM fails to load
- **Cause**: Browser doesn't support WASM or blocked
- **Solution**: Use modern browser (Chrome, Firefox, Safari, Edge)
