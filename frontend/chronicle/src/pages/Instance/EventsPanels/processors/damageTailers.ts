import { hasHitType, HitTypeFullAbsorb, HitTypePartialAbsorb } from "@/lib/hittype/hittype";
import type { DamageProcessorEvent } from "../processorTypes";

/** Sum damage prevented by absorb effects attached to a damage event. */
export function absorbedDamageFromTailers(event: DamageProcessorEvent): number {
  let absorbed = 0;
  for (let i = 0; i < event.tailerCount; i++) {
    const tailer = event.tailers[i];
    if (hasHitType(tailer.hitType, HitTypePartialAbsorb) || hasHitType(tailer.hitType, HitTypeFullAbsorb)) {
      absorbed += tailer.amount;
    }
  }
  return absorbed;
}
