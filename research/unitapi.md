
AssistUnit("unit")   - Instructs your character to assist the specified unit.
CheckInteractDistance("unit",distIndex)
DropItemOnUnit("unit")   - Drops an item from the cursor onto a unit.
FollowUnit("unit")   - Follow an ally with the specified UnitID
InviteToParty("unit")   - Invite a unit to a party by its unit id (likely "target")
IsUnitOnQuest(questIndex, "unit")   - Determine if the specified unit is on the given quest.
SpellCanTargetUnit("unit")   - Returns true if the spell awaiting target selection can be cast on the specified unit.
SpellTargetUnit("unit")   - Casts the spell awaiting target selection on the specified unit.
StartDuelUnit("unit")   - Challenge a unit to a duel.
TargetUnit("unit")   - Selects the specified unit as the current target.
UnitAffectingCombat("unit")   - Determine if the unit is in combat or has aggro. (returns nil if "false" and 1 if "true")
UnitArmor("unit")   - Returns the armor statistics relevant to the specified unit.
UnitAttackBothHands("unit")   - Returns information about the unit's melee attacks.
UnitAttackPower("unit")   - Returns the unit's melee attack power and modifiers.
UnitAttackSpeed("unit")   - Returns the unit's melee attack speed for each hand.
UnitBuff("unit", index[, showCastable])   - Retrieves info about a buff of a certain unit.
UnitCanAssist("unit", "otherUnit")   - Returns true if the first unit can assist the second, false otherwise.
UnitCanAttack("unit", "otherUnit")   - Returns true if the first unit can attack the second, false otherwise.
UnitCanCooperate("unit", "otherUnit")   - Returns true if the first unit can cooperate with the second, false otherwise.
UnitCharacterPoints("unit")   - Returns the number of unspent talent points for the specified unit -- usually 0.
UnitClass("unit")   - Returns the class name of the specified unit (e.g., "Warrior" or "Shaman").
UnitClassification("unit")   - Returns the classification of the specified unit (e.g., "elite" or "worldboss").
UnitCreatureFamily("unit")   - Returns the type of creature of the specified unit (e.g., "Crab").
UnitCreatureType("unit")   - Returns the classification type of creature of the specified unit (e.g., "Beast").
UnitDamage("unit")   - Returns the damage statistics relevant to the specified unit.
UnitDebuff("unit", index[, showDispellable])   - Retrieves info about a debuff of a certain unit.
UnitDefense("unit")   - Returns the base defense skill of the specified unit.
UnitExists("unit")   - Returns true if the specified unit exists, false otherwise.
UnitFactionGroup("unit")   - Returns the faction group id and name of the specified unit. (eg. "Alliance")   - string returned is localization-independent (used in filepath)
UnitHealth("unit")   - Returns the current health, in points, of the specified unit.
UnitHealthMax("unit")   - Returns the maximum health, in points, of the specified unit.
UnitInParty("unit")   - Returns true if the unit is a member of your party.
UnitInRaid("unit")   - Returns 1 if unit is in your raid, nil if not.
UnitIsCharmed("unit")   - Returns true if the specified unit is charmed, false otherwise.
UnitIsCivilian("unit")   - Returns true if the unit is a civilian NPC.
UnitIsConnected("unit")   - Returns 1 if the specified unit is connected or npc, nil if offline or not a valid unit.
UnitIsCorpse("unit")   - Returns true if the specified unit is a corpse, false otherwise.
UnitIsDead("unit")   - Returns true if the specified unit is dead, nil otherwise.
UnitIsDeadOrGhost("unit")   - Returns true if the specified unit is dead or a ghost, nil otherwise.
UnitIsEnemy("unit", "otherUnit")   - Returns true if the specified units are enemies, false otherwise.
UnitIsFriend("unit", "otherUnit")   - Returns true if the specified units are friends (PC of same faction or friendly NPC), false otherwise.
UnitIsGhost("unit")   - Returns true if the specified unit is a ghost, false otherwise.
UnitIsPVP("unit")   - Returns true if the specified unit is flagged for PVP, false otherwise.
UnitIsPVPFreeForAll("unit")   - Returns true if the specified unit is flagged for free-for-all PVP, false otherwise.
UnitIsPartyLeader("unit")   - Returns true if the unit is the leader of its party.
UnitIsPlayer("unit")   - Returns true if the specified unit is a player character, false otherwise.
UnitIsPlusMob("unit")   - Returns true if the specified unit is a mob, more powerful than its nominal level, false otherwise (e.g., "elite" mobs)
UnitIsTapped("unit")   - Returns true if the specified unit is tapped, false otherwise.
UnitIsTappedByPlayer("unit")   - Returns true if the specified unit is tapped by the player himself, otherwise false.
UnitIsTrivial("unit")   - Returns true if the specified unit is trivial (Trivial means the unit is "grey" to the player. false otherwise.
UnitIsUnit("unit", "otherUnit")   - Determine if two units are the same unit.
UnitIsVisible("unit")   - 1 if visible, nil if not
UnitLevel("unit")   - Returns the level of a unit.
UnitMana("unit")   - Returns the current mana (or energy,rage,etc), in points, of the specified unit.
UnitManaMax("unit")   - Returns the maximum mana (or energy,rage,etc), in points, of the specified unit.
UnitName("unit")   - Returns the name (and realm name) of a unit.
UnitOnTaxi("unit")   - Returns 1 if unit is on a taxi.
UnitPlayerControlled("unit")   - Returns true if the specified unit is controlled by a player, false otherwise.
UnitPlayerOrPetInParty("unit")   - Returns 1 if the specified unit/pet is a member of the player's party, nil otherwise (returns 1 for "player" and "pet")   - Added in 1.12
UnitPlayerOrPetInRaid("unit")   - Returns 1 if the specified unit/pet is a member of the player's raid, nil otherwise (returns 1 for "player" and "pet")   - Added in 1.12
UnitPVPName("unit")   - Returns unit's name with PvP rank prefix (e.g., "Corporal Allianceguy").
UnitPVPRank("unit")   - Get PvP rank information for requested unit.
UnitPowerType("unit")   - Returns a number corresponding to the power type (e.g., mana, rage or energy) of the specified unit.
UnitRace("unit")   - Returns the race name of the specified unit (e.g., "Human" or "Troll").
UnitRangedAttack("unit")   - Returns the ranged attack number of the unit.
UnitRangedAttackPower("unit")   - Returns the ranged attack power of the unit.
UnitRangedDamage("unit")   - Returns the ranged attack speed and damage of the unit.
UnitReaction("unit", "otherUnit")   - Returns a number corresponding to the reaction (aggressive, neutral or friendly) of the first unit towards the second unit.
UnitResistance("unit", "resistanceIndex")   - Returns the resistance statistics relevant to the specified unit and resistance type.
UnitSex("unit")   - Returns a code indicating the gender of the specified unit, if known. (1=unknown, 2=male, 3=female) ← changed in 1.11!
UnitStat("unit", statIndex)   - Returns the statistics relevant to the specified unit and basic attribute (e.g., strength or intellect).
UnitXP("unit")   - Returns the number of experience points the specified unit has in their current level. (only works on your player)
UnitXPMax("unit")   - Returns the number of experience points the specified unit needs to reach their next level. (only works on your player)
SetPortraitTexture(texture,"unit")   - Paint a Texture object with the specified unit's portrait.
SetPortraitToTexture("texture", icon)   - Paint a Texture object with the given Texture ?