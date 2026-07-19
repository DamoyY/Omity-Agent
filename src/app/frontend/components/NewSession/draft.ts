import {
  clearTemporaryComposerDraft,
  flushComposerDraft,
  readComposerDraft,
} from "../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../services/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { DraftSaver } from "../../services/scheduling/draftSaver";

const target = { kind: "new" } as const;
export function useNewSessionDraft(saveDelayMs?: number) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const contentRef = useRef(content);
  const revisionRef = useRef(0);
  const saverRef = useRef<DraftSaver | undefined>(undefined);
  useEffect(() => {
    let current = true;
    const load = async () => {
      const loaded = await readComposerDraft(target, "");
      if (!current) {
        return;
      }
      contentRef.current = loaded.content;
      revisionRef.current = loaded.revision;
      setContent(loaded.content);
      setLoading(false);
    };
    reportPromiseErrors(load());
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    const saver = new DraftSaver(target, saveDelayMs ?? 0, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) {
        saverRef.current = undefined;
      }
      reportPromiseErrors(saver.flush());
    };
  }, [saveDelayMs]);
  useEffect(() => {
    const flush = () => {
      flushComposerDraft(target, contentRef.current, revisionRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  const update = useCallback((nextContent: string) => {
    if (nextContent === contentRef.current) {
      return;
    }
    contentRef.current = nextContent;
    revisionRef.current += 1;
    setContent(nextContent);
    saverRef.current?.schedule(nextContent, revisionRef.current);
  }, []);
  const flush = useCallback(() => saverRef.current?.flush() ?? Promise.resolve(), []);
  const clear = useCallback(() => {
    saverRef.current?.discardPending();
    clearTemporaryComposerDraft();
    contentRef.current = "";
    revisionRef.current = 0;
    setContent("");
  }, []);
  return { clear, content, flush, loading, update };
}
