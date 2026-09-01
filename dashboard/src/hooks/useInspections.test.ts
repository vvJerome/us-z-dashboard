import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import {
  useCreateInspection,
  useDeleteInspection,
  useInspections,
  useSavedInspection,
} from "./useInspections";

vi.mock("../api/inspections", () => ({
  fetchInspections: vi.fn().mockResolvedValue([]),
  fetchInspection: vi.fn(),
  createInspection: vi.fn().mockResolvedValue({ id: "insp-1" }),
  deleteInspection: vi.fn().mockResolvedValue(undefined),
}));

import {
  createInspection,
  deleteInspection,
  fetchInspection,
  fetchInspections,
} from "../api/inspections";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useInspections", () => {
  it("calls fetchInspections on mount", async () => {
    renderHook(() => useInspections(), { wrapper });
    await waitFor(() =>
      expect(vi.mocked(fetchInspections)).toHaveBeenCalledOnce(),
    );
  });
});

describe("useSavedInspection", () => {
  it("does not fetch when id is undefined", () => {
    renderHook(() => useSavedInspection(undefined), { wrapper });
    expect(fetchInspection).not.toHaveBeenCalled();
  });

  it("fetches the saved inspection by id", async () => {
    vi.mocked(fetchInspection).mockResolvedValue({
      id: "insp-1",
      name: "Wisconsin run",
      vps_id: "vps-1",
      db_path: "/data/pipeline.db",
      created_at: new Date().toISOString(),
    });

    const { result } = renderHook(() => useSavedInspection("insp-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchInspection).toHaveBeenCalledWith("insp-1");
    expect(result.current.data?.name).toBe("Wisconsin run");
  });
});

describe("useCreateInspection", () => {
  it("calls createInspection with name, vpsId, and dbPath", async () => {
    const { result } = renderHook(() => useCreateInspection(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        name: "Wisconsin run",
        vpsId: "vps-1",
        dbPath: "/data/pipeline.db",
      });
    });

    expect(createInspection).toHaveBeenCalledWith(
      "Wisconsin run",
      "vps-1",
      "/data/pipeline.db",
    );
  });
});

describe("useDeleteInspection", () => {
  it("calls deleteInspection with the id on mutate", async () => {
    const { result } = renderHook(() => useDeleteInspection(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("insp-1");
    });

    expect(deleteInspection).toHaveBeenCalledWith("insp-1");
  });
});
