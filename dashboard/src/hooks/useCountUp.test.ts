import { renderHook } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  it("returns the initial value immediately on mount, unanimated", () => {
    const { result } = renderHook(() => useCountUp(42));
    expect(result.current).toBe(42);
  });

  describe("with fake timers", () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: [
          "setTimeout",
          "clearTimeout",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "performance",
        ],
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("eases toward a new value instead of jumping instantly", () => {
      const { result, rerender } = renderHook(
        ({ value }) => useCountUp(value),
        {
          initialProps: { value: 0 },
        },
      );
      expect(result.current).toBe(0);

      rerender({ value: 100 });
      // Immediately after the value changes, the animation has only just
      // started, so the displayed number should not have jumped to 100 yet.
      expect(result.current).toBeLessThan(100);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current).toBe(100);
    });

    it("skips the animation and snaps when the value doesn't change", () => {
      const { result, rerender } = renderHook(
        ({ value }) => useCountUp(value),
        {
          initialProps: { value: 5 },
        },
      );
      rerender({ value: 5 });
      expect(result.current).toBe(5);
    });
  });
});
