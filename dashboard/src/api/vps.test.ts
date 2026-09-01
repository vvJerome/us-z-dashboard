import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ request: vi.fn().mockResolvedValue([]) }));

import { request } from "./client";
import { fetchVpsList } from "./vps";

describe("vps api", () => {
  it("fetchVpsList calls the base endpoint", async () => {
    await fetchVpsList();
    expect(request).toHaveBeenCalledWith("/api/vps");
  });
});
