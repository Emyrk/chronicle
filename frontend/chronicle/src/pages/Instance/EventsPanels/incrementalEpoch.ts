/** A cursor tick may be superseded within one context; a replaced context may not publish. */
export class IncrementalEpoch {
  private generation = 0;
  invalidate() { this.generation++; }
  capture(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }
}
