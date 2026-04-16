import { useEffect, useLayoutEffect, useRef, type RefObject, type UIEventHandler } from "react";

import { resolvePinnedBottomState } from "../lib/scroll-pinning";
import { selectTranscriptViewportState, useTerminalViewStore } from "../state/terminal-view-store";

interface UseTranscriptViewportOptions {
  tabId: string;
  contentKey: unknown;
}

interface TranscriptViewportController {
  scrollRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  isPinnedBottom: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
  jumpToLatest: () => void;
}

const OBSERVER_ROOT_MARGIN = "0px 0px 12px 0px";

export function useTranscriptViewport({
  tabId,
  contentKey,
}: UseTranscriptViewportOptions): TranscriptViewportController {
  const updateTranscriptViewport = useTerminalViewStore((state) => state.updateTranscriptViewport);
  const resolvedViewport = useTerminalViewStore((state) => selectTranscriptViewportState(state.tabStates, tabId));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const manualJumpPendingRef = useRef(false);
  const isInitialMountRef = useRef(true);
  const prevIsPinnedBottomRef = useRef(resolvedViewport.isPinnedBottom);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    const prevIsPinnedBottom = prevIsPinnedBottomRef.current;
    prevIsPinnedBottomRef.current = resolvedViewport.isPinnedBottom;

    const isInitialMount = isInitialMountRef.current;

    if (isInitialMount) {
      isInitialMountRef.current = false;
      if (resolvedViewport.isPinnedBottom) {
        node.scrollTop = node.scrollHeight;
      } else {
        node.scrollTop = Math.max(0, resolvedViewport.scrollTop);
      }
    } else if (resolvedViewport.isPinnedBottom) {
      node.scrollTop = node.scrollHeight;
    }

    if (node.clientHeight <= 0) {
      return;
    }

    const actualScrollTop = node.scrollTop;
    const distanceFromBottom = node.scrollHeight - actualScrollTop - node.clientHeight;
    const nextPinned = resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current);

    if (nextPinned) {
      manualJumpPendingRef.current = false;
    }

    if (nextPinned !== resolvedViewport.isPinnedBottom) {
      updateTranscriptViewport(tabId, {
        scrollTop: actualScrollTop,
        isPinnedBottom: nextPinned,
      });
    }
  }, [contentKey, resolvedViewport.isPinnedBottom, tabId, updateTranscriptViewport]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !resolvedViewport.isPinnedBottom) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom < 100) {
      node.scrollTop = node.scrollHeight;
      updateTranscriptViewport(tabId, {
        scrollTop: node.scrollTop,
      });
    }
  }, [contentKey, resolvedViewport.isPinnedBottom, tabId, updateTranscriptViewport]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = scrollRef.current;
    const target = bottomRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }

        const distanceFromBottom = root.scrollHeight - root.scrollTop - root.clientHeight;
        const nextPinned = entry.isIntersecting
          ? resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current)
          : false;

        if (entry.isIntersecting) {
          manualJumpPendingRef.current = false;
        }

        updateTranscriptViewport(tabId, {
          isPinnedBottom: nextPinned,
          scrollTop: root.scrollTop,
        });
      },
      {
        root,
        rootMargin: OBSERVER_ROOT_MARGIN,
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [tabId, updateTranscriptViewport]);

  const onScroll: UIEventHandler<HTMLDivElement> = (event) => {
    const node = event.currentTarget;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nextPinned = resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current);
    manualJumpPendingRef.current = false;
    updateTranscriptViewport(tabId, {
      scrollTop: node.scrollTop,
      isPinnedBottom: nextPinned,
    });
  };

  const jumpToLatest = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }

    manualJumpPendingRef.current = true;
    bottomRef.current?.scrollIntoView({ block: "end" });
    node.scrollTop = node.scrollHeight;
    updateTranscriptViewport(tabId, {
      isPinnedBottom: true,
      scrollTop: node.scrollTop,
    });
  };

  return {
    scrollRef,
    bottomRef,
    isPinnedBottom: resolvedViewport.isPinnedBottom,
    onScroll,
    jumpToLatest,
  };
}
