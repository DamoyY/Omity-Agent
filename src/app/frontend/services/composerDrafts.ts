import { beaconComposerDraft, loadComposerDraft, saveComposerDraft } from "./client";
export type ComposerDraftTarget = { kind: "new" } | { kind: "session"; sessionId: string };
export interface LoadedComposerDraft {
  content: string;
  revision: number;
}
const newSessionKey = "omity:composer:new";
export async function readComposerDraft(target: ComposerDraftTarget, fallback: string) {
  if (target.kind === "session") {
    const draft = await loadComposerDraft(target.sessionId);
    return {
      content: draft.content ?? fallback,
      revision: draft.revision,
    };
  }
  return {
    content: window.sessionStorage.getItem(newSessionKey) ?? fallback,
    revision: 0,
  };
}
export function writeComposerDraft(target: ComposerDraftTarget, content: string, revision: number) {
  if (target.kind === "session") {
    return saveComposerDraft(target.sessionId, content, revision);
  }
  window.sessionStorage.setItem(newSessionKey, content);
  return Promise.resolve({ revision: 0 });
}
export function flushComposerDraft(target: ComposerDraftTarget, content: string, revision: number) {
  if (target.kind === "session") {
    if (revision === 0) {
      return true;
    }
    return beaconComposerDraft(target.sessionId, content, revision);
  }
  window.sessionStorage.setItem(newSessionKey, content);
  return true;
}
export function clearTemporaryComposerDraft() {
  window.sessionStorage.removeItem(newSessionKey);
}
