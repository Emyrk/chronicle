// Package units defines shared classification facts, not observation ownership,
// player metadata, encounter state, or a general-purpose policy framework.
package units

// Kind describes the entity, independently of encounter or ranking eligibility.
// These distinctions exist in the current GUID API, including vehicles. A vehicle
// kind does not imply an owner, controller, affiliation, or ranking eligibility.
type Kind uint8

const (
	KindUnspecified Kind = iota
	KindPlayer
	KindCreature
	KindPet
	KindObject
	KindVehicle
)

// Category refines an entity kind without turning ignored activity into identity.
type Category uint8

const (
	CategoryUnclassified Category = iota
	CategoryCritter
	// CategoryTotem is an entity category, not a GUID kind or eligibility policy.
	// Hostile boss totems and player-owned totems need not share fight/ranking rules.
	CategoryTotem
)

// Classification does not own GUIDs or observed names. Those remain with the
// caller; canonical entry labels belong to their lookup. Player-specific
// metadata/handling remains distinct from creature classification.
//
// Known is an explicit classification fact, independent of whether a name was
// observed or whether the entity participates in fights. A known critter must
// not be reported as an unknown identity merely because both eligibility flags
// are false. Unknown reporting must also respect a classifier's handled result.
//
// Events are recorded independently of these flags. In particular critters are
// labeled/countable units whose damage and death events remain visible, but they
// never drive fight detection/activity or qualify as ranked-damage targets.
// There is deliberately no flag here permitting event suppression.
// This contract is not yet wired into event processing or ranking publication.
type Classification struct {
	Kind               Kind
	Category           Category
	Known              bool
	TrackFight         bool
	RankedDamageTarget bool
}
