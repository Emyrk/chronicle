export type AdRequestState = "pending" | "filled" | "no_fill" | "error"

export interface AdRequestSnapshot {
  key: string
  state: AdRequestState
}

export function adRequestStateForKey(snapshot: AdRequestSnapshot | undefined, requestKey: string): AdRequestState {
  return snapshot?.key === requestKey ? snapshot.state : "pending"
}

export function adFallbackPresentation(state: AdRequestState) {
  const interactive = state === "no_fill"
  return {
    visible: state !== "filled",
    interactive,
    ariaHidden: !interactive,
    inert: !interactive,
  }
}
