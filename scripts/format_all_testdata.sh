#!/usr/bin/env bash

# Determine paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TESTDATA_DIR="$PROJECT_ROOT/golang/logformat/testdata"
FORMATTER_SCRIPT="$SCRIPT_DIR/format_log_for_upload.py"

# Default player name for test data
PLAYER_NAME="TestPlayer"

echo "Searching for WoWCombatLog.txt files in: $TESTDATA_DIR"
echo "------------------------------------------------------------"

# Find all WoWCombatLog.txt files
mapfile -t LOG_FILES < <(find "$TESTDATA_DIR" -name "WoWCombatLog.txt" -type f)

if [ ${#LOG_FILES[@]} -eq 0 ]; then
    echo "No WoWCombatLog.txt files found in testdata directories."
    exit 0
fi

echo "Found ${#LOG_FILES[@]} combat log(s) to format:"
echo

# Counters
SUCCESS_COUNT=0
FAIL_COUNT=0

# Format each log file
for LOG_FILE in "${LOG_FILES[@]}"; do
    echo "Formatting: $LOG_FILE"
    
    # Get the directory containing the log file
    LOG_DIR="$(dirname "$LOG_FILE")"
    
    # Run the formatter
    if (cd "$LOG_DIR" && python3 "$FORMATTER_SCRIPT" -p "$PLAYER_NAME" -f "$LOG_FILE"); then
        ((SUCCESS_COUNT++))
        echo "  ✓ Success"
    else
        ((FAIL_COUNT++))
        echo "  ✗ Failed"
    fi
    echo
done

# Summary
echo "------------------------------------------------------------"
echo "Summary: $SUCCESS_COUNT succeeded, $FAIL_COUNT failed"

# Exit with error if any failed
[ $FAIL_COUNT -eq 0 ] || exit 1
