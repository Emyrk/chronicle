export type LivePresenceSurfaceParticipants = Readonly<Record<string, readonly string[]>>;

/** Moves one remote participant between panel-owned presence surfaces. */
export function moveLivePresenceParticipant(
  current: LivePresenceSurfaceParticipants,
  participantId: string,
  previousSurface: string | undefined,
  nextSurface: string | undefined,
): LivePresenceSurfaceParticipants {
  if (previousSurface === nextSurface) return current;

  const next: Record<string, readonly string[]> = { ...current };
  if (previousSurface) {
    const remaining = (current[previousSurface] ?? []).filter((id) => id !== participantId);
    if (remaining.length > 0) next[previousSurface] = remaining;
    else delete next[previousSurface];
  }
  if (nextSurface) {
    const occupants = next[nextSurface] ?? [];
    if (!occupants.includes(participantId)) {
      next[nextSurface] = [...occupants, participantId].sort();
    }
  }
  return next;
}
