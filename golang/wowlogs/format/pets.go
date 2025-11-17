package format

type pets struct {
	// owner -> pet
	ownerToPet map[string]string
	// pet -> owner
	petToOwner map[string]string
}

func newPets() *pets {
	return &pets{
		ownerToPet: make(map[string]string),
		petToOwner: make(map[string]string),
	}
}

func (p *pets) AddPet(owner string, pet string) {
	p.petToOwner[pet] = owner
	p.ownerToPet[owner] = pet
}
