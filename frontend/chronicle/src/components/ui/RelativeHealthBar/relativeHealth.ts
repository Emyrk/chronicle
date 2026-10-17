export type RelativeHealthMessageKind = "damage" | "healing" | "prevented" | "health";

export interface RelativeHealthMessage {
  id: string;
  timestamp: number;
  sequence: number;
  kind: RelativeHealthMessageKind;
  /** Gross damage or healing amount represented by the message. */
  amount: number;
  /** Healing that did not change health. */
  overheal?: number;
  /** Damage prevented by absorbs or other mitigation. */
  prevented?: number;
  /** Exact health values sampled from the unit-resources stream. */
  currentHealth?: number;
  maximumHealth?: number;
}

export interface RelativeHealthTransition {
  kind: "damage" | "healing";
  from: number;
  to: number;
  amount: number;
  overheal: number;
  prevented: number;
}

export interface RelativeHealthState {
  current: number;
  minimum: number;
  maximum: number;
  damage: number;
  effectiveHealing: number;
  prevented: number;
  overhealing: number;
  lastTransition: RelativeHealthTransition | null;
  /** True once an exact unit-resources health sample has anchored the state. */
  actualHealth?: boolean;
  /** Latest sampled maximum health, when actualHealth is true. */
  maximumHealth?: number | null;
}

export function calculateRelativeHealth(messages: RelativeHealthMessage[]): RelativeHealthState {
  const ordered = [...messages].sort(
    (a, b) => a.timestamp - b.timestamp || a.sequence - b.sequence || a.id.localeCompare(b.id),
  );

  let current = 0;
  let minimum = 0;
  let maximum = 0;
  let damage = 0;
  let effectiveHealing = 0;
  let prevented = 0;
  let overhealing = 0;
  let lastTransition: RelativeHealthTransition | null = null;
  let actualHealth = false;
  let maximumHealth: number | null = null;

  for (const message of ordered) {
    const amount = Math.max(0, message.amount);
    const messagePrevented = Math.max(0, message.prevented ?? 0);

    if (message.kind === "health") {
      const sampledCurrent = Math.max(0, message.currentHealth ?? amount);
      const sampledMaximum = Math.max(sampledCurrent, message.maximumHealth ?? sampledCurrent);
      const correction = sampledCurrent - current;
      current = sampledCurrent;
      maximumHealth = sampledMaximum;
      if (!actualHealth) {
        minimum = sampledCurrent;
        maximum = sampledCurrent;
        actualHealth = true;
      }
      const transition = lastTransition as RelativeHealthTransition | null;
      if (transition && correction !== 0) {
        lastTransition = {
          ...transition,
          from: transition.from + correction,
          to: transition.to + correction,
        };
      }
    } else if (message.kind === "damage") {
      // Combat-log damage amounts are health actually lost. Prevented damage is
      // contextual information and must not be subtracted from the movement.
      const from = current;
      current = actualHealth ? Math.max(0, current - amount) : current - amount;
      damage += amount;
      prevented += messagePrevented;
      if (amount > 0 || messagePrevented > 0) {
        lastTransition = {
          kind: "damage",
          from,
          to: current,
          amount,
          overheal: 0,
          prevented: messagePrevented,
        };
      }
    } else if (message.kind === "healing") {
      const messageOverheal = Math.min(amount, Math.max(0, message.overheal ?? 0));
      const healing = Math.max(0, amount - messageOverheal);
      const from = current;
      current = actualHealth && maximumHealth !== null
        ? Math.min(maximumHealth, current + healing)
        : current + healing;
      effectiveHealing += healing;
      overhealing += messageOverheal;
      if (healing > 0 || messageOverheal > 0) {
        lastTransition = {
          kind: "healing",
          from,
          to: current,
          amount: healing,
          overheal: messageOverheal,
          prevented: 0,
        };
      }
    } else {
      prevented += amount;
    }

    minimum = Math.min(minimum, current);
    maximum = Math.max(maximum, current);
  }

  return {
    current,
    minimum,
    maximum,
    damage,
    effectiveHealing,
    prevented,
    overhealing,
    lastTransition,
    actualHealth,
    maximumHealth,
  };
}
