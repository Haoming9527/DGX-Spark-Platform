"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// Separate thresholds avoid toggling follow near the bottom.
const UNPIN_PX = 100;
const REPIN_PX = 40;

export function useChatStickScroll(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  enabled = true,
) {
  const [stuckToBottom, setStuckToBottom] = useState(true);
  const stuckRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  const cancelPending = useCallback(() => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const setStuck = useCallback(
    (next: boolean) => {
      stuckRef.current = next;
      if (!next) cancelPending();
      setStuckToBottom((prev) => (prev === next ? prev : next));
    },
    [cancelPending],
  );

  const followIfStuck = useCallback(() => {
    if (!enabled || !stuckRef.current) return;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollerRef.current;
      if (!el || !stuckRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [scrollerRef, enabled]);

  const pinToBottom = useCallback(() => {
    setStuck(true);
    cancelPending();
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    else followIfStuck();
  }, [cancelPending, followIfStuck, scrollerRef, setStuck]);

  const jumpToBottom = useCallback(() => {
    setStuck(true);
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    window.setTimeout(() => {
      if (stuckRef.current && scrollerRef.current) {
        scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      }
    }, 400);
  }, [scrollerRef, setStuck]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el) return;

    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight;

    const onScroll = () => {
      const d = distance();
      if (stuckRef.current) {
        if (d > UNPIN_PX) setStuck(false);
      } else if (d < REPIN_PX) {
        setStuck(true);
      }
    };

    // Unpin before a pending animation frame can move the viewport.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) setStuck(false);
    };

    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? touchY;
      if (y - touchY > 4) setStuck(false);
      touchY = y;
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });

    let ro: ResizeObserver | null = null;
    if (content && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        followIfStuck();
      });
      ro.observe(content);
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      ro?.disconnect();
      cancelPending();
    };
  }, [scrollerRef, contentRef, setStuck, followIfStuck, cancelPending, enabled]);

  return { stuckToBottom, jumpToBottom, pinToBottom };
}
