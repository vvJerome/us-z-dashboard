import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { useCreateZeroBounceJob, useZeroBounceJobs } from "./useZeroBounce";

vi.mock("../api/zerobounce", () => ({
  fetchZeroBounceJobs: vi.fn().mockResolvedValue([]),
  createZeroBounceJob: vi
    .fn()
    .mockResolvedValue({ id: "zb-1", status: "QUEUED" }),
}));

import { createZeroBounceJob, fetchZeroBounceJobs } from "../api/zerobounce";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useZeroBounceJobs", () => {
  it("calls fetchZeroBounceJobs on mount", async () => {
    renderHook(() => useZeroBounceJobs(), { wrapper });
    await waitFor(() =>
      expect(vi.mocked(fetchZeroBounceJobs)).toHaveBeenCalledOnce(),
    );
  });

  it("returns jobs from the API", async () => {
    vi.mocked(fetchZeroBounceJobs).mockResolvedValue([
      {
        id: "zb-1",
        status: "COMPLETED",
        input_filename: "emails.csv",
        filter_mode: "all",
        email_col: "email",
        email_count: 10,
        processed_count: 10,
        output_file_key: "zerobounce/zb-1/output.csv",
        error_message: null,
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
      },
    ]);

    const { result } = renderHook(() => useZeroBounceJobs(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].id).toBe("zb-1");
  });
});

describe("useCreateZeroBounceJob", () => {
  it("calls createZeroBounceJob with file and email column on mutate", async () => {
    const { result } = renderHook(() => useCreateZeroBounceJob(), { wrapper });
    const file = new File(["a,b"], "emails.csv");

    await act(async () => {
      await result.current.mutateAsync({ file, emailCol: "email_address" });
    });

    expect(vi.mocked(createZeroBounceJob)).toHaveBeenCalledWith(
      file,
      "email_address",
    );
  });
});
