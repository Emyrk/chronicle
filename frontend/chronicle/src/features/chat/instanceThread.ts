export function shouldCreateInstanceThread(input: {
  open: boolean;
  allowed: boolean;
  ready: boolean;
  hasData: boolean;
  pending: boolean;
  error: boolean;
}): boolean {
  return input.open && input.allowed && input.ready && !input.hasData && !input.pending && !input.error;
}
