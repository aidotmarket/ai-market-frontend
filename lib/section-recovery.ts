// A section gets one automatic re-read during a visit. A returned 401 has
// exhausted transport recovery; only explicit user action may read again.
export class SectionRecovery {
  private used = false;
  private blocked = false;
  private changed = false;
  reset() { this.used = false; this.blocked = false; this.changed = false; }
  sessionChanged() { this.changed = true; }
  get stopped() { return this.blocked; }
  recover(error: unknown): boolean {
    const failure = error as { status?: number; response?: { status?: number }; config?: { _retry?: boolean }; cause?: unknown } | null;
    const cause = failure?.cause as { config?: { _retry?: boolean } } | undefined;
    if (failure?.status === 401 || failure?.response?.status === 401
        || failure?.config?._retry || cause?.config?._retry) this.blocked = true;
    const recover = !!error && this.changed && !this.used && !this.blocked;
    this.changed = false;
    if (recover) this.used = true;
    return recover;
  }
}
