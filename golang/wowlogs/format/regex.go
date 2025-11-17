package format

import (
	"fmt"
	"regexp"
)

type replacer struct {
	petRenameReplacements map[*regexp.Regexp]string
	petReplacements       map[*regexp.Regexp]string
	youReplacements       map[*regexp.Regexp]string
	genericReplacements   map[*regexp.Regexp]string
	renames               map[*regexp.Regexp]string
	friendlyFire          map[*regexp.Regexp]string
	selfDamage            map[*regexp.Regexp]string
	lootReplacements      map[*regexp.Regexp]string

	// Constants
	summonedPetNames       map[string]bool
	ignoredPetNames        map[string]bool
	summonedPetOwnerRegex  *regexp.Regexp
	mobNamesWithApostrophe map[string]string
}

func newReplacer(playerName string) *replacer {
	// Letter pattern including Unicode for unit names
	// Note: Go's regexp uses \p{L} for Unicode letters, but we use explicit ranges for compatibility
	L := `a-zA-ZÀ-ſ`

	return &replacer{
		mobNamesWithApostrophe: map[string]string{
			"Onyxia's Elite Guard":            "Onyxias Elite Guard",
			"Sartura's Royal Guard":           "Sarturas Royal Guard",
			"Medivh's Merlot Blue Label":      "Medivhs Merlot Blue Label",
			"Ima'ghaol, Herald of Desolation": "Imaghaol, Herald of Desolation",
		},
		summonedPetNames: map[string]bool{
			"Greater Feral Spirit":   true,
			"Battle Chicken":         true,
			"Arcanite Dragonling":    true,
			"The Lost":               true,
			"Minor Arcane Elemental": true,
			"Scytheclaw Pureborn":    true,
			"Explosive Trap I":       true,
			"Explosive Trap II":      true,
			"Explosive Trap III":     true,
		},
		ignoredPetNames: map[string]bool{
			"Razorgore the Untamed (":  true,
			"Deathknight Understudy (": true,
			"Naxxramas Worshipper (":   true,
		},
		summonedPetOwnerRegex: regexp.MustCompile(fmt.Sprintf(`([%s][%s ]+[%s]) \(([%s]+)\)`, L, L, L, L)),
		petReplacements: map[*regexp.Regexp]string{
			regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\) (hits|crits|misses)`, L, L, L, L)):     `  $2's Auto Attack (pet) $3`,
			regexp.MustCompile(fmt.Sprintf(`  Your ([%s][%s ]+[%s]) \(([%s]+)\) is dismissed\.`, L, L, L, L)):     `  $2's $1 ($2) is dismissed.`,
			regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's) Arcane Missiles`, L, L, L, L)): `  $2 's Arcane Missiles (pet)`,
			regexp.MustCompile(fmt.Sprintf(`  ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's)`, L, L, L, L)):                 `  $2 's`,
			regexp.MustCompile(fmt.Sprintf(`from ([%s][%s ]+[%s]) \(([%s]+)\)('s| 's)`, L, L, L, L)):              `from $2's`,
		},
		youReplacements: map[*regexp.Regexp]string{
			regexp.MustCompile(`.*You fail to cast.*\n`):       "",
			regexp.MustCompile(`.*You fail to perform.*\n`):    "",
			regexp.MustCompile(` You suffer (.*?) from your`):  fmt.Sprintf(` %s suffers $1 from %s (self damage) 's`, playerName, playerName),
			regexp.MustCompile(` Your (.*?) hits you for`):     fmt.Sprintf(` %s (self damage) 's $1 hits %s for`, playerName, playerName),
			regexp.MustCompile(` Your (.*?) is parried by`):    fmt.Sprintf(` %s 's $1 was parried by`, playerName),
			regexp.MustCompile(` Your (.*?) failed`):           fmt.Sprintf(` %s 's $1 fails`, playerName),
			regexp.MustCompile(` failed\. You are immune`):     fmt.Sprintf(` fails. %s is immune`, playerName),
			regexp.MustCompile(` [Yy]our `):                    fmt.Sprintf(` %s 's `, playerName),
			regexp.MustCompile(` You gain (.*?) from (.*?)'s`): fmt.Sprintf(` %s gains $1 from $2 's`, playerName),
			regexp.MustCompile(` You gain (.*?) from `):        fmt.Sprintf(` %s gains $1 from %s 's `, playerName, playerName),
			regexp.MustCompile(` You gain`):                    fmt.Sprintf(` %s gains`, playerName),
			regexp.MustCompile(` You hit`):                     fmt.Sprintf(` %s hits`, playerName),
			regexp.MustCompile(` You crit`):                    fmt.Sprintf(` %s crits`, playerName),
			regexp.MustCompile(` You are`):                     fmt.Sprintf(` %s is`, playerName),
			regexp.MustCompile(` You suffer`):                  fmt.Sprintf(` %s suffers`, playerName),
			regexp.MustCompile(` You lose`):                    fmt.Sprintf(` %s loses`, playerName),
			regexp.MustCompile(` You die`):                     fmt.Sprintf(` %s dies`, playerName),
			regexp.MustCompile(` You cast`):                    fmt.Sprintf(` %s casts`, playerName),
			regexp.MustCompile(` You create`):                  fmt.Sprintf(` %s creates`, playerName),
			regexp.MustCompile(` You perform`):                 fmt.Sprintf(` %s performs`, playerName),
			regexp.MustCompile(` You interrupt`):               fmt.Sprintf(` %s interrupts`, playerName),
			regexp.MustCompile(` You miss`):                    fmt.Sprintf(` %s misses`, playerName),
			regexp.MustCompile(` You attack`):                  fmt.Sprintf(` %s attacks`, playerName),
			regexp.MustCompile(` You block`):                   fmt.Sprintf(` %s blocks`, playerName),
			regexp.MustCompile(` You parry`):                   fmt.Sprintf(` %s parries`, playerName),
			regexp.MustCompile(` You dodge`):                   fmt.Sprintf(` %s dodges`, playerName),
			regexp.MustCompile(` You resist`):                  fmt.Sprintf(` %s resists`, playerName),
			regexp.MustCompile(` You absorb`):                  fmt.Sprintf(` %s absorbs`, playerName),
			regexp.MustCompile(` You reflect`):                 fmt.Sprintf(` %s reflects`, playerName),
			regexp.MustCompile(` You receive`):                 fmt.Sprintf(` %s receives`, playerName),
			regexp.MustCompile(`&You receive`):                 fmt.Sprintf(`&%s receives`, playerName),
			regexp.MustCompile(` You deflect`):                 fmt.Sprintf(` %s deflects`, playerName),
			regexp.MustCompile(`was dodged\.`):                 fmt.Sprintf(`was dodged by %s.`, playerName),
			regexp.MustCompile(`causes you`):                   fmt.Sprintf(`causes %s`, playerName),
			regexp.MustCompile(`heals you`):                    fmt.Sprintf(`heals %s`, playerName),
			regexp.MustCompile(`hits you for`):                 fmt.Sprintf(`hits %s for`, playerName),
			regexp.MustCompile(`crits you for`):                fmt.Sprintf(`crits %s for`, playerName),
			regexp.MustCompile(` You have slain (.*?)!`):       fmt.Sprintf(` $1 is slain by %s.`, playerName),
			regexp.MustCompile(`(\S)\s+you\.`):                 fmt.Sprintf(`$1 %s.`, playerName),
			regexp.MustCompile(` You fall and lose`):           fmt.Sprintf(` %s falls and loses`, playerName),
		},
		genericReplacements: map[*regexp.Regexp]string{
			regexp.MustCompile(` fades from .*\.`):                                      `$0`,
			regexp.MustCompile(` gains .*\)\.`):                                         `$0`,
			regexp.MustCompile(` is afflicted by .*\)\.`):                               `$0`,
			regexp.MustCompile(fmt.Sprintf(`  ([%s'\- ]*?\S)'s ([A-Z])`, L)):            `  $1 's $2`,
			regexp.MustCompile(fmt.Sprintf(`from ([%s'\- ]*?\S)'s ([A-Z])`, L)):         `from $1 's $2`,
			regexp.MustCompile(fmt.Sprintf(`is immune to ([%s'\- ]*?\S)'s ([A-Z])`, L)): `is immune to $1 's $2`,
			regexp.MustCompile(`\)'s ([A-Z])`):                                          `) 's $1`,
		},
		renames: map[*regexp.Regexp]string{
			regexp.MustCompile(fmt.Sprintf(`  [A-Z][%s ]* Totem [IVX]+ \((.*?)\) 's`, L)):     `  $1 's`,
			regexp.MustCompile(fmt.Sprintf(` from [A-Z][%s ]* Totem [IVX]+ \((.*?)\) 's`, L)): ` from $1 's`,
			regexp.MustCompile(`Lightning Strike was resisted`):                               `Lightning Strike (nature) was resisted`,
			regexp.MustCompile(`Lightning Strike (.*) Nature damage`):                         `Lightning Strike (nature) $1 Nature damage`,
			regexp.MustCompile(`Onyxias Elite Guard`):                                         `Onyxia's Elite Guard`,
			regexp.MustCompile(`Sarturas Royal Guard`):                                        `Sartura's Royal Guard`,
		},
		friendlyFire: map[*regexp.Regexp]string{
			regexp.MustCompile(fmt.Sprintf(`from ([%s]*?) 's Power Overwhelming`, L)): `from $1 (self damage) 's Power Overwhelming`,
		},
		selfDamage: map[*regexp.Regexp]string{
			regexp.MustCompile(fmt.Sprintf(`  ([%s' ]*?) suffers (.*) (damage) from ([%s' ]*?) 's`, L, L)): `  $1 suffers $2 damage from $4 (self damage) 's`,
			regexp.MustCompile(fmt.Sprintf(`  ([%s' ]*?) 's (.*) (hits|crits) ([%s' ]*?) for`, L, L)):      `  $1 (self damage) 's $2 $3 $4 for`,
		},
		lootReplacements: map[*regexp.Regexp]string{
			regexp.MustCompile(`\|h\|r\.$`): `|h|rx1.`,
		},
		// petRenameReplacements will be populated dynamically
		petRenameReplacements: make(map[*regexp.Regexp]string),
	}
}
