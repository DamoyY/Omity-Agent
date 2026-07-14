export class RefreshScheduler {
  private lastStarted = 0;
  private queued = false;
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private readonly intervalMs: number,
    private readonly refresh: () => Promise<unknown>,
    private readonly onError: (error: unknown) => void,
  ) {}
  request() {
    this.queued = true;
    if (this.running || this.timer !== undefined) {
      return;
    }
    const elapsed = Date.now() - this.lastStarted;
    const delay = Math.max(0, this.intervalMs - elapsed);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.run();
    }, delay);
  }
  dispose() {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = undefined;
    this.queued = false;
  }
  private async run() {
    if (!this.queued) {
      return;
    }
    this.queued = false;
    this.running = true;
    this.lastStarted = Date.now();
    try {
      await this.refresh();
    } catch (error) {
      this.onError(error);
    } finally {
      this.running = false;
      if (this.hasQueuedRequest()) {
        this.request();
      }
    }
  }
  private hasQueuedRequest() {
    return this.queued;
  }
}
