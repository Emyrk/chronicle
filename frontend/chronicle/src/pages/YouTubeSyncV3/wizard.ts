export interface WizardState {
  videoReady: boolean
  captureReady: boolean
  clockReady: boolean
  syncReady: boolean
}

export function canContinueWizard(step: number, state: WizardState): boolean {
  return [state.videoReady, state.captureReady, state.clockReady, state.syncReady, true][step - 1] ?? false
}

export function nextCompletedWizardStep(step: number, state: WizardState): number {
  if (step === 1 && state.videoReady) return 2
  if (step === 2 && state.captureReady) return 3
  if (step === 3 && state.clockReady) return 4
  if (step === 4 && state.syncReady) return 5
  return step
}
