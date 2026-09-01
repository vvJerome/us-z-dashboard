import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useVps } from "./useVps";

vi.mock("../api/vps", () => ({
  fetchVpsList: vi.fn().mockResolvedValue([]),
}));

import { fetchVpsList } from "../api/vps";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useVps", () => {
  it("calls fetchVpsList on mount", async () => {
    renderHook(() => useVps(), { wrapper });
    await waitFor(() => expect(vi.mocked(fetchVpsList)).toHaveBeenCalledOnce());
  });

  it("returns the VPS list from the API", async () => {
    vi.mocked(fetchVpsList).mockResolvedValue([
      {
        id: "vps-1",
        name: "worker-v3",
        is_local: false,
        is_active: true,
        ssh_host: "1.2.3.4",
        ssh_user: "devonly",
        ssh_port: 22,
        data_dir: "/home/devonly/data",
        created_at: new Date().toISOString(),
      },
    ]);

    const { result } = renderHook(() => useVps(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe("worker-v3");
  });
});
