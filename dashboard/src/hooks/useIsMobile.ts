import { useEffect, useState } from "react";

// Matches Tailwind's `md` breakpoint (768px) - the same width the sidebar
// primitive used to use for its now-removed `hidden md:flex` split. Tracked
// via matchMedia so it reacts to viewport/orientation changes, not just the
// value at mount (a phone rotated from portrait to landscape, or a resized
// browser window, should update this without a reload).
const QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
