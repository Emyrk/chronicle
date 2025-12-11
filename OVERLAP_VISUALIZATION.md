# 📊 Overlapping Activities Visualization

## Overview
This enhancement makes overlapping activity periods for the same character highly visible through multiple visual cues.

## Visual Indicators

### 1. Warning Icon
Characters with overlapping activities display a pulsing ⚠️ icon:

```
⚠️ PlayerName
```

### 2. Stacked Timeline View

#### Without Overlaps (Normal View)
```
Character A   [════════════════════]
Character B   [═══════════]  [════════]
```

#### With Overlaps (Stacked View)
```
⚠️ Character A   ╔════════════════════╗  ← Layer 1
                  ║════════════════════║
                  ╟────────────────────╢  ← Layer 2
                  ║══════════║
                  ╚════════════════════╝
                  (Yellow striped background)
```

### 3. Color Scheme

| Element | Color | Purpose |
|---------|-------|---------|
| Active Period | Green gradient | Normal activity |
| Ended Period | Red gradient | Character died/timed out |
| Timeout Period | Orange gradient | Activity timeout |
| Overlap Warning | Yellow/Orange | Indicates issue |
| Overlap Border | Dashed Orange | Track has overlaps |

## How It Works

### Detection Algorithm

```javascript
// Check all pairs of periods
for each period1 in periods:
    for each period2 in periods after period1:
        if period1.start < period2.end AND 
           period2.start < period1.end:
            // Overlapping!
            return true
```

### Layer Assignment

```javascript
1. Sort periods by start time
2. For each period:
   - Try each existing layer
   - If period fits (no overlap), add to layer
   - Otherwise, create new layer
3. Render each layer as separate horizontal track
```

### Example Visualization

**Input Data:**
```json
{
  "characterName": "Warrior",
  "periods": [
    { "start": "10:00:00", "end": "10:30:00" },
    { "start": "10:15:00", "end": "10:45:00" },
    { "start": "10:20:00", "end": "10:25:00" }
  ]
}
```

**Visual Output:**
```
⚠️ Warrior    ╔════════════════════════════════════╗
              ║ 10:00 ════════════════════ 10:30 ║ Layer 1
              ╟────────────────────────────────────╢
              ║      10:15 ═══════════════ 10:45  ║ Layer 2
              ╟────────────────────────────────────╢
              ║            10:20 ═════ 10:25      ║ Layer 3
              ╚════════════════════════════════════╝
              (Yellow diagonal stripes background)
```

## UI Components

### Character Row Structure

```html
<div class="character-row">
  <!-- Name with optional warning -->
  <div class="character-name">
    <span class="overlap-warning" title="Overlapping periods!">⚠️</span>
    Character Name
  </div>
  
  <!-- Activity track (single or multi-layer) -->
  <div class="activity-track has-overlaps" style="height: 105px">
    <!-- Layer 1 -->
    <div class="activity-subtrack" style="top: 0px">
      <div class="activity-period overlapping">...</div>
    </div>
    
    <!-- Layer 2 -->
    <div class="activity-subtrack" style="top: 35px">
      <div class="activity-period overlapping">...</div>
    </div>
    
    <!-- Layer 3 -->
    <div class="activity-subtrack" style="top: 70px">
      <div class="activity-period overlapping">...</div>
    </div>
  </div>
</div>
```

## Tooltips

Hovering over any activity period shows:
- Start time
- End time (or "Still active")
- Duration
- Start reason
- End reason (if applicable)

For overlapping periods, the tooltip helps identify which period is which.

## Legend

The legend at the top explains all visual indicators:

| Symbol | Meaning |
|--------|---------|
| 🟢 Green Bar | Active Period |
| 🔴 Red Bar | Ended (slain/timeout) |
| ⚠️ Yellow Icon | Overlapping Activities (stacked view) |

## Benefits

### 1. **Data Quality**
Immediately spot parsing issues or log corruption

### 2. **Debugging**
See exactly when overlaps occur and their duration

### 3. **Clarity**
All activity periods visible, nothing hidden

### 4. **Accessibility**
Multiple cues: color, icon, pattern, spacing

## Use Cases

### Normal Case (No Overlaps)
- Character enters dungeon
- Fights continuously
- Dies or times out
- **Result:** Single green/red bar

### Overlap Case (Data Issue)
- Same character ID appears twice
- Duplicate events in logs
- Merge conflicts in combat logs
- **Result:** Stacked bars with ⚠️ warning

## Testing

Test with the included test file:
```bash
open /tmp/test_overlap.html
```

Or use the dev server:
```bash
make serve
# Load your combat logs
# Look for ⚠️ icons
```

## Performance

- **Detection:** O(n²) per character - fast for typical cases
- **Rendering:** Only characters with overlaps use complex layout
- **Memory:** Minimal overhead - reuses period data

## Browser Support

✅ Chrome 57+
✅ Firefox 52+
✅ Safari 11+
✅ Edge 16+

All modern browsers with CSS Grid and ES6 support.
