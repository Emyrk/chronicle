package chroniclesdk

type ConsumableEffectKind string

const (
	ConsumableEffectKindBuff   ConsumableEffectKind = "buff"
	ConsumableEffectKindDirect ConsumableEffectKind = "direct"
)

type SetConsumableDisambiguationRequest struct {
	ItemID int32 `json:"item_id"`
}

type ConsumableDisambiguation struct {
	EffectKind ConsumableEffectKind `json:"effect_kind"`
	SpellID    int32                `json:"spell_id"`
	ItemID     int32                `json:"item_id"`
}

type ConsumableEffectPolicy struct {
	EffectKind ConsumableEffectKind `json:"effect_kind"`
	SpellID    int32                `json:"spell_id"`
	ItemID     *int32               `json:"item_id,omitempty"`
	Ignored    bool                 `json:"ignored"`
}
