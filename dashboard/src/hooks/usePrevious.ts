import { useEffect, useRef } from "react";

// Captures the value from the render before the current one - lets a
// polling panel show "since last poll" deltas without threading history
// through the API response itself.
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
