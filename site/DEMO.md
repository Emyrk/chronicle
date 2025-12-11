# Character Timeline Viewer - Demo Guide

## What You'll See

The application creates a visual timeline showing when each character was active in an instance.

### Timeline Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 📅 Character Timeline Viewer                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 Character Timelines                                         │
│                                                                  │
│  Legend:  🟢 Active Period    🔴 Ended (slain/timeout)          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Scarlet Monastery Cathedral (5 characters)                 │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │                                                            │ │
│  │ Character     │ 10:00:00      10:15:00      10:30:00      │ │
│  │ ────────────────────────────────────────────────────────── │ │
│  │ Healer1       │  ███████████████████████████              │ │
│  │ Tank1         │████████████████████████████████████       │ │
│  │ DPS1          │  ████████████████████████████████         │ │
│  │ DPS2          │    ████████████████████████               │ │
│  │ DPS3          │  ██████████████████████████████           │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Interactive Features

### 1. Hover Over Activity Bars

When you hover over a colored bar, you'll see:
- **Start Time**: When the character became active
- **End Time**: When activity stopped (if applicable)
- **Duration**: How long the character was active
- **Start Reason**: Why tracking started (e.g., "damage")
- **End Reason**: Why tracking ended (e.g., "slain", "timeout")

### 2. Color Coding

- **Green Bars**: Character is actively participating
  - Dealing or receiving damage
  - Casting spells
  - Active in combat

- **Red Bars**: Activity period ended
  - Character was slain
  - Timeout occurred (60s of inactivity)

### 3. Timeline Overlap

The visual layout makes it easy to see:
- Which characters were active at the same time
- When characters joined or left
- Who was there for the entire instance
- Gaps in activity

## Example Scenarios

### Scenario 1: Clean Run
```
Tank1    │████████████████████████████████│
Healer1  │████████████████████████████████│
DPS1     │████████████████████████████████│
DPS2     │████████████████████████████████│
DPS3     │████████████████████████████████│
```
All characters active from start to finish - perfect sync!

### Scenario 2: Someone Dies
```
Tank1    │████████████████████████████████│
Healer1  │████████████████████████████████│
DPS1     │████████████████████████████████│
DPS2     │████████████████████████████████│
DPS3     │████████████████▓▓▓▓            │ ← Died mid-fight
```
DPS3's bar turns red and stops - they were slain

### Scenario 3: Late Join
```
Tank1    │████████████████████████████████│
Healer1  │████████████████████████████████│
DPS1     │████████████████████████████████│
DPS2     │            █████████████████████│ ← Joined late
DPS3     │████████████████████████████████│
```
DPS2 started activity later than others

### Scenario 4: Multiple Deaths
```
Tank1    │████████████████████████████████│
Healer1  │██████████▓▓▓▓    ██████████████│ ← Died, then revived
DPS1     │████████████████████████████████│
DPS2     │████████████▓▓▓▓                │ ← Died, didn't return
DPS3     │████████████████████████████████│
```
Shows death events and recovery

## What Each Color Means

### 🟢 Green (Active)
- Character is participating in combat
- Dealing damage to enemies
- Receiving damage or healing
- Casting spells
- Generally "alive and fighting"

### 🔴 Red (Ended)
- Activity has stopped
- Either:
  - Character was slain (death event)
  - Timeout (60s with no activity)
  - Instance ended

## Reading the Timeline

### Time Labels
- **Left**: Instance start time
- **Middle**: Midpoint timestamp
- **Right**: Instance end time

### Character Names
- Listed on the left side
- Sorted alphabetically
- Shows actual character names from the logs

### Activity Bars
- Position shows WHEN activity occurred
- Width shows HOW LONG it lasted
- Color shows IF it ended
- Hover shows WHY it started/ended

## Tips for Analysis

1. **Look for Gaps**: Gaps between bars show periods of inactivity
2. **Check Alignment**: Characters starting together indicate coordinated entry
3. **Watch for Red**: Red bars show problems (deaths)
4. **Compare Widths**: Longer bars = more sustained activity
5. **Study Overlaps**: See who was fighting together

## Common Patterns

### Normal Dungeon Run
All characters have similar-length green bars starting and ending together.

### Wipe and Retry
Multiple activity periods with gaps, showing the group regrouping.

### Member Replacement
One character's bar ends, another starts shortly after at the same position.

### Boss Mechanics
Short red bars followed by green show players dying and being resurrected.

## Technical Notes

- **Activity Detection**: Based on damage events, casts, and other combat actions
- **Timeout**: 60 seconds of inactivity ends the activity period
- **Precision**: Timestamps accurate to the second
- **Performance**: Smooth rendering even with 100+ characters

## Getting Started

1. Upload your combat log files
2. Click "Parse & Visualize"
3. Scroll through the instances
4. Hover over bars for details
5. Analyze character activity patterns!

---

Happy analyzing! 📊✨
