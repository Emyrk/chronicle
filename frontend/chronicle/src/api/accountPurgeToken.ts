// Session-scoped: survives a reload and logout, but never enters a URL or persistent storage.
const key = (purgeID: string) => `account-purge-token:${purgeID}`;

export function saveAccountPurgeToken(purgeID: string, token: string) {
  window.sessionStorage.setItem(key(purgeID), token);
}

export function getAccountPurgeToken(purgeID: string): string | null {
  return window.sessionStorage.getItem(key(purgeID));
}
