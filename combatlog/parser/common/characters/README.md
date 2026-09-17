# Encounter character behaviors

Encounter-specific character factories can compose reusable wrappers from this
package around a `CharacterBase`. Wrappers add lifecycle behavior while keeping
boss-specific logic out of the instance fight detector.

## Starting a new fight

Use `NewStartsNewFight` for a boss whose first activity is a hard boundary from
an already-active trash fight:

```go
boss := characters.NewCommonCharacter(id, all)
return characters.NewStartsNewFight(boss), true
```

A wrapped character implements the internal `FightStartSplitter` capability.
When it transitions from inactive to active while another fight is open, the
instance engine:

1. Finalizes the existing fight at the triggering message timestamp.
2. Runs the existing fight's `FightEnded` hooks.
3. Creates a new fight from the wrapped character's activity period.
4. Runs `FightStarted` hooks for the new fight on the same message.

This prevents continuously active trash or pre-pull adds from moving a boss's
start time earlier or appearing in the boss encounter. The preceding activity
is retained as its own finalized fight rather than discarded.

`StartsNewFight` delegates normal `CharacterBase` behavior and phase definitions
to the wrapped character, so it can be composed with wrappers such as
`AdsGoWithBoss`:

```go
boss, ok := characters.NewAdsGoWithBoss(bossEntry, addEntries...)(id, all)
if !ok {
	return nil, false
}
return characters.NewStartsNewFight(boss), true
```

### When to use it

Use this wrapper when all of the following are true:

- A specific character becoming active defines the authoritative pull start.
- Earlier hostile activity may still be open at that timestamp.
- That earlier activity must not count toward the new encounter's duration.

Do not use it merely to hide adds from encounter output. Normal inactive or
slain adds intentionally remain members of the fight they participated in.
Encounter-specific add cleanup, timeout, and death semantics should remain in
the relevant character implementation.

### Processing guarantees

Fight detection runs after every character processes the triggering message.
The split is therefore based on the message's recorded `ActivityStart` event,
not iteration order. A character already present in the active fight does not
split it again when its activity is bumped.
