import type { LiveSessionStatus } from "./LiveSessionContext";

interface InstanceNavigationGuardState {
  layoutEditing: boolean;
  hasUnsavedLayoutEdits: boolean;
  liveSessionStatus: LiveSessionStatus;
}

export function instanceNavigationWarning({
  layoutEditing,
  hasUnsavedLayoutEdits,
  liveSessionStatus,
}: InstanceNavigationGuardState): string | null {
  const hasLayoutEdit = layoutEditing || hasUnsavedLayoutEdits;
  const hasLiveSession = liveSessionStatus === "connecting" || liveSessionStatus === "live";

  if (hasLayoutEdit && hasLiveSession) {
    return "Leave this page? Your layout edit will be lost, and you will leave the live session.";
  }
  if (hasLayoutEdit) return "Leave this page? Your layout edit will be lost.";
  if (hasLiveSession) return "Leave this page and the live session?";
  return null;
}
