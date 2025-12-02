# Frontend Redesign - Fight Display

## Overview
The frontend has been completely redesigned to display the new simplified state structure. The focus is now on showing individual fights with clear, organized information.

## What's Displayed

Each fight now shows:
1. **Fight Duration** - How long the fight lasted (⏱️)
2. **Zone Information** - What zone/instance the fight took place in
3. **Friendly Units** - All cooperative units seen in the fight (👥)
4. **Hostile Units** - All enemy units seen in the fight (⚔️)
5. **Unknown Units** - Units that couldn't be categorized (❓)
6. **Deaths** - Who died during the fight (💀)

## State Structure

The frontend now consumes this simplified state from the Go backend:

```go
type Fight struct {
    Units          map[guid.GUID]unitinfo.Info  // All units seen
    FriendlyActive map[guid.GUID]time.Time      // Active friendly units
    EnemiesActive  map[guid.GUID]time.Time      // Active enemy units
    UnknownActive  map[guid.GUID]time.Time      // Unknown units
    Deaths         map[guid.GUID]time.Time      // Deaths that occurred
    CurrentZone    zone.Zone                     // Zone info
    Start          messages.Message              // Fight start
    End            messages.Message              // Fight end
}
```

## Key Features

- **Clean Card Layout** - Each fight is displayed in an easy-to-read card
- **Color-Coded Units** - Green for friendly, red for hostile, orange for unknown, purple for deaths
- **Responsive Design** - Works on mobile and desktop
- **Raw JSON Toggle** - Can still view the raw state JSON
- **Duration Display** - Shows fight length in human-readable format (e.g., "2m 34s")

## Files Modified

- `site/index.html` - Completely rewritten with new structure and styling
- `site/app.js` - Simplified to focus on fight display, removed complex filtering
- Removed old features: player cards, spell tracking, zone filtering

## Testing

To test the frontend:

```bash
cd site
./serve.sh 8000
```

Then open http://localhost:8000 in your browser and upload your combat logs.

## Future Improvements

Potential enhancements:
- Add zone filtering back if needed
- Show start/end times for each fight
- Add fight summary statistics
- Filter by fight duration
- Search for specific units
