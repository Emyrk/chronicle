import { Component, type ErrorInfo, type ReactNode } from "react";

export class CustomPanelErrorBoundary extends Component<{ children: ReactNode; fallback: (error: Error) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Custom panel failed", error, info); }
  render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children; }
}
