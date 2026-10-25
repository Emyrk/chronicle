interface EncounterSidebarAdState {
  isMobile: boolean;
  showChronological: boolean;
  trashOpen: boolean;
  totalTrash: number;
}

export function shouldShowEncounterSidebarAd({
  isMobile,
  showChronological,
  trashOpen,
  totalTrash,
}: EncounterSidebarAdState): boolean {
  return !isMobile && !showChronological && totalTrash > 0 && !trashOpen;
}
