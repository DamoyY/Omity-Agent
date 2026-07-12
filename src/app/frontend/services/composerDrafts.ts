export type ComposerDraftTarget =
  { kind: "new" } | { kind: "session"; sessionId: string };

interface DraftStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface DraftStores {
  persistent: DraftStorage;
  temporary: DraftStorage;
}

const newSessionKey = "omity:composer:new";
const sessionKeyPrefix = "omity:composer:session:";

export function readComposerDraft(
  target: ComposerDraftTarget,
  fallback: string,
  stores = browserStores(),
) {
  return storage(target, stores).getItem(key(target)) ?? fallback;
}

export function writeComposerDraft(
  target: ComposerDraftTarget,
  content: string,
  stores = browserStores(),
) {
  storage(target, stores).setItem(key(target), content);
}

export function clearComposerDraft(
  target: ComposerDraftTarget,
  stores = browserStores(),
) {
  storage(target, stores).removeItem(key(target));
}

function browserStores(): DraftStores {
  return {
    persistent: window.localStorage,
    temporary: window.sessionStorage,
  };
}

function storage(target: ComposerDraftTarget, stores: DraftStores) {
  return target.kind === "session" ? stores.persistent : stores.temporary;
}

function key(target: ComposerDraftTarget) {
  return target.kind === "session"
    ? `${sessionKeyPrefix}${target.sessionId}`
    : newSessionKey;
}
