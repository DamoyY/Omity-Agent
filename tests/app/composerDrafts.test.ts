import { expect, test } from "bun:test";
import {
  clearComposerDraft,
  readComposerDraft,
  writeComposerDraft,
  type ComposerDraftTarget,
} from "../../src/app/frontend/services/composerDrafts";

test("session drafts persist independently in persistent storage", () => {
  const stores = draftStores();
  const first = session("first");
  const second = session("second");

  writeComposerDraft(first, "first draft", stores);
  writeComposerDraft(second, "second draft", stores);

  expect(readComposerDraft(first, "", stores)).toBe("first draft");
  expect(readComposerDraft(second, "", stores)).toBe("second draft");
  expect(stores.temporary.size).toBe(0);
});

test("new-session draft uses temporary storage", () => {
  const stores = draftStores();
  const target = { kind: "new" } as const;

  writeComposerDraft(target, "temporary draft", stores);

  expect(readComposerDraft(target, "", stores)).toBe("temporary draft");
  expect(stores.persistent.size).toBe(0);
});

test("stored empty drafts override defaults until cleared", () => {
  const stores = draftStores();
  const target = session("fork");

  writeComposerDraft(target, "", stores);
  expect(readComposerDraft(target, "server draft", stores)).toBe("");

  clearComposerDraft(target, stores);
  expect(readComposerDraft(target, "server draft", stores)).toBe(
    "server draft",
  );
});

function session(sessionId: string): ComposerDraftTarget {
  return { kind: "session", sessionId };
}

function draftStores() {
  return {
    persistent: new MemoryStorage(),
    temporary: new MemoryStorage(),
  };
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get size() {
    return this.values.size;
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
