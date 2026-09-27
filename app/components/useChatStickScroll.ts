"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Leave follow when this far from bottom; rejoin only when this close. */
const UNPIN_PX = 100;
const REPIN_PX = 40;

/**
 * ChatGPT / Claude stick-scroll:
 * - Follow while pinned to the bottom.
 * - Wheel/touch up unpins immediately; streaming must not yank the viewport.
 * - Resume via ↓ button or scrolling within REPIN_PX of the bottom.
 * - Content growth is followed only via ResizeObserver (not per-token calls).
 */
export function useChatStickScroll(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
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
    if (!stuckRef.current) return;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollerRef.current;
      if (!el || !stuckRef.current) return;
      el.scrollTop = el.scrollHeight;
    });
  }, [scrollerRef]);

  /** Send / retry / clear — pin and snap to latest. */
  const pinToBottom = useCallback(() => {
    setStuck(true);
    cancelPending();
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    else followIfStuck();
  }, [cancelPending, followIfStuck, scrollerRef, setStuck]);

  /** ↓ control — pin and smooth-scroll once. */
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

    // Unpin before any follow rAF can run — never gated on programmatic flags.
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
  }, [scrollerRef, contentRef, setStuck, followIfStuck, cancelPending]);

  return { stuckToBottom, jumpToBottom, pinToBottom };
}
