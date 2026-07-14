import {
  type ReactNode,
  type RefObject,
  type UIEventHandler,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import type { TimelineMessage } from "../../timeline";
import { scroll } from "../design";
const followBottomThreshold = 48;
function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= followBottomThreshold;
}
export function useFollowBottom<T extends HTMLElement>({
  enabled = true,
  ref,
  resetKey,
  version,
}: {
  enabled?: boolean;
  ref: RefObject<T | null>;
  resetKey?: unknown;
  version: unknown;
}) {
  const followingRef = useRef(true);
  useLayoutEffect(() => {
    followingRef.current = true;
  }, [resetKey]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !followingRef.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [enabled, ref, resetKey, version]);
  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    followingRef.current = isNearBottom(event.currentTarget);
  }, []);
  return onScroll;
}
export function TranscriptScroll({
  activeId,
  children,
  view,
}: {
  activeId: string;
  children: ReactNode;
  view: TimelineMessage[];
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const onScroll = useFollowBottom({
    ref: scrollRef,
    resetKey: activeId,
    version: view,
  });
  return (
    <section className={scroll} ref={scrollRef} onScroll={onScroll}>
      {children}
    </section>
  );
}
