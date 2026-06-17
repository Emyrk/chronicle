package creatures

import (
	"github.com/Emyrk/chronicle/combatlog/parser/guid"

	"github.com/Emyrk/chronicle/combatlog/parser/common/characters"
)

func NewKarrsh(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 62934 {
		return nil, false
	}
	return characters.NewPermanentDeath(characters.NewCommonCharacter(id, all)), true
}

func NewSelenaxxFoulheart(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(62940,
		59816, // Corrupted Draenethyst Geode
	)(id, all)
}

func NewChieftainPartath(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(62941,
		62942, // Illuminator
	)(id, all)
}

func NewOrmanos(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(62935,
		51608, // Tremor
		51609, // Son of Ormanos
	)(id, all)
}

func NewUrsol(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(62947,
		29481, // Ursan Horror
		29482, // Nightmare Fiend
	)(id, all)
}

func NewNightmareFiend(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 29482 {
		return nil, false
	}
	return characters.NewCommonCharacter(id, all).WithTimeoutAsDeath(), true
}

func NewVileSkitterer(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	if entry, ok := id.GetEntry(); !ok || entry != 62874 {
		return nil, false
	}
	return characters.NewPermanentDeath(characters.NewCommonCharacter(id, all)), true
}

func NewLoktanagTheVile(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(2139, 2141)(id, all)
}

func NewPerotharn(id guid.GUID, all *characters.Characters) (characters.Character, bool) {
	return characters.NewAdsGoWithBoss(60686, 60684)(id, all)
}
