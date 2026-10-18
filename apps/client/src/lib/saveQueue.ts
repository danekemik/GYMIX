/** Serializes saves and coalesces edits made while a previous snapshot is saving.
 * A flush resolves only after the latest submitted snapshot is durable. */
export class SaveQueue<T> {
  private latest: T | undefined;
  private version = 0;
  private saved = 0;
  private pending: Promise<void> | undefined;
  constructor(private readonly save: (value: T) => Promise<void>) {}
  update(value: T) {
    if (value === this.latest) return;
    this.latest = value;
    this.version++;
  }
  flush(): Promise<void> {
    if (this.pending) return this.pending;
    const run = async () => {
      while (this.saved < this.version) {
        const version = this.version;
        await this.save(this.latest!);
        this.saved = version;
      }
    };
    const pending = run().finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }
}
