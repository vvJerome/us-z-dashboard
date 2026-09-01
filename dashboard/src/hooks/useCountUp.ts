import { useEffect, useRef, useState } from "react";

const DURATION_MS = 600;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

// Eases the displayed value toward `value` instead of snapping instantly,
// so a 10s poll tick reads as a smooth update rather than a flicker.
export function useCountUp(value: number, durationMs = DURATION_MS): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (value === fromRef.current || prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();
    let raf = requestAnimationFrame(tick);

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + delta * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }

    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}
