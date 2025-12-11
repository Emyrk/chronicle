# Overlapping Activities Detection - Implementation Summary

## Problem
The UI was hiding overlapping activity periods for the same character, making it difficult to see when a character had multiple concurrent activities or data inconsistencies.

## Solution
Implemented comprehensive overlap detection and visualization:

### 1. Visual Warning Indicators
- **Warning Icon (⚠️)**: Added animated warning emoji next to character names with overlaps
- **Pulsing Animation**: Icon pulses to draw attention
- **Tooltip**: Hover shows explanation of the issue

### 2. Stacked Activity View
When overlaps are detected, activities are displayed in multiple rows (layers):
- **Automatic Layer Assignment**: Algorithm assigns overlapping periods to separate visual layers
- **Striped Background**: Yellow diagonal stripes indicate overlapping state
- **Dashed Border**: Orange dashed border around the track
- **Separated Subtracks**: Each layer gets its own horizontal track

### 3. Enhanced Visual Styling
- **Thicker Borders**: Overlapping periods have 3px borders vs normal 2px
- **Box Shadows**: Added depth to make overlaps stand out
- **Golden Outline**: Subtle golden outline around overlapping periods
- **Semi-transparent Layers**: Each subtrack has slight transparency

## Code Changes

### JavaScript (site/app.js)

#### New Functions:

1. **`detectOverlappingPeriods(periods)`**
   - Checks if any activity periods overlap in time
   - Returns boolean true if overlaps detected
   - Time complexity: O(n²) where n is number of periods

2. **`assignPeriodsToLayers(periods)`**
   - Assigns overlapping periods to separate visual layers
   - Uses greedy algorithm to minimize layers
   - Returns array of layer arrays
   - Time complexity: O(n² × m) where m is average periods per layer

#### Modified Functions:

1. **`createCharacterRow()`**
   - Now detects overlaps before rendering
   - Adds warning icon if overlaps found
   - Creates multi-row layout for overlapping periods
   - Dynamically adjusts track height based on layer count

### CSS (site/index.html)

#### New Styles:

```css
.overlap-warning {
    /* Animated warning icon */
    animation: pulse 2s ease-in-out infinite;
}

.activity-track.has-overlaps {
    /* Yellow striped background */
    border: 2px dashed #f59e0b;
    background: repeating-linear-gradient(...);
}

.activity-subtrack {
    /* Individual layer containers */
    position: absolute;
    height: 30px;
}

.activity-period.overlapping {
    /* Enhanced styling for overlapped periods */
    border-width: 3px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
```

### Legend Update
Added new legend item explaining the ⚠️ symbol and stacked view.

## Algorithm Details

### Overlap Detection
```javascript
// Two periods overlap if:
start1 < end2 AND start2 < end1
```

### Layer Assignment
1. Sort periods by start time
2. For each period:
   - Try to place in existing layer (no overlap)
   - If no suitable layer, create new one
3. Result: Minimum layers needed to show all periods without overlap

## Visual Examples

### Before (Hidden Overlaps):
```
Character1  |████████████████|
```
(Second period hidden underneath)

### After (Visible Overlaps):
```
⚠️ Character1  |████████████████|  ← Layer 1
               |████████|         ← Layer 2
```
(Yellow striped background, dashed border)

## Benefits

1. **Immediate Visual Feedback**: Warning icon instantly indicates issues
2. **Data Integrity**: Makes log parsing problems apparent
3. **Debugging**: Helps identify duplicate events or timing issues
4. **Accessibility**: Color, shape, and icon cues for different users
5. **Scalability**: Handles any number of overlapping periods

## Testing

To test the implementation:

1. Build the WASM module: `make wasm`
2. Start dev server: `make serve`
3. Load combat logs with overlapping activities
4. Look for ⚠️ icons and stacked views

You can also test the algorithm with `/tmp/test_overlap.html`

## Performance Considerations

- Detection: O(n²) per character - acceptable for typical cases (< 100 periods)
- Layer assignment: O(n² × m) - optimized with early termination
- Rendering: Minimal impact, only characters with overlaps use stacked layout

## Future Enhancements

Potential improvements:
- [ ] Click warning icon to highlight overlapping periods
- [ ] Show overlap duration in tooltip
- [ ] Export overlap report
- [ ] Filter to show only characters with overlaps
- [ ] Color-code overlap severity

## Files Modified

1. `site/app.js` - Added detection logic and modified rendering
2. `site/index.html` - Added CSS styles and legend entry

## Compatibility

Works with all modern browsers supporting:
- CSS Grid
- CSS Animations
- ES6 JavaScript (arrow functions, const/let, spread operator)
