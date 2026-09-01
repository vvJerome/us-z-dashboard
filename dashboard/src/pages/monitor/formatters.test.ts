import { describe, expect, it } from "vitest";
import { fmt, fmtPct, relativeTime } from "./formatters";

describe("fmt", () => {
  it("formats numbers with locale separators", () => {
    expect(fmt(12345)).toBe((12345).toLocaleString());
  });

  it("renders N/A for null/undefined", () => {
    expect(fmt(null)).toBe("N/A");
    expect(fmt(undefined)).toBe("N/A");
  });

  it("formats zero as 0, not N/A", () => {
    expect(fmt(0)).toBe("0");
  });
});

describe("fmtPct", () => {
  it("formats a percentage to one decimal place", () => {
    expect(fmtPct(42.567)).toBe("42.6%");
  });

  it("renders N/A for null/undefined", () => {
    expect(fmtPct(null)).toBe("N/A");
    expect(fmtPct(undefined)).toBe("N/A");
  });
});

describe("relativeTime", () => {
  it("renders N/A for a missing timestamp", () => {
    expect(relativeTime(null)).toBe("N/A");
    expect(relativeTime(undefined)).toBe("N/A");
  });

  it("renders seconds for a recent timestamp", () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
    expect(relativeTime(tenSecondsAgo)).toMatch(/^\d+s$/);
  });

  it("renders minutes for a timestamp under an hour old", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(fiveMinutesAgo)).toMatch(/^\d+m$/);
  });

  it("renders hours for a timestamp under a day old", () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(relativeTime(threeHoursAgo)).toMatch(/^\d+h$/);
  });

  it("treats a space-separated, Z-less timestamp as UTC", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    expect(relativeTime(fiveMinutesAgo)).toMatch(/^\d+m$/);
  });
});
