export type HistoryDirection = "next" | "previous";

export class UserMessageHistory {
  private draft = "";
  private index: number | undefined;

  navigate(direction: HistoryDirection, current: string, messages: readonly string[]) {
    if (direction === "previous") {
      return this.previous(current, messages);
    }
    return this.next(messages);
  }

  reset() {
    this.draft = "";
    this.index = undefined;
  }

  private previous(current: string, messages: readonly string[]) {
    if (messages.length === 0) return undefined;
    if (this.index === undefined) {
      this.draft = current;
      this.index = messages.length - 1;
    } else if (this.index > 0) {
      this.index -= 1;
    } else {
      return undefined;
    }
    return messages[this.index];
  }

  private next(messages: readonly string[]) {
    if (this.index === undefined) return undefined;
    if (this.index < messages.length - 1) {
      this.index += 1;
      return messages[this.index];
    }
    const draft = this.draft;
    this.reset();
    return draft;
  }
}
