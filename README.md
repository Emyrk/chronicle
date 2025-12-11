# Character Timeline Viewer

A beautiful web-based visualization tool for World of Warcraft combat logs that displays character activity timelines across instances. Built with Go WASM and vanilla JavaScript.

## Features

- 📊 **Visual Timeline** - See exactly when each character was active in an instance
- 🎨 **Beautiful UI** - Modern, responsive design with smooth animations
- ⚡ **Fast** - Powered by Go compiled to WebAssembly for near-native performance
- 🔍 **Detailed Info** - Hover over activity periods to see start/end times, duration, and reasons
- 📈 **Overlap Detection** - Easily spot which character timelines overlap
- 🎯 **Activity Tracking** - Shows when characters became active and when they stopped (slain, timeout, etc.)

## How It Works

The application parses World of Warcraft combat log files using the Chronicle parser:

1. **Parser** - Merges `WoWCombatLog.txt` and `WoWCombatLogRaw.txt` files
2. **State Building** - Uses `state.Consume()` to process all combat events
3. **Instance Detection** - Automatically detects dungeon/raid instances
4. **Character Tracking** - Tracks character activity periods with start/end reasons
5. **Timeline Visualization** - Displays interactive timelines showing character activity overlap

## Quick Start

### Available Make Commands

```bash
make wasm     # Build the WASM module
make serve    # Build WASM and start development server
make install  # Install the chronicle CLI tool
make gen      # Generate database code and WASM
```

### Build the WASM Module

```bash
# Using Make (recommended)
make wasm

# Or manually
cd cmd/wasm
GOOS=js GOARCH=wasm go build -o ../../site/parser.wasm
```

### Run the Development Server

```bash
# Using Make (builds WASM and starts server)
make serve

# Or manually
cd site
./serve.sh
```

Then open your browser to `http://localhost:8080`

### Use the Application

1. Click **"WoWCombatLog.txt"** and select your combat log file
2. Click **"WoWCombatLogRaw.txt"** and select your raw combat log file
3. Click **"🔍 Parse & Visualize"**
4. View the interactive character timelines!

## Timeline Visualization

The timeline shows:

- **Green bars** - Active periods (character is participating)
- **Red bars** - Ended periods (character died or timed out)
- **Time labels** - Start, middle, and end times of the instance
- **Tooltips** - Hover over any bar to see detailed information

### Example Timeline

```
Scarlet Monastery Cathedral (5 characters)
┌────────────────────────────────────────────────────────┐
│ Character      │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Healer1        │  ████████████████████████████        │
│ Tank1          │████████████████████████████████████  │
│ DPS1           │  ████████████████████████████████    │
│ DPS2           │    ████████████████████████          │
│ DPS3           │  ██████████████████████████████      │
└────────────────────────────────────────────────────────┘
         10:00:00        10:15:00        10:30:00
```

## Project Structure

```
.
├── cmd/
│   ├── wasm/
│   │   └── main.go          # WASM entry point
│   └── cli/
│       └── parse.go         # CLI parser example
├── site/
│   ├── index.html           # Main HTML page
│   ├── app.js               # Frontend JavaScript
│   ├── parser.wasm          # Compiled WASM module
│   ├── wasm_exec.js         # Go WASM runtime
│   └── serve.sh             # Development server
├── combatlog/
│   └── parser/
│       └── vanilla/
│           └── state/       # State management
│               └── encounters/
│                   ├── characters.go    # Character activity tracking
│                   └── instance.go      # Instance interface
└── README.md
```

## Development

### Prerequisites

- Go 1.21+ (for WASM compilation)
- A web browser with WASM support (all modern browsers)
- Python 3 (for development server)

### Architecture

The application follows this data flow:

1. **File Upload** → Browser reads the combat log files
2. **WASM Processing** → Go parser processes the logs
3. **State Building** → `state.Consume()` creates state from parser events
4. **Timeline Conversion** → Converts state to timeline JSON
5. **Visualization** → JavaScript renders interactive timeline

### Key Components

#### WASM Module (`cmd/wasm/main.go`)

- Exposes `parseWoWLogs()` JavaScript function
- Uses `state.Consume()` pattern from `parse.go`
- Converts instances and characters to timeline format
- Returns JSON with character activity periods

#### Frontend (`site/app.js`)

- Manages file uploads
- Calls WASM parser
- Creates timeline visualization
- Handles user interactions and tooltips

#### State Management (`combatlog/parser/vanilla/state/`)

- **State** - Main state container with instances
- **Instance** - Interface for dungeon/raid instances
- **Characters** - Map of character GUIDs to Character objects
- **Character** - Tracks activity periods with start/end timestamps

## Color Coding

- 🟢 **Active Period** (Green) - Character is actively participating
- 🔴 **Ended Period** (Red) - Character stopped (slain/timeout)

## Browser Compatibility

- ✅ Chrome 57+
- ✅ Firefox 52+
- ✅ Safari 11+
- ✅ Edge 16+

## Performance

- Parses multi-MB log files in seconds
- Smooth 60 FPS timeline rendering
- Handles hundreds of characters without lag

## Future Enhancements

- [ ] Export timeline as image
- [ ] Filter characters by name
- [ ] Zoom and pan timeline
- [ ] Show damage/healing events on timeline
- [ ] Multiple instance comparison view
- [ ] Save/load parsed data

## License

Part of the Chronicle project.

## Credits

Built on top of the Chronicle combat log parser by [@Emyrk](https://github.com/Emyrk).
