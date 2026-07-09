import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { DisplayQueue, TimelineMessage } from "../../timeline";
import { scroll } from "../design";

const followBottomThreshold = 48;

function isNearBottom(element: HTMLElement) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    followBottomThreshold
  );
}

export function TranscriptScroll({
  activeId,
  children,
  queue,
  view,
}: {
  activeId: string;
  children: ReactNode;
  queue: DisplayQueue[];
  view: TimelineMessage[];
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const followTailRef = useRef(true);

  useLayoutEffect(() => {
    followTailRef.current = true;
  }, [activeId]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !followTailRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [queue, view]);

  return (
    <section
      className={scroll}
      ref={scrollRef}
      onScroll={(event) => {
        followTailRef.current = isNearBottom(event.currentTarget);
      }}
    >
      {children}
    </section>
  );
}
