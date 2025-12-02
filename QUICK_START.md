# Quick Start Guide

## What Changed?

The frontend was completely rewritten to display the new simplified state structure. Instead of tracking spells, complex GUID parsing, and player cards, it now focuses on showing **individual fights** with clear information.

## What Each Fight Shows

```
┌──────────────────────────────────────────┐
│ Fight #1  [Molten Core (1)]   ⏱️ 5m 23s  │
├──────────────────────────────────────────┤
│                                          │
│ 👥 Friendly Units (5)                    │
│ ├─ Warrior1                              │
│ ├─ Priest1                               │
│ └─ Mage1                                 │
│                                          │
│ ⚔️ Hostile Units (3)                     │
│ ├─ Ragnaros                              │
│ ├─ Son of Flame                          │
│ └─ Lava Spawn                            │
│                                          │
│ ❓ Unknown Units (0)                     │
│ └─ (none)                                │
│                                          │
│ 💀 Deaths (1)                            │
│ └─ Ragnaros                              │
│                                          │
└──────────────────────────────────────────┘
```

## Files Changed

- **`site/index.html`** - New card-based layout
- **`site/app.js`** - Simplified JavaScript

## How to Use

1. **Start the server:**
   ```bash
   cd site
   ./serve.sh 8000
   ```

2. **Open browser:**
   - Go to http://localhost:8000

3. **Upload logs:**
   - Select WoWCombatLog.txt
   - Select WoWCombatLogRaw.txt

4. **Parse:**
   - Click "Parse Logs"
   - Wait for processing

5. **View results:**
   - Scroll to see all fights
   - Click "Show Raw JSON" to see the full state

## Color Guide

- 🟢 **Green border** - Friendly units (CanCooperate = true)
- 🔴 **Red border** - Hostile units (enemies)
- 🟠 **Orange border** - Unknown units (not yet categorized)
- 🟣 **Purple border** - Deaths

## State Structure

The frontend reads this JSON structure from the Go parser:

```javascript
{
  "Fights": {
    "Fights": [
      {
        "Units": {...},           // All units in fight
        "FriendlyActive": {...},  // Friendly GUIDs -> timestamps
        "EnemiesActive": {...},   // Enemy GUIDs -> timestamps
        "UnknownActive": {...},   // Unknown GUIDs -> timestamps
        "Deaths": {...},          // Death GUIDs -> timestamps
        "CurrentZone": {
          "Name": "Zone Name",
          "InstanceID": 1
        },
        "Start": {"Date": "..."},
        "End": {"Date": "..."}
      }
    ]
  }
}
```

## Benefits

✅ Shows exactly what you need for each fight  
✅ Clean, modern design  
✅ Mobile-friendly  
✅ Fast rendering  
✅ Easy to understand code  
✅ Matches backend state exactly  

## Need More Info?

- See `REDESIGN_SUMMARY.md` for full details
- See `BEFORE_AFTER.md` for comparison
- See `site/FRONTEND_REDESIGN.md` for technical docs
- See `site/EXAMPLE_STATE.md` for state examples
