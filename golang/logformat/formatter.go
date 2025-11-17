// Package logformat provides functionality to format World of Warcraft combat logs
// for upload by replacing "You/Your" references with actual player names.
package logformat

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
)

// Formatter handles the conversion of WoW combat log files
type Formatter struct {
	playerName string
	
	// Sets for tracking pets and owners
	petNames        map[string]bool
	ownerNames      map[string]bool
	petRenames      map[string]bool
	
	// Compiled regex patterns (cached for performance)
	mobNamesWithApostrophe    map[string]string
	petRenameReplacements     map[*regexp.Regexp]string
	petReplacements           map[*regexp.Regexp]string
	youReplacements           map[*regexp.Regexp]string
	genericReplacements       map[*regexp.Regexp]string
	renames                   map[*regexp.Regexp]string
	friendlyFire              map[*regexp.Regexp]string
	selfDamage                map[*regexp.Regexp]string
	lootReplacements          map[*regexp.Regexp]string
	
	// Constants
	summonedPetNames      map[string]bool
	ignoredPetNames       map[string]bool
	summonedPetOwnerRegex *regexp.Regexp
}

// NewFormatter creates a new log formatter with the specified player name
func NewFormatter(playerName string) *Formatter {
	f := &Formatter{
		playerName:     strings.TrimSpace(strings.Title(strings.ToLower(playerName))),
		petNames:       make(map[string]bool),
		ownerNames:     make(map[string]bool),
		petRenames:     make(map[string]bool),
	}
	
	f.initializeReplacements()
	return f
}

// initializeReplacements sets up all the regex patterns and replacement maps
func (f *Formatter) initializeReplacements() {
	// Letter pattern including Unicode for unit names
	// Note: Go's regexp uses \p{L} for Unicode letters, but we use explicit ranges for compatibility
	L := `a-zA-ZÀ-ſ`
	
	// Mob names with apostrophes have top priority
	f.mobNamesWithApostrophe = map[string]string{
		"Onyxia's Elite Guard":               "Onyxias Elite Guard",
		"Sartura's Royal Guard":              "Sarturas Royal Guard",
		"Medivh's Merlot Blue Label":         "Medivhs Merlot Blue Label",
		"Ima'ghaol, Herald of Desolation":   "Imaghaol, Herald of Desolation",
	}
	
	// Initialize sets
	f.summonedPetNames = map[string]bool{
		"Greater Feral Spirit":   true,
		"Battle Chicken":         true,
		"Arcanite Dragonling":    true,
		"The Lost":               true,
		"Minor Arcane Elemental": true,
		"Scytheclaw Pureborn":    true,
		"Explosive Trap I":       true,
		"Explosive Trap II":      true,
		"Explosive Trap III":     true,
	}
	
	f.ignoredPetNames = map[string]bool{
		"Razorgore the Untamed (":  true,
		"Deathknight Understudy (": true,
		"Naxxramas Worshipper (":   true,
	}
	
	// Compile regex patterns
	f.summonedPetOwnerRegex = regexp.MustCompile(fmt.Sprintf(`([%s][%s ]+[%s]) \(([%s]+)\)`, L, L, L, L))
	
	// Pet replacements
	f.petReplacements = map[*regexp.Regexp]string{
		regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\) (hits|crits|misses)`, L, L, L, L)):                 `  $2's Auto Attack (pet) $3`,
		regexp.MustCompile(fmt.Sprintf(`  Your ([%s][%s ]+[%s]) \(([%s]+)\) is dismissed\.`, L, L, L, L)):                 `  $2's $1 ($2) is dismissed.`,
		regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's) Arcane Missiles`, L, L, L, L)):            `  $2 's Arcane Missiles (pet)`,
		regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's)`, L, L, L, L)):                            `  $2 's`,
		regexp.MustCompile(fmt.Sprintf(`from ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's)`, L, L, L, L)):                         `from $2's`,
	}
	
	// You replacements - note: order matters!
	playerName := f.playerName
	f.youReplacements = map[*regexp.Regexp]string{
		regexp.MustCompile(`.*You fail to cast.*\n`):                                                   "",
		regexp.MustCompile(`.*You fail to perform.*\n`):                                                "",
		regexp.MustCompile(` You suffer (.*?) from your`):                                              fmt.Sprintf(` %s suffers $1 from %s (self damage) 's`, playerName, playerName),
		regexp.MustCompile(` Your (.*?) hits you for`):                                                 fmt.Sprintf(` %s (self damage) 's $1 hits %s for`, playerName, playerName),
		regexp.MustCompile(` Your (.*?) is parried by`):                                                fmt.Sprintf(` %s 's $1 was parried by`, playerName),
		regexp.MustCompile(` Your (.*?) failed`):                                                       fmt.Sprintf(` %s 's $1 fails`, playerName),
		regexp.MustCompile(` failed\. You are immune`):                                                 fmt.Sprintf(` fails. %s is immune`, playerName),
		regexp.MustCompile(` [Yy]our `):                                                                fmt.Sprintf(` %s 's `, playerName),
		regexp.MustCompile(` You gain (.*?) from (.*?)'s`):                                             fmt.Sprintf(` %s gains $1 from $2 's`, playerName),
		regexp.MustCompile(` You gain (.*?) from `):                                                    fmt.Sprintf(` %s gains $1 from %s 's `, playerName, playerName),
		regexp.MustCompile(` You gain`):                                                                fmt.Sprintf(` %s gains`, playerName),
		regexp.MustCompile(` You hit`):                                                                 fmt.Sprintf(` %s hits`, playerName),
		regexp.MustCompile(` You crit`):                                                                fmt.Sprintf(` %s crits`, playerName),
		regexp.MustCompile(` You are`):                                                                 fmt.Sprintf(` %s is`, playerName),
		regexp.MustCompile(` You suffer`):                                                              fmt.Sprintf(` %s suffers`, playerName),
		regexp.MustCompile(` You lose`):                                                                fmt.Sprintf(` %s loses`, playerName),
		regexp.MustCompile(` You die`):                                                                 fmt.Sprintf(` %s dies`, playerName),
		regexp.MustCompile(` You cast`):                                                                fmt.Sprintf(` %s casts`, playerName),
		regexp.MustCompile(` You create`):                                                              fmt.Sprintf(` %s creates`, playerName),
		regexp.MustCompile(` You perform`):                                                             fmt.Sprintf(` %s performs`, playerName),
		regexp.MustCompile(` You interrupt`):                                                           fmt.Sprintf(` %s interrupts`, playerName),
		regexp.MustCompile(` You miss`):                                                                fmt.Sprintf(` %s misses`, playerName),
		regexp.MustCompile(` You attack`):                                                              fmt.Sprintf(` %s attacks`, playerName),
		regexp.MustCompile(` You block`):                                                               fmt.Sprintf(` %s blocks`, playerName),
		regexp.MustCompile(` You parry`):                                                               fmt.Sprintf(` %s parries`, playerName),
		regexp.MustCompile(` You dodge`):                                                               fmt.Sprintf(` %s dodges`, playerName),
		regexp.MustCompile(` You resist`):                                                              fmt.Sprintf(` %s resists`, playerName),
		regexp.MustCompile(` You absorb`):                                                              fmt.Sprintf(` %s absorbs`, playerName),
		regexp.MustCompile(` You reflect`):                                                             fmt.Sprintf(` %s reflects`, playerName),
		regexp.MustCompile(` You receive`):                                                             fmt.Sprintf(` %s receives`, playerName),
		regexp.MustCompile(`&You receive`):                                                             fmt.Sprintf(`&%s receives`, playerName),
		regexp.MustCompile(` You deflect`):                                                             fmt.Sprintf(` %s deflects`, playerName),
		regexp.MustCompile(`was dodged\.`):                                                             fmt.Sprintf(`was dodged by %s.`, playerName),
		regexp.MustCompile(`causes you`):                                                               fmt.Sprintf(`causes %s`, playerName),
		regexp.MustCompile(`heals you`):                                                                fmt.Sprintf(`heals %s`, playerName),
		regexp.MustCompile(`hits you for`):                                                             fmt.Sprintf(`hits %s for`, playerName),
		regexp.MustCompile(`crits you for`):                                                            fmt.Sprintf(`crits %s for`, playerName),
		regexp.MustCompile(` You have slain (.*?)!`):                                                   fmt.Sprintf(` $1 is slain by %s.`, playerName),
		regexp.MustCompile(`(\S)\s+you\.`):                                                             fmt.Sprintf(`$1 %s.`, playerName),
		regexp.MustCompile(` You fall and lose`):                                                       fmt.Sprintf(` %s falls and loses`, playerName),
	}
	
	// Generic replacements
	f.genericReplacements = map[*regexp.Regexp]string{
		regexp.MustCompile(` fades from .*\.`):                                       `$0`,
		regexp.MustCompile(` gains .*\)\.`):                                          `$0`,
		regexp.MustCompile(` is afflicted by .*\)\.`):                                `$0`,
		regexp.MustCompile(fmt.Sprintf(`  ([%s'\- ]*?\S)'s ([A-Z])`, L)):            `  $1 's $2`,
		regexp.MustCompile(fmt.Sprintf(`from ([%s'\- ]*?\S)'s ([A-Z])`, L)):         `from $1 's $2`,
		regexp.MustCompile(fmt.Sprintf(`is immune to ([%s'\- ]*?\S)'s ([A-Z])`, L)): `is immune to $1 's $2`,
		regexp.MustCompile(`\)'s ([A-Z])`):                                           `) 's $1`,
	}
	
	// Renames
	f.renames = map[*regexp.Regexp]string{
		regexp.MustCompile(fmt.Sprintf(`  [A-Z][%s ]* Totem [IVX]+ \((.*?)\) 's`, L)):        `  $1 's`,
		regexp.MustCompile(fmt.Sprintf(` from [A-Z][%s ]* Totem [IVX]+ \((.*?)\) 's`, L)):    ` from $1 's`,
		regexp.MustCompile(`Lightning Strike was resisted`):                                   `Lightning Strike (nature) was resisted`,
		regexp.MustCompile(`Lightning Strike (.*) Nature damage`):                             `Lightning Strike (nature) $1 Nature damage`,
		regexp.MustCompile(`Onyxias Elite Guard`):                                             `Onyxia's Elite Guard`,
		regexp.MustCompile(`Sarturas Royal Guard`):                                            `Sartura's Royal Guard`,
	}
	
	// Friendly fire
	f.friendlyFire = map[*regexp.Regexp]string{
		regexp.MustCompile(fmt.Sprintf(`from ([%s]*?) 's Power Overwhelming`, L)): `from $1 (self damage) 's Power Overwhelming`,
	}
	
	// Self damage
	f.selfDamage = map[*regexp.Regexp]string{
		regexp.MustCompile(fmt.Sprintf(`  ([%s' ]*?) suffers (.*) (damage) from ([%s' ]*?) 's`, L, L)):     `  $1 suffers $2 damage from $4 (self damage) 's`,
		regexp.MustCompile(fmt.Sprintf(`  ([%s' ]*?) 's (.*) (hits|crits) ([%s' ]*?) for`, L, L)):          `  $1 (self damage) 's $2 $3 $4 for`,
	}
	
	// Loot replacements
	f.lootReplacements = map[*regexp.Regexp]string{
		regexp.MustCompile(`\|h\|r\.$`): `|h|rx1.`,
	}
	
	// Initialize pet rename replacements as empty (will be populated during processing)
	f.petRenameReplacements = make(map[*regexp.Regexp]string)
}

// handleReplacements applies the first matching replacement pattern to a line
func handleReplacements(line string, replacements map[*regexp.Regexp]string) string {
	for pattern, replacement := range replacements {
		if pattern.MatchString(line) {
			return pattern.ReplaceAllString(line, replacement)
		}
	}
	return line
}

// handleSimpleReplacements applies simple string replacements (non-regex)
func handleSimpleReplacements(line string, replacements map[string]string) string {
	for pattern, replacement := range replacements {
		if strings.Contains(line, pattern) {
			return strings.ReplaceAll(line, pattern, replacement)
		}
	}
	return line
}

// FormatLog processes a combat log file and returns the formatted content
func (f *Formatter) FormatLog(reader io.Reader) ([]string, error) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024) // Increase buffer size for long lines
	
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text()+"\n")
	}
	
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading input: %w", err)
	}
	
	// First pass: collect pet names and modify lines
	f.collectPetInfo(lines)
	
	// Second pass: perform all replacements
	for i := range lines {
		lines[i] = f.processLine(lines[i])
	}
	
	return lines, nil
}

// collectPetInfo scans through lines to collect pet and owner information
func (f *Formatter) collectPetInfo(lines []string) {
	for i := range lines {
		// Normalize DPSMate format
		lines[i] = strings.ReplaceAll(lines[i], " 's", "'s")
		
		if strings.Contains(lines[i], "COMBATANT_INFO") {
			f.processCombatantInfo(&lines[i])
		} else if strings.Contains(lines[i], "LOOT:") {
			lines[i] = handleReplacements(lines[i], f.lootReplacements)
		} else {
			// Check for summoned pets
			for petName := range f.summonedPetNames {
				if strings.Contains(lines[i], petName) {
					if match := f.summonedPetOwnerRegex.FindStringSubmatch(lines[i]); match != nil {
						f.petNames[petName] = true
						f.ownerNames[fmt.Sprintf("(%s)", match[2])] = true
					}
				}
			}
		}
	}
	
	// Print collected info
	if len(f.ownerNames) > 0 {
		owners := make([]string, 0, len(f.ownerNames))
		for owner := range f.ownerNames {
			owners = append(owners, owner)
		}
		fmt.Printf("The following pet owners will have their pet hits/crits/misses/spells associated with them: %v\n", owners)
	}
	
	if len(f.petRenames) > 0 {
		renames := make([]string, 0, len(f.petRenames))
		for rename := range f.petRenames {
			renames = append(renames, rename)
		}
		fmt.Printf("The following pets will be renamed to avoid having the same name as their owner: %v\n", renames)
	}
}

// processCombatantInfo parses COMBATANT_INFO lines and extracts pet information
func (f *Formatter) processCombatantInfo(line *string) {
	parts := strings.Split(*line, "&")
	if len(parts) < 6 {
		return
	}
	
	petName := parts[5]
	if petName == "nil" {
		return
	}
	
	// Check if pet name should be ignored
	for ignored := range f.ignoredPetNames {
		if strings.Contains(petName, ignored) {
			parts[5] = "nil"
			*line = strings.Join(parts, "&")
			return
		}
	}
	
	ownerName := parts[1]
	
	// Rename pets that have the same name as their owner
	if petName == ownerName {
		f.petRenames[petName] = true
		newPetName := petName + "Pet"
		
		// Create regex for this specific pet rename
		pattern := regexp.MustCompile(regexp.QuoteMeta(petName) + ` \(` + regexp.QuoteMeta(ownerName) + `\)`)
		f.petRenameReplacements[pattern] = newPetName + " (" + ownerName + ")"
		
		parts[5] = newPetName
		petName = newPetName
	}
	
	f.petNames[petName] = true
	f.ownerNames[fmt.Sprintf("(%s)", ownerName)] = true
	
	*line = strings.Join(parts, "&")
}

// processLine applies all replacement rules to a single line
func (f *Formatter) processLine(line string) string {
	// Mob names with apostrophes
	line = handleSimpleReplacements(line, f.mobNamesWithApostrophe)
	
	// Handle pet renames
	if len(f.petRenameReplacements) > 0 {
		line = handleReplacements(line, f.petRenameReplacements)
	}
	
	// Handle pets
	for ownerName := range f.ownerNames {
		if strings.Contains(line, ownerName) {
			// Ignore pet dying
			if strings.Contains(line, "dies.") || strings.Contains(line, "is killed by") {
				continue
			}
			
			// Check if line contains any ignored pet names
			shouldIgnore := false
			for ignoredPetName := range f.ignoredPetNames {
				if strings.Contains(line, ignoredPetName) {
					shouldIgnore = true
					break
				}
			}
			
			if !shouldIgnore {
				line = handleReplacements(line, f.petReplacements)
			}
		}
	}
	
	// Handle "you/You" replacements
	if strings.Contains(line, "you") || strings.Contains(line, "You") || strings.Contains(line, "dodged.") {
		line = handleReplacements(line, f.youReplacements)
		// Apply twice for self-cast scenarios
		line = handleReplacements(line, f.youReplacements)
	}
	
	// Generic replacements
	line = handleReplacements(line, f.genericReplacements)
	
	// Renames
	line = handleReplacements(line, f.renames)
	
	// Friendly fire exceptions
	for pattern, replacement := range f.friendlyFire {
		if match := pattern.FindStringSubmatch(line); match != nil {
			line = pattern.ReplaceAllString(line, replacement)
			break
		}
	}
	
	// Self damage - check if player is damaging themselves
	for pattern, replacement := range f.selfDamage {
		if match := pattern.FindStringSubmatch(line); match != nil && len(match) >= 5 {
			// Check that group 1 and 4 are equal (player hitting themselves)
			if strings.TrimSpace(match[1]) == strings.TrimSpace(match[4]) {
				line = pattern.ReplaceAllString(line, replacement)
				break
			}
		}
	}
	
	return line
}

// FormatFile processes a combat log file and writes the output to a new file
func (f *Formatter) FormatFile(inputPath, outputPath string) error {
	inputFile, err := os.Open(inputPath)
	if err != nil {
		return fmt.Errorf("error opening input file: %w", err)
	}
	defer inputFile.Close()
	
	lines, err := f.FormatLog(inputFile)
	if err != nil {
		return err
	}
	
	outputFile, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("error creating output file: %w", err)
	}
	defer outputFile.Close()
	
	writer := bufio.NewWriter(outputFile)
	for _, line := range lines {
		if _, err := writer.WriteString(line); err != nil {
			return fmt.Errorf("error writing to output file: %w", err)
		}
	}
	
	if err := writer.Flush(); err != nil {
		return fmt.Errorf("error flushing output: %w", err)
	}
	
	return nil
}
