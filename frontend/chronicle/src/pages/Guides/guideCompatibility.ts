export function expectedGuideGame(serverName: string): string {
  return serverName === "turtle" ? "turtle-wow" : `${serverName}-wow`;
}

export function assertGuideCompatibility(game: string, serverName: string): void {
  const expected = expectedGuideGame(serverName);
  if (game !== expected) throw new Error(`Guide targets ${game}, but this Chronicle tenant runs ${expected}.`);
}
