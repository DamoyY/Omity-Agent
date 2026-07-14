import { type ComposerDraftTarget, writeComposerDraft } from "../composerDrafts";
interface DraftSnapshot {
  content: string;
  revision: number;
}
type PersistDraft = (
  target: ComposerDraftTarget,
  content: string,
  revision: number,
) => Promise<unknown>;
export class DraftSaver {
  private pending?: DraftSnapshot;
  private timer?: ReturnType<typeof setTimeout>;
  private tail = Promise.resolve();
  constructor(
    private readonly target: ComposerDraftTarget,
    private readonly delayMs: number,
    private readonly onError: (error: unknown) => void,
    private readonly persist: PersistDraft = writeComposerDraft,
  ) {}
  schedule(content: string, revision: number) {
    this.pending = { content, revision };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.persistPending();
    }, this.delayMs);
  }
  discardPending() {
    this.clearTimer();
    this.pending = undefined;
  }
  flush() {
    this.clearTimer();
    this.persistPending();
    return this.tail;
  }
  private clearTimer() {
    if (this.timer === undefined) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
  }
  private persistPending() {
    const snapshot = this.pending;
    if (!snapshot) {
      return;
    }
    this.pending = undefined;
    this.tail = this.persistAfter(this.tail, snapshot);
  }
  private async persistAfter(previous: Promise<unknown>, snapshot: DraftSnapshot) {
    await previous;
    try {
      await this.persist(this.target, snapshot.content, snapshot.revision);
    } catch (error: unknown) {
      this.onError(error);
    }
  }
}
