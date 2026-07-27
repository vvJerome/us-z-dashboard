import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useJobDownload } from "./useJobDownload";

vi.mock("../api/jobs", () => ({
  fetchJobDownload: vi.fn(),
}));

import { fetchJobDownload } from "../api/jobs";

describe("useJobDownload", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() => useJobDownload());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading=true while fetch is pending", async () => {
    vi.mocked(fetchJobDownload).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useJobDownload());

    act(() => {
      result.current.download("job-1", "records.jsonl");
    });

    await waitFor(() => expect(result.current.loading).toBe(true));
  });

  it("resets to loading=false and error=null after successful fetch", async () => {
    // Suppress the a.click() DOM side-effect — untestable in jsdom
    vi.mocked(fetchJobDownload).mockResolvedValue({
      url: "/api/jobs/job-1/file",
    });

    const { result } = renderHook(() => useJobDownload());
    await act(() => result.current.download("job-1", "records.jsonl"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error message and loading=false when fetch fails", async () => {
    vi.mocked(fetchJobDownload).mockRejectedValue(new Error("timeout"));
    const { result } = renderHook(() => useJobDownload());

    await act(() => result.current.download("job-1", "records.jsonl"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("timeout");
  });

  it("calls fetchJobDownload with the correct job ID", async () => {
    vi.mocked(fetchJobDownload).mockResolvedValue({
      url: "/api/jobs/job-2/file",
    });
    const { result } = renderHook(() => useJobDownload());

    await act(() => result.current.download("job-2", "output.csv"));

    expect(fetchJobDownload).toHaveBeenCalledWith("job-2");
  });
});
