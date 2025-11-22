package format_old

import (
  "regexp"
  "strings"

  "github.com/Emyrk/chronicle/golang/wowlogs/lines"
  "github.com/Emyrk/chronicle/golang/wowlogs/types/combatant"
)

const (
  combatantPrefix = "COMBATANT_INFO:"
  lootPrefix      = "LOOT_ITEM:"
)

type Formatter struct {
  playerName string
  pets       *pets
  replace    *replacer
  combatants map[string]combatant.Combatant

  l *lines.Liner
}

func NewFormatter(playerName string) *Formatter {
  return &Formatter{
    playerName: playerName,
    pets:       newPets(),
    replace:    newReplacer(playerName),
    l:          lines.NewLiner(),
  }
}

func (f *Formatter) FormatLine(line string) string {
  if f.combatantLine(line) {
    return line
  }

  line = f.lootLine(line)

  // Look for summoned pets
  for petName := range f.replace.summonedPetNames {
    if strings.Contains(line, petName) {
      if match := f.replace.summonedPetOwnerRegex.FindStringSubmatch(line); match != nil {
        f.addPet(match[2], petName)
      }
    }
  }

  return f.processLine(line)
}

func (f *Formatter) processLine(line string) string {
  // Normalize DPSMate format
  line = strings.ReplaceAll(line, " 's", "'s")

  line = handleStringReplacements(line, f.replace.mobNamesWithApostrophe)
  line = handleReplacements(line, f.replace.petReplacements)

  // Handle pets
  // TODO: What is the point of this?
  for ownerName := range f.pets.ownerToPet {
    if strings.Contains(line, ownerName) {
      // Ignore pet dying
      if strings.Contains(line, "dies.") || strings.Contains(line, "is killed by") {
        continue
      }

      // Check if line contains any ignored pet names
      shouldIgnore := false
      for ignoredPetName := range f.replace.ignoredPetNames {
        if strings.Contains(line, ignoredPetName) {
          shouldIgnore = true
          break
        }
      }

      if !shouldIgnore {
        line = handleReplacements(line, f.replace.petReplacements)
      }
    }
  }

  // Handle "you/You" replacements
  if strings.Contains(line, "you") || strings.Contains(line, "You") || strings.Contains(line, "dodged.") {
    line = handleReplacements(line, f.replace.youReplacements)
    // Apply twice for self-cast scenarios
    line = handleReplacements(line, f.replace.youReplacements)
  }

  line = handleReplacements(line, f.replace.genericReplacements)
  line = handleReplacements(line, f.replace.renames)

  // Friendly fire exceptions
  for pattern, replacement := range f.replace.friendlyFire {
    if match := pattern.FindStringSubmatch(line); match != nil {
      line = pattern.ReplaceAllString(line, replacement)
      break
    }
  }

  // Self damage - check if player is damaging themselves
  for pattern, replacement := range f.replace.selfDamage {
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

func handleStringReplacements(line string, replacements map[string]string) string {
  for pattern, replacement := range replacements {
    line = strings.ReplaceAll(line, pattern, replacement)
  }
  return line
}

func handleReplacements(line string, replacements map[*regexp.Regexp]string) string {
  for pattern, replacement := range replacements {
    if pattern.MatchString(line) {
      return pattern.ReplaceAllString(line, replacement)
    }
  }
  return line
}

func (f *Formatter) lootLine(line string) string {
  prefix := "10/29 22:17:57.762  "
  isLoot := len(line) > len(prefix)+len(lootPrefix) &&
    line[len(prefix):len(prefix)+len(lootPrefix)] == lootPrefix
  if !isLoot {
    return line
  }

  return handleReplacements(line, f.replace.lootReplacements)
}

func (f *Formatter) combatantLine(line string) bool {
  prefix := "10/29 22:17:57.762  "
  isCombatant := len(line) > len(prefix)+len(combatantPrefix) &&
    line[len(prefix):len(prefix)+len(combatantPrefix)] == combatantPrefix
  if !isCombatant {
    return false
  }

  _, content, err := f.l.Line(line)
  if err != nil {
    // TODO: log error
    return false
  }

  player, err := combatant.ParseCombatantInfo(content)
  if err != nil {
    // TODO: log error
    return false
  }

  if player.PetName != "" {
    f.addPet(player.Name, player.PetName)
  }

  return true
}

func (f *Formatter) addPet(ownerName, petName string) {
  newPetName := petName + "Pet"
  f.pets.AddPet(ownerName, petName)
  pattern := regexp.MustCompile(regexp.QuoteMeta(petName) + ` \(` + regexp.QuoteMeta(ownerName) + `\)`)
  f.replace.petReplacements[pattern] = newPetName + " (" + ownerName + ")"
}
